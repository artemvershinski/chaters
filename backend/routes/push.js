const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { verifyToken } = require('../middleware/auth');
const webPush = require('web-push');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Настройка VAPID
webPush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@chaters.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// ===== ИНИЦИАЛИЗАЦИЯ ТАБЛИЦЫ =====
router.get('/push/init', async (req, res) => {
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
        
        res.json({ success: true, message: 'Push table initialized' });
    } catch (error) {
        console.error('❌ Push init error:', error);
        res.status(500).json({ error: 'Failed to init push' });
    }
});

// ===== ПОЛУЧИТЬ PUBLIC KEY =====
router.get('/push/vapid-public-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// ===== ПОДПИСАТЬСЯ НА УВЕДОМЛЕНИЯ =====
router.post('/push/subscribe', verifyToken, async (req, res) => {
    try {
        const { endpoint, keys } = req.body;
        const { p256dh, auth } = keys;

        if (!endpoint || !p256dh || !auth) {
            return res.status(400).json({ error: 'Invalid subscription object' });
        }

        // Удаляем старую подписку если есть
        await pool.query(
            'DELETE FROM push_subscriptions WHERE endpoint = $1',
            [endpoint]
        );

        // Сохраняем новую подписку
        await pool.query(
            `INSERT INTO push_subscriptions 
            (user_id, endpoint, p256dh, auth, user_agent) 
            VALUES ($1, $2, $3, $4, $5)`,
            [req.userId, endpoint, p256dh, auth, req.headers['user-agent'] || null]
        );

        res.json({ success: true, message: 'Subscribed successfully' });
    } catch (error) {
        console.error('❌ Subscribe error:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// ===== ОТПИСАТЬСЯ ОТ УВЕДОМЛЕНИЙ =====
router.post('/push/unsubscribe', verifyToken, async (req, res) => {
    try {
        const { endpoint } = req.body;

        await pool.query(
            'DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2',
            [endpoint, req.userId]
        );

        res.json({ success: true, message: 'Unsubscribed successfully' });
    } catch (error) {
        console.error('❌ Unsubscribe error:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

// ===== ОТПРАВИТЬ УВЕДОМЛЕНИЕ В ЧАТ =====
async function sendPushNotificationToChat(chatId, senderName, messageContent, chatName) {
    try {
        // Получаем всех участников чата
        const members = await pool.query(`
            SELECT DISTINCT u.id, u.nickname 
            FROM chat_members cm
            JOIN users u ON cm.user_id = u.id
            WHERE cm.chat_id = $1
        `, [chatId]);

        for (const member of members.rows) {
            // Не отправляем уведомление отправителю
            if (member.nickname === senderName) continue;

            // Получаем подписки пользователя
            const subscriptions = await pool.query(
                'SELECT * FROM push_subscriptions WHERE user_id = $1',
                [member.id]
            );

            const payload = JSON.stringify({
                title: 'Chaters',
                body: `${chatname} | ${senderName}`,
                icon: '/icons/icon-192.png',
                badge: '/icons/badge-72.png',
                data: {
                    url: `/chat.html?id=${encodeURIComponent(chatId)}`,
                    chatId: chatId,
                    timestamp: Date.now()
                }
            });

            for (const sub of subscriptions.rows) {
                try {
                    const pushSubscription = {
                        endpoint: sub.endpoint,
                        keys: {
                            p256dh: sub.p256dh,
                            auth: sub.auth
                        }
                    };

                    await webPush.sendNotification(pushSubscription, payload);
                } catch (pushError) {
                    // Если подписка истекла — удаляем
                    if (pushError.statusCode === 410 || pushError.statusCode === 404) {
                        await pool.query(
                            'DELETE FROM push_subscriptions WHERE endpoint = $1',
                            [sub.endpoint]
                        );
                    }
                    console.error('❌ Push send error:', pushError.message);
                }
            }
        }
    } catch (error) {
        console.error('❌ Send push to chat error:', error);
    }
}

// ===== ТЕСТОВОЕ УВЕДОМЛЕНИЕ (ТОЛЬКО ДЛЯ ТЕСТА) =====
router.post('/push/test', verifyToken, async (req, res) => {
    try {
        const subscriptions = await pool.query(
            'SELECT * FROM push_subscriptions WHERE user_id = $1',
            [req.userId]
        );

        const payload = JSON.stringify({
            title: 'Chaters',
            body: '✅ Уведомления работают!',
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-72.png',
            data: { url: '/' }
        });

        for (const sub of subscriptions.rows) {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };
            await webPush.sendNotification(pushSubscription, payload);
        }

        res.json({ success: true, message: 'Test notification sent' });
    } catch (error) {
        console.error('❌ Test push error:', error);
        res.status(500).json({ error: 'Failed to send test notification' });
    }
});

module.exports = {
    pushRouter: router,
    sendPushNotificationToChat
};
