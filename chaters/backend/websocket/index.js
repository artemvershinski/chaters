const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

class WebSocketServer {
    constructor(server) {
        this.wss = new WebSocket.Server({ server });
        this.clients = new Map();
        this.chatRooms = new Map();
        
        this.init();
    }

    init() {
        this.wss.on('connection', (ws, req) => {
            let userId = null;
            let currentChat = null;

            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data);
                    await this.handleMessage(ws, message, userId, currentChat);
                } catch (error) {
                    console.error('WebSocket message error:', error);
                }
            });

            ws.on('close', () => {
                if (userId) {
                    this.clients.delete(userId);
                }
                if (currentChat && this.chatRooms.has(currentChat)) {
                    this.chatRooms.get(currentChat).delete(ws);
                }
            });
        });
    }

    async handleMessage(ws, message, userId, currentChat) {
        switch (message.type) {
            case 'auth':
                try {
                    const token = message.token;
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    userId = decoded.userId;
                    
                    this.clients.set(userId, ws);
                    ws.userId = userId;
                    
                    ws.send(JSON.stringify({ 
                        type: 'auth_success',
                        userId: userId 
                    }));
                } catch (error) {
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        error: 'Auth failed' 
                    }));
                }
                break;

            case 'join':
                currentChat = message.chatId;
                
                if (!this.chatRooms.has(currentChat)) {
                    this.chatRooms.set(currentChat, new Set());
                }
                this.chatRooms.get(currentChat).add(ws);
                ws.chatId = currentChat;
                break;

            case 'message':
                if (message.chatId && message.message) {
                    this.broadcastToChat(message.chatId, {
                        type: 'message',
                        message: message.message
                    }, ws);
                }
                break;

            case 'typing':
                if (message.chatId && userId) {
                    const userResult = await pool.query(
                        'SELECT nickname FROM users WHERE id = $1',
                        [userId]
                    );
                    
                    this.broadcastToChat(message.chatId, {
                        type: 'typing',
                        chatId: message.chatId,
                        userNickname: userResult.rows[0]?.nickname || 'User'
                    }, ws);
                }
                break;

            case 'read':
                if (message.chatId && userId) {
                    await pool.query(`
                        UPDATE chat_members 
                        SET last_read_at = NOW() 
                        WHERE chat_id = (SELECT id FROM chats WHERE chat_id = $1) 
                        AND user_id = $2
                    `, [message.chatId, userId]);
                }
                break;

            case 'delete':
                if (message.chatId && message.messageId) {
                    this.broadcastToChat(message.chatId, {
                        type: 'message_deleted',
                        messageId: message.messageId,
                        chatId: message.chatId
                    });
                }
                break;
        }
    }

    broadcastToChat(chatId, data, excludeWs = null) {
        const room = this.chatRooms.get(chatId);
        if (room) {
            room.forEach(client => {
                if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        }
    }

    sendToUser(userId, data) {
        const client = this.clients.get(userId);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    }
}

module.exports = WebSocketServer;