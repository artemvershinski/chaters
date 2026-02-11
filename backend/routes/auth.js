const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { verifyToken } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

router.post('/register', async (req, res) => {
    try {
        const { email, password, nickname } = req.body;

        if (!email || !password || !nickname) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }

        if (nickname.length > 20) {
            return res.status(400).json({ error: 'Ник не длиннее 20 символов' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль минимум 6 символов' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Некорректный email' });
        }

        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Email уже используется' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = await pool.query(
            'INSERT INTO users (email, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id, email, nickname, created_at',
            [email, hashedPassword, nickname]
        );

        const user = newUser.rows[0];
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        await pool.query(
            'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
            [token, user.id, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });

        res.status(201).json({
            id: user.id,
            email: user.email,
            nickname: user.nickname
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Ошибка регистрации' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Введите email и пароль' });
        }

        const userResult = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const user = userResult.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        await pool.query(
            'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
            [token, user.id, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });

        res.json({
            id: user.id,
            email: user.email,
            nickname: user.nickname
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

router.post('/logout', verifyToken, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM sessions WHERE token = $1',
            [req.token]
        );

        res.clearCookie('token');
        res.json({ message: 'Выход выполнен' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Ошибка выхода' });
    }
});

router.get('/me', verifyToken, (req, res) => {
    res.json(req.user);
});

router.put('/user/nickname', verifyToken, async (req, res) => {
    try {
        const { nickname } = req.body;

        if (!nickname || nickname.length > 20) {
            return res.status(400).json({ error: 'Ник до 20 символов' });
        }

        await pool.query(
            'UPDATE users SET nickname = $1 WHERE id = $2',
            [nickname, req.userId]
        );

        res.json({ message: 'Ник обновлен', nickname });
    } catch (error) {
        console.error('Update nickname error:', error);
        res.status(500).json({ error: 'Ошибка обновления ника' });
    }
});

router.get('/user/profile', verifyToken, (req, res) => {
    res.json(req.user);
});

module.exports = router;