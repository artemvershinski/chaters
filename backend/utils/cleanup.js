const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function cleanupOldMessages() {
    try {
        const chats = await pool.query(`
            SELECT id, message_ttl, chat_id 
            FROM chats 
            WHERE message_ttl > 0
        `);

        for (const chat of chats.rows) {
            const deleted = await pool.query(`
                DELETE FROM messages 
                WHERE chat_id = $1 
                AND sent_at < NOW() - ($2 || ' days')::INTERVAL
                RETURNING file_url
            `, [chat.id, chat.message_ttl]);

            if (deleted.rows.length > 0) {
                console.log(`🧹 Chat ${chat.chat_id}: deleted ${deleted.rows.length} messages`);
                
                for (const msg of deleted.rows) {
                    if (msg.file_url) {
                        const filePath = path.join(__dirname, '../../', msg.file_url);
                        try {
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                            }
                        } catch (err) {
                            console.error(`Failed to delete file: ${msg.file_url}`, err);
                        }
                    }
                }
            }
        }

        console.log('✅ Cleanup completed at', new Date().toISOString());
    } catch (error) {
        console.error('❌ Cleanup error:', error);
    }
}

async function cleanupOrphanedFiles() {
    try {
        const uploadsDir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadsDir)) return;

        const files = fs.readdirSync(uploadsDir);
        
        for (const file of files) {
            const fileUrl = `/uploads/${file}`;
            
            const message = await pool.query(
                'SELECT id FROM messages WHERE file_url = $1',
                [fileUrl]
            );

            if (message.rows.length === 0) {
                const filePath = path.join(uploadsDir, file);
                fs.unlinkSync(filePath);
                console.log(`🗑️ Deleted orphaned file: ${file}`);
            }
        }
    } catch (error) {
        console.error('Orphaned files cleanup error:', error);
    }
}

async function cleanupExpiredSessions() {
    try {
        const result = await pool.query(
            'DELETE FROM sessions WHERE expires_at < NOW() RETURNING *'
        );
        
        if (result.rowCount > 0) {
            console.log(`🗑️ Deleted ${result.rowCount} expired sessions`);
        }
    } catch (error) {
        console.error('Session cleanup error:', error);
    }
}

async function runAllCleanup() {
    console.log('🧹 Starting cleanup...');
    await cleanupOldMessages();
    await cleanupOrphanedFiles();
    await cleanupExpiredSessions();
    console.log('✨ Cleanup finished');
}

if (require.main === module) {
    runAllCleanup()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = {
    cleanupOldMessages,
    cleanupOrphanedFiles,
    cleanupExpiredSessions,
    runAllCleanup
};