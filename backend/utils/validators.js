const validateChatId = (chatId) => {
    if (!chatId) return { valid: false, error: 'ID чата обязателен' };
    
    const chatIdRegex = /^#[a-zA-Z0-9.]+$/;
    if (!chatIdRegex.test(chatId)) {
        return { 
            valid: false, 
            error: 'ID чата должен начинаться с # и содержать только английские буквы, цифры и точки' 
        };
    }
    
    if (chatId.length < 2) {
        return { valid: false, error: 'ID чата слишком короткий' };
    }
    
    if (chatId.length > 30) {
        return { valid: false, error: 'ID чата не длиннее 30 символов' };
    }
    
    return { valid: true };
};

const validateNickname = (nickname) => {
    if (!nickname) return { valid: false, error: 'Ник обязателен' };
    
    if (nickname.length > 20) {
        return { valid: false, error: 'Ник не длиннее 20 символов' };
    }
    
    if (nickname.length < 2) {
        return { valid: false, error: 'Ник минимум 2 символа' };
    }
    
    const nicknameRegex = /^[a-zA-Z0-9а-яА-ЯёЁ. _-]+$/;
    if (!nicknameRegex.test(nickname)) {
        return { 
            valid: false, 
            error: 'Ник содержит недопустимые символы' 
        };
    }
    
    return { valid: true };
};

const validateEmail = (email) => {
    if (!email) return { valid: false, error: 'Email обязателен' };
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, error: 'Некорректный email' };
    }
    
    if (email.length > 255) {
        return { valid: false, error: 'Email слишком длинный' };
    }
    
    return { valid: true };
};

const validatePassword = (password) => {
    if (!password) return { valid: false, error: 'Пароль обязателен' };
    
    if (password.length < 6) {
        return { valid: false, error: 'Пароль минимум 6 символов' };
    }
    
    if (password.length > 72) {
        return { valid: false, error: 'Пароль слишком длинный' };
    }
    
    return { valid: true };
};

const validateMessageContent = (content) => {
    if (!content) return { valid: true };
    
    if (content.length > 5000) {
        return { valid: false, error: 'Сообщение не длиннее 5000 символов' };
    }
    
    return { valid: true };
};

const validateFileName = (fileName) => {
    if (!fileName) return { valid: false, error: 'Имя файла обязательно' };
    
    const forbiddenChars = /[<>:"/\\|?*]/;
    if (forbiddenChars.test(fileName)) {
        return { valid: false, error: 'Имя файла содержит недопустимые символы' };
    }
    
    if (fileName.length > 255) {
        return { valid: false, error: 'Имя файла слишком длинное' };
    }
    
    return { valid: true };
};

const validateFileType = (mimetype) => {
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'audio/webm', 'audio/mpeg', 'audio/ogg', 'audio/wav',
        'video/mp4', 'video/webm', 'video/ogg',
        'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/zip', 'application/x-zip-compressed'
    ];
    
    if (!allowedTypes.includes(mimetype)) {
        return { valid: false, error: 'Неподдерживаемый тип файла' };
    }
    
    return { valid: true };
};

const validateChatName = (name) => {
    if (!name) return { valid: false, error: 'Название чата обязательно' };
    
    if (name.length < 2) {
        return { valid: false, error: 'Название чата минимум 2 символа' };
    }
    
    if (name.length > 50) {
        return { valid: false, error: 'Название чата не длиннее 50 символов' };
    }
    
    return { valid: true };
};

const validateMessageTtl = (ttl) => {
    const ttlNum = parseInt(ttl);
    
    if (isNaN(ttlNum)) {
        return { valid: false, error: 'TTL должен быть числом' };
    }
    
    if (ttlNum < 0) {
        return { valid: false, error: 'TTL не может быть отрицательным' };
    }
    
    if (ttlNum > 365) {
        return { valid: false, error: 'TTL не больше 365 дней' };
    }
    
    return { valid: true, value: ttlNum };
};

module.exports = {
    validateChatId,
    validateNickname,
    validateEmail,
    validatePassword,
    validateMessageContent,
    validateFileName,
    validateFileType,
    validateChatName,
    validateMessageTtl
};