// Базовые настройки API
const API = {
    baseURL: '',  // Относительный путь, работает через прокси на Render
    
    // ===== УНИВЕРСАЛЬНЫЙ ЗАПРОС =====
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        const config = {
            credentials: 'include',  // Важно для cookie с токеном
            headers: defaultHeaders,
            ...options
        };
        
        // Показываем загрузчик
        this.showLoader();
        
        try {
            const response = await fetch(url, config);
            let data;
            
            // Проверяем, есть ли тело ответа
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = { message: 'Успешно' };
            }
            
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Ошибка запроса');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            this.showToast(error.message, 'error');
            throw error;
        } finally {
            this.hideLoader();
        }
    },
    
    // ===== ЗАГРУЗЧИК =====
    showLoader() {
        const loader = document.getElementById('loader');
        if (loader) loader.classList.remove('hidden');
    },
    
    hideLoader() {
        const loader = document.getElementById('loader');
        if (loader) loader.classList.add('hidden');
    },
    
    // ===== УВЕДОМЛЕНИЯ =====
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = 'toast';
        if (type) toast.classList.add(type);
        toast.classList.remove('hidden');
        
        // Автоскрытие через 3 секунды
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    },
    
    // ===== ПРОВЕРКА АВТОРИЗАЦИИ =====
    async checkAuth() {
        try {
            const response = await fetch('/api/me', {
                credentials: 'include'
            });
            
            if (response.ok) {
                const user = await response.json();
                return user;
            }
            return null;
        } catch {
            return null;
        }
    },
    
    // ===== АВТОРИЗАЦИЯ =====
    auth: {
        // Регистрация
        register: async (userData) => {
            // Валидация на клиенте
            if (!userData.email || !userData.password || !userData.nickname) {
                throw new Error('Все поля обязательны');
            }
            
            if (userData.nickname.length > 20) {
                throw new Error('Ник не должен превышать 20 символов');
            }
            
            if (userData.password.length < 6) {
                throw new Error('Пароль должен быть минимум 6 символов');
            }
            
            return API.request('/api/register', {
                method: 'POST',
                body: JSON.stringify(userData)
            });
        },
        
        // Вход
        login: async (credentials) => {
            if (!credentials.email || !credentials.password) {
                throw new Error('Введите почту и пароль');
            }
            
            return API.request('/api/login', {
                method: 'POST',
                body: JSON.stringify(credentials)
            });
        },
        
        // Выход
        logout: async () => {
            return API.request('/api/logout', {
                method: 'POST'
            });
        }
    },
    
    // ===== ЧАТЫ =====
    chats: {
        // Получить все чаты пользователя
        getAll: async () => {
            return API.request('/api/chats');
        },
        
        // Создать чат
        create: async (chatData) => {
            // Валидация chatId: только англ буквы, цифры, точка, начинается с #
            const chatIdRegex = /^#[a-zA-Z0-9.]+$/;
            if (!chatIdRegex.test(chatData.chatId)) {
                throw new Error('ID чата должен начинаться с # и содержать только английские буквы, цифры и точки');
            }
            
            if (!chatData.name || chatData.name.trim() === '') {
                throw new Error('Введите название чата');
            }
            
            return API.request('/api/chats', {
                method: 'POST',
                body: JSON.stringify(chatData)
            });
        },
        
        // Присоединиться к чату
        join: async (chatId) => {
            if (!chatId || chatId.trim() === '') {
                throw new Error('Введите ID чата');
            }
            
            // Автоматически добавляем # если забыли
            if (!chatId.startsWith('#')) {
                chatId = '#' + chatId;
            }
            
            return API.request('/api/chats/join', {
                method: 'POST',
                body: JSON.stringify({ chatId })
            });
        },
        
        // Покинуть чат
        leave: async (chatId) => {
            return API.request(`/api/chats/${chatId}/leave`, {
                method: 'POST'
            });
        },
        
        // Настройки чата (TTL)
        settings: async (chatId, settings) => {
            return API.request(`/api/chats/${chatId}/settings`, {
                method: 'PUT',
                body: JSON.stringify(settings)
            });
        }
    },
    
    // ===== СООБЩЕНИЯ =====
    messages: {
        // Получить историю сообщений
        get: async (chatId, limit = 50, before = null) => {
            let url = `/api/messages/${chatId}?limit=${limit}`;
            if (before) {
                url += `&before=${before}`;
            }
            return API.request(url);
        },
        
        // Отправить текстовое сообщение
        sendText: async (chatId, content) => {
            if (!content || content.trim() === '') {
                throw new Error('Сообщение не может быть пустым');
            }
            
            return API.request('/api/messages', {
                method: 'POST',
                body: JSON.stringify({ 
                    chatId, 
                    content: content.trim() 
                })
            });
        },
        
        // Отправить файл
        sendFile: async (chatId, file, caption = '') => {
            if (!file) {
                throw new Error('Файл не выбран');
            }
            
            // Проверка размера (10MB)
            if (file.size > 10 * 1024 * 1024) {
                throw new Error('Файл не должен превышать 10MB');
            }
            
            const formData = new FormData();
            formData.append('chatId', chatId);
            formData.append('content', caption);
            formData.append('file', file);
            
            return fetch(`${API.baseURL}/api/messages`, {
                method: 'POST',
                credentials: 'include',
                body: formData
            }).then(async response => {
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Ошибка отправки файла');
                }
                return data;
            });
        },
        
        // Удалить сообщение
        delete: async (messageId) => {
            return API.request(`/api/messages/${messageId}`, {
                method: 'DELETE'
            });
        }
    },
    
    // ===== ЗАГРУЗКА ФАЙЛОВ (отдельно) =====
    upload: {
        // Загрузить файл без отправки в чат
        file: async (file, type = 'file') => {
            if (!file) {
                throw new Error('Файл не выбран');
            }
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', type);
            
            return fetch(`${API.baseURL}/api/upload`, {
                method: 'POST',
                credentials: 'include',
                body: formData
            }).then(async response => {
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Ошибка загрузки');
                }
                return data;
            });
        }
    },
    
    // ===== ПОЛЬЗОВАТЕЛИ =====
    users: {
        // Сменить ник
        updateNickname: async (nickname) => {
            if (!nickname || nickname.length > 20) {
                throw new Error('Ник должен быть до 20 символов');
            }
            
            return API.request('/api/user/nickname', {
                method: 'PUT',
                body: JSON.stringify({ nickname })
            });
        },
        
        // Получить информацию о пользователе
        getProfile: async () => {
            return API.request('/api/user/profile');
        }
    },
    
    // ===== PING ДЛЯ UPTIMEROBOT =====
    ping: async () => {
        try {
            await fetch('/ping');
        } catch (e) {
            // Игнорируем ошибки пинга
        }
    }
};

// Автоматический пинг каждые 5 минут для поддержания активности
if (typeof window !== 'undefined') {
    setInterval(() => {
        API.ping();
    }, 5 * 60 * 1000);
}

// Экспорт для использования в других файлах
window.API = API;