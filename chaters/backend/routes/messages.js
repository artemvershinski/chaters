const express = require('express');
const { Pool } = require('pg');
const { verifyToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

router.get('/messages/:chatId', verifyToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const before = req.query.before;

        const chat = await pool.query(
            'SELECT id FROM chats WHERE chat_id = $1',
            [chatId]
        );

        if (chat.rows.length === 0) {
            return res.status(404).json({ error: 'Чат не найден' });
        }

        const chatId_num = chat.rows[0].id;

        const member = await pool.query(
            'SELECT * FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId_num, req.userId]
        );

        if (member.rows.length === 0) {
            return res.status(403).json({ error: 'Вы не участник чата' });
        }

        let query = `
            SELECT * FROM messages 
            WHERE chat_id = $1
        `;
        const params = [chatId_num];

        if (before) {
            query += ` AND id < $2`;
            params.push(before);
        }

        query += ` ORDER BY sent_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const messages = await pool.query(query, params);

        await pool.query(`
            UPDATE chat_members 
            SET last_read_at = NOW() 
            WHERE chat_id = $1 AND user_id = $2
        `, [chatId_num, req.userId]);

        res.json(messages.rows);

    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Ошибка загрузки сообщений' });
    }
});

router.post('/messages', verifyToken, upload.single('file'), async (req, res) => {
    try {
        const { chatId, content } = req.body;
        const file = req.file;

        const chat = await pool.query(
            'SELECT id, chat_id FROM chats WHERE chat_id = $1',
            [chatId]
        );

        if (chat.rows.length === 0) {
            return res.status(404).json({ error: 'Чат не найден' });
        }

        const chatId_num = chat.rows[0].id;

        const member = await pool.query(
            'SELECT * FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId_num, req.userId]
        );

        if (member.rows.length === 0) {
            return res.status(403).json({ error: 'Вы не участник чата' });
        }

        const user = await pool.query(
            'SELECT nickname FROM users WHERE id = $1',
            [req.userId]
        );

        let fileUrl = null;
        let fileType = null;
        let fileName = null;
        let fileSize = null;

        if (file) {
            const fileExt = mime.extension(file.mimetype) || 'bin';
            const fileNameGen = `${uuidv4()}.${fileExt}`;
            const uploadDir = path.join(__dirname, '../../uploads');
            
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            const filePath = path.join(uploadDir, fileNameGen);
            fs.writeFileSync(filePath, file.buffer);

            fileUrl = `/uploads/${fileNameGen}`;
            fileType = file.mimetype;
            fileName = file.originalname;
            fileSize = file.size;
        }

        const newMessage = await pool.query(`
            INSERT INTO messages 
            (chat_id, user_id, user_nickname, content, file_url, file_type, file_name, file_size) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING *
        `, [
            chatId_num, 
            req.userId, 
            user.rows[0].nickname, 
            content || null, 
            fileUrl, 
            fileType, 
            fileName, 
            fileSize
        ]);

        res.status(201).json(newMessage.rows[0]);

    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Ошибка отправки сообщения' });
    }
});

router.delete('/messages/:messageId', verifyToken, async (req, res) => {
    try {
        const { messageId } = req.params;

        const message = await pool.query(
            'SELECT * FROM messages WHERE id = $1',
            [messageId]
        );

        if (message.rows.length === 0) {
            return res.status(404).json({ error: 'Сообщение не найдено' });
        }

        if (message.rows[0].user_id !== req.userId) {
            return res.status(403).json({ error: 'Нельзя удалить чужое сообщение' });
        }

        if (message.rows[0].file_url) {
            const filePath = path.join(__dirname, '../..', message.rows[0].file_url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await pool.query('DELETE FROM messages WHERE id = $1', [messageId]);

        res.json({ message: 'Сообщение удалено' });

    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ error: 'Ошибка удаления сообщения' });
    }
});

router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Файл не выбран' });
        }

        const fileExt = mime.extension(file.mimetype) || 'bin';
        const fileName = `${uuidv4()}.${fileExt}`;
        const uploadDir = path.join(__dirname, '../../uploads');
        
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);

        const fileUrl = `/uploads/${fileName}`;

        res.json({
            url: fileUrl,
            type: file.mimetype,
            name: file.originalname,
            size: file.size
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Ошибка загрузки файла' });
    }
});

module.exports = router;