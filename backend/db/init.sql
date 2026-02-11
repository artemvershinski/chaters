-- Создание таблиц
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

-- Индексы
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_chat_id ON chat_members(chat_id);
CREATE INDEX IF NOT EXISTS idx_chats_chat_id ON chats(chat_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Функция удаления старых сообщений
CREATE OR REPLACE FUNCTION delete_old_messages()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM messages
    WHERE chat_id = NEW.chat_id
    AND sent_at < NOW() - (SELECT message_ttl FROM chats WHERE id = NEW.chat_id) * INTERVAL '1 day'
    AND (SELECT message_ttl FROM chats WHERE id = NEW.chat_id) > 0;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер
DROP TRIGGER IF EXISTS trigger_delete_old_messages ON messages;
CREATE TRIGGER trigger_delete_old_messages
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION delete_old_messages();

-- Функция обновления ника в сообщениях
CREATE OR REPLACE FUNCTION update_messages_nickname()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE messages 
    SET user_nickname = NEW.nickname 
    WHERE user_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер обновления ника
DROP TRIGGER IF EXISTS trigger_update_nickname ON users;
CREATE TRIGGER trigger_update_nickname
AFTER UPDATE OF nickname ON users
FOR EACH ROW
EXECUTE FUNCTION update_messages_nickname();