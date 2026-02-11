const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');
const { verifyToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.CLIENT_URL 
        : 'http://localhost:3000',
    credentials: true
}));
app.use(cookieParser());

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api', authRoutes);
app.use('/api', chatRoutes);
app.use('/api', messageRoutes);

app.get('/ping', (req, res) => {
    res.status(200).json({ 
        status: 'alive', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ 
            status: 'ok', 
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            database: 'disconnected',
            error: error.message 
        });
    }
});

const server = app.listen(PORT, () => {
    console.log(`🚀 Chaters server running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
});

const wss = new WebSocket.Server({ server });
const clients = new Map();
const chatRooms = new Map();

wss.on('connection', (ws, req) => {
    let userId = null;
    let currentChat = null;

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'auth':
                    try {
                        const token = message.token;
                        const decoded = jwt.verify(token, process.env.JWT_SECRET);
                        userId = decoded.userId;
                        
                        clients.set(userId, ws);
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
                    
                    if (!chatRooms.has(currentChat)) {
                        chatRooms.set(currentChat, new Set());
                    }
                    chatRooms.get(currentChat).add(ws);
                    
                    ws.chatId = currentChat;
                    break;

                case 'message':
                    if (message.chatId && message.message) {
                        const room = chatRooms.get(message.chatId);
                        if (room) {
                            room.forEach(client => {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({
                                        type: 'message',
                                        message: message.message
                                    }));
                                }
                            });
                        }
                    }
                    break;

                case 'typing':
                    if (message.chatId && userId) {
                        const room = chatRooms.get(message.chatId);
                        if (room) {
                            const userResult = await pool.query(
                                'SELECT nickname FROM users WHERE id = $1',
                                [userId]
                            );
                            
                            room.forEach(client => {
                                if (client !== ws && client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({
                                        type: 'typing',
                                        chatId: message.chatId,
                                        userNickname: userResult.rows[0]?.nickname || 'User'
                                    }));
                                }
                            });
                        }
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
                        const room = chatRooms.get(message.chatId);
                        if (room) {
                            room.forEach(client => {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({
                                        type: 'message_deleted',
                                        messageId: message.messageId,
                                        chatId: message.chatId
                                    }));
                                }
                            });
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        if (userId) {
            clients.delete(userId);
        }
        if (currentChat && chatRooms.has(currentChat)) {
            chatRooms.get(currentChat).delete(ws);
        }
    });
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        pool.end();
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = app;