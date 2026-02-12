const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');
const WebSocketServer = require('./websocket');

// ===== PUSH УВЕДОМЛЕНИЯ =====
const { pushRouter, sendPushNotificationToChat } = require('./routes/push');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.CLIENT_URL 
        : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));
app.use(cookieParser());

// ========== СТАТИКА ==========
const FRONTEND_PATH = path.join(__dirname, '../frontend');
app.use(express.static(FRONTEND_PATH));

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// ========== API МАРШРУТЫ ==========
app.use('/api', authRoutes);
app.use('/api', chatRoutes);
app.use('/api', messageRoutes);
app.use('/api', pushRouter);  // 👈 PUSH API

// ========== ПИНГ И HEALTH ==========
app.get('/ping', (req, res) => {
    res.status(200).json({ 
        status: 'alive', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/health', async (req, res) => {
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

// ========== ЯВНЫЕ МАРШРУТЫ ДЛЯ СТРАНИЦ ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(FRONTEND_PATH, 'dashboard.html'));
});

app.get('/chat.html', (req, res) => {
    res.sendFile(path.join(FRONTEND_PATH, 'chat.html'));
});

// ========== 404 ==========
app.use((req, res) => {
    res.status(404).sendFile(path.join(FRONTEND_PATH, '404.html'));
});

// ========== АВТОСОЗДАНИЕ ТАБЛИЦ ==========
async function initTables() {
    try {
        console.log('🔄 Проверка/создание таблиц...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                nickname VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS chats (
                id SERIAL PRIMARY KEY,
                chat_id VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
                message_ttl INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS chat_members (
                chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_read_at TIMESTAMP,
                PRIMARY KEY (chat_id, user_id)
            );
            
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                user_nickname VARCHAR(20) NOT NULL,
                content TEXT,
                file_url TEXT,
                file_type VARCHAR(50),
                file_name VARCHAR(255),
                file_size INTEGER,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS sessions (
                token VARCHAR(255) PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
            CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);
            CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members(user_id);
            CREATE INDEX IF NOT EXISTS idx_chat_members_chat_id ON chat_members(chat_id);
            CREATE INDEX IF NOT EXISTS idx_chats_chat_id ON chats(chat_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
            CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
        `);
        
        console.log('✅ Таблицы готовы');
        
        // ===== ИНИЦИАЛИЗАЦИЯ ТАБЛИЦЫ PUSH =====
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    endpoint TEXT UNIQUE NOT NULL,
                    p256dh TEXT NOT NULL,
                    auth TEXT NOT NULL,
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_push_user_id ON push_subscriptions(user_id);
                CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint);
            `);
            console.log('✅ Push таблица готова');
        } catch (pushError) {
            console.error('❌ Push table error:', pushError.message);
        }
        
    } catch (err) {
        console.error('❌ Ошибка инициализации БД:', err.message);
    }
}

// ========== ЗАПУСК ==========
initTables().then(() => {
    const server = app.listen(PORT, () => {
        console.log(`🚀 Chaters server running on port ${PORT}`);
        console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`💾 Database: ${process.env.DATABASE_URL ? 'configured' : 'missing'}`);
        console.log(`🔔 Push: ${process.env.VAPID_PUBLIC_KEY ? 'configured' : 'missing VAPID keys'}`);
    });

    const wss = new WebSocketServer(server);

    // Делаем функцию отправки уведомлений доступной в WebSocket
    wss.sendPushNotification = sendPushNotificationToChat;

    process.on('SIGTERM', () => {
        console.log('SIGTERM received, closing server...');
        server.close(() => {
            pool.end();
            console.log('Server closed');
            process.exit(0);
        });
    });

}).catch(err => {
    console.error('💥 Фатальная ошибка:', err);
    process.exit(1);
});

module.exports = app;
