const express = require('express');
const { Pool } = require('pg');
const { verifyToken } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

router.get('/chats', verifyToken, async (req, res) => {
    try {
        const chats = await pool.query(`
            SELECT 
                c.*,
                json_build_object(
                    'id', m.id,
                    'content', m.content,
                    'user_nickname', m.user_nickname,
                    'sent_at', m.sent_at,
                    'file_url', m.file_url,
                    'file_type', m.file_type
                ) as last_message,
                (
                    SELECT COUNT(*) FROM messages 
                    WHERE chat_id = c.id AND sent_at > COALESCE(
                        (SELECT last_read_at FROM chat_members cm2 
                         WHERE cm2.chat_id = c.id AND cm2.user_id = $1),
                        '1970-01-01'
                    )
                ) as unread_count
            FROM chats c
            JOIN chat_members cm ON c.id = cm.chat_id
            LEFT JOIN LATERAL (
                SELECT * FROM messages 
                WHERE chat_id = c.id 
                ORDER BY sent_at DESC 
                LIMIT 1
            ) m ON true
            WHERE cm.user_id = $1
            ORDER BY COALESCE(m.sent_at, c.created_at) DESC
        `, [req.userId]);

        res.json(chats.rows);
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ error: 'Ошибка загрузки чатов' });
    }
});

router.post('/chats', verifyToken, async (req, res) => {
    try {
        const { chatId, name, messageTtl = 1 } = req.body;

        const chatIdRegex = /^#[a-zA-Z0-9.]+$/;
        if (!chatIdRegex.test(chatId)) {
            return res.status(400).json({ 
                error: 'ID чата должен начинаться с # и содержать только английские буквы, цифры и точки' 
            });
        }

        const existing = await pool.query(
            'SELECT id FROM chats WHERE chat_id = $1',
            [chatId]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Чат с таким ID уже существует' });
        }

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            const newChat = await client.query(
                'INSERT INTO chats (chat_id, name, created_by, message_ttl) VALUES ($1, $2, $3, $4) RETURNING *',
                [chatId, name, req.userId, messageTtl]
            );

            await client.query(
                'INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2)',
                [newChat.rows[0].id, req.userId]
            );

            await client.query('COMMIT');
            res.status(201).json(newChat.rows[0]);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ error: 'Ошибка создания чата' });
    }
});

router.post('/chats/join', verifyToken, async (req, res) => {
    try {
        const { chatId } = req.body;

        if (!chatId) {
            return res.status(400).json({ error: 'Введите ID чата' });
        }

        const chat = await pool.query(
            'SELECT id FROM chats WHERE chat_id = $1',
            [chatId]
        );

        if (chat.rows.length === 0) {
            return res.status(404).json({ error: 'Чат не найден' });
        }

        const chatId_num = chat.rows[0].id;

        const existing = await pool.query(
            'SELECT * FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId_num, req.userId]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Вы уже в чате' });
        }

        await pool.query(
            'INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2)',
            [chatId_num, req.userId]
        );

        res.json({ message: 'Вы присоединились к чату', chat_id: chatId });

    } catch (error) {
        console.error('Join chat error:', error);
        res.status(500).json({ error: 'Ошибка присоединения к чату' });
    }
});

router.post('/chats/:chatId/leave', verifyToken, async (req, res) => {
    try {
        const { chatId } = req.params;

        const chat = await pool.query(
            'SELECT id, created_by FROM chats WHERE chat_id = $1',
            [chatId]
        );

        if (chat.rows.length === 0) {
            return res.status(404).json({ error: 'Чат не найден' });
        }

        const chatId_num = chat.rows[0].id;

        await pool.query(
            'DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId_num, req.userId]
        );

        const membersLeft = await pool.query(
            'SELECT COUNT(*) FROM chat_members WHERE chat_id = $1',
            [chatId_num]
        );

        if (membersLeft.rows[0].count === '0') {
            await pool.query('DELETE FROM chats WHERE id = $1', [chatId_num]);
        }

        res.json({ message: 'Вы покинули чат' });

    } catch (error) {
        console.error('Leave chat error:', error);
        res.status(500).json({ error: 'Ошибка выхода из чата' });
    }
});

router.get('/chats/:chatId/members', verifyToken, async (req, res) => {
    try {
        const { chatId } = req.params;

        const chat = await pool.query(
            'SELECT id FROM chats WHERE chat_id = $1',
            [chatId]
        );

        if (chat.rows.length === 0) {
            return res.status(404).json({ error: 'Чат не найден' });
        }

        const members = await pool.query(`
            SELECT u.id, u.nickname, u.email, cm.joined_at
            FROM chat_members cm
            JOIN users u ON cm.user_id = u.id
            WHERE cm.chat_id = $1
            ORDER BY cm.joined_at ASC
        `, [chat.rows[0].id]);

        res.json(members.rows);
    } catch (error) {
        console.error('Get members error:', error);
        res.status(500).json({ error: 'Ошибка загрузки участников' });
    }
});

router.put('/chats/:chatId/settings', verifyToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { messageTtl } = req.body;

        const chat = await pool.query(
            'SELECT * FROM chats WHERE chat_id = $1',
            [chatId]
        );

        if (chat.rows.length === 0) {
            return res.status(404).json({ error: 'Чат не найден' });
        }

        if (chat.rows[0].created_by !== req.userId) {
            return res.status(403).json({ error: 'Только создатель может менять настройки' });
        }

        await pool.query(
            'UPDATE chats SET message_ttl = $1 WHERE id = $2',
            [messageTtl, chat.rows[0].id]
        );

        res.json({ message: 'Настройки сохранены' });

    } catch (error) {
        console.error('Update chat settings error:', error);
        res.status(500).json({ error: 'Ошибка обновления настроек' });
    }
});

module.exports = router;