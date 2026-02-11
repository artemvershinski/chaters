const API = {
    baseURL: '',
    
    // ===== УНИВЕРСАЛЬНЫЙ ЗАПРОС =====
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        const config = {
            credentials: 'include',
            headers: defaultHeaders,
            ...options
        };
        
        this.showLoader();
        
        try {
            const response = await fetch(url, config);
            let data;
            
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
        
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    },
    
    // ===== УВЕДОМЛЕНИЕ С ГАЛОЧКОЙ =====
    showCheckToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.innerHTML = `✓ ${message}`;
        toast.className = 'toast success';
        toast.classList.remove('hidden');
        
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.add('hidden');
        }, 1500);
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
        register: async (userData) => {
            if (!userData.email || !userData.password || !userData.nickname) {
                throw new Error('Все поля обязательны');
            }
            
            if (userData.nickname.length > 20) {
                throw new Error('Ник не длиннее 20 символов');
            }
            
            if (userData.password.length < 6) {
                throw new Error('Пароль минимум 6 символов');
            }
            
            return API.request('/api/register', {
                method: 'POST',
                body: JSON.stringify(userData)
            });
        },
        
        login: async (credentials) => {
            if (!credentials.email || !credentials.password) {
                throw new Error('Введите почту и пароль');
            }
            
            return API.request('/api/login', {
                method: 'POST',
                body: JSON.stringify(credentials)
            });
        },
        
        logout: async () => {
            return API.request('/api/logout', {
                method: 'POST'
            });
        }
    },
    
    // ===== ЧАТЫ =====
    chats: {
        getAll: async () => {
            try {
                const response = await API.request('/api/chats');
                return Array.isArray(response) ? response : [];
            } catch (error) {
                console.error('getAll chats error:', error);
                return [];
            }
        },
        
        create: async (chatData) => {
            let chatId = chatData.chatId;
            
            if (!chatId.startsWith('#')) {
                chatId = '#' + chatId;
            }
            if (chatId.startsWith('##')) {
                chatId = '#' + chatId.slice(2);
            }
            
            const chatIdRegex = /^#[a-zA-Z0-9.]+$/;
            if (!chatIdRegex.test(chatId)) {
                throw new Error('ID чата должен начинаться с # и содержать только английские буквы, цифры и точки');
            }
            
            if (!chatData.name || chatData.name.trim() === '') {
                throw new Error('Введите название чата');
            }
            
            return API.request('/api/chats', {
                method: 'POST',
                body: JSON.stringify({
                    chatId: chatId,
                    name: chatData.name,
                    messageTtl: chatData.messageTtl || 1
                })
            });
        },
        
        join: async (chatId) => {
            if (!chatId || chatId.trim() === '') {
                throw new Error('Введите ID чата');
            }
            
            if (!chatId.startsWith('#')) {
                chatId = '#' + chatId;
            }
            if (chatId.startsWith('##')) {
                chatId = '#' + chatId.slice(2);
            }
            
            return API.request('/api/chats/join', {
                method: 'POST',
                body: JSON.stringify({ chatId })
            });
        },
        
        leave: async (chatId) => {
            try {
                const chatIdValue = chatId.startsWith('#') ? chatId : `#${chatId}`;
                return await API.request(`/api/chats/${encodeURIComponent(chatIdValue)}/leave`, {
                    method: 'POST'
                });
            } catch (error) {
                console.error('leave chat error:', error);
                throw error;
            }
        },
        
        delete: async (chatId) => {
            try {
                const chatIdValue = chatId.startsWith('#') ? chatId : `#${chatId}`;
                return await API.request(`/api/chats/${encodeURIComponent(chatIdValue)}`, {
                    method: 'DELETE'
                });
            } catch (error) {
                console.error('delete chat error:', error);
                throw error;
            }
        },
        
        getMembers: async (chatId) => {
            try {
                const chatIdValue = chatId.startsWith('#') ? chatId : `#${chatId}`;
                const response = await API.request(`/api/chats/${encodeURIComponent(chatIdValue)}/members`);
                return Array.isArray(response) ? response : [];
            } catch (error) {
                console.error('getMembers error:', error);
                return [];
            }
        },
        
        kickMember: async (chatId, userId) => {
            try {
                const chatIdValue = chatId.startsWith('#') ? chatId : `#${chatId}`;
                return await API.request(`/api/chats/${encodeURIComponent(chatIdValue)}/members/${userId}`, {
                    method: 'DELETE'
                });
            } catch (error) {
                console.error('kickMember error:', error);
                throw error;
            }
        },
        
        updateSettings: async (chatId, settings) => {
            try {
                const chatIdValue = chatId.startsWith('#') ? chatId : `#${chatId}`;
                return await API.request(`/api/chats/${encodeURIComponent(chatIdValue)}/settings`, {
                    method: 'PUT',
                    body: JSON.stringify(settings)
                });
            } catch (error) {
                console.error('update settings error:', error);
                throw error;
            }
        }
    },
    
    // ===== СООБЩЕНИЯ =====
    messages: {
        get: async (chatId, limit = 50) => {
            try {
                const chatIdValue = chatId.startsWith('#') ? chatId : `#${chatId}`;
                const response = await API.request(`/api/messages/${encodeURIComponent(chatIdValue)}?limit=${limit}`);
                return Array.isArray(response) ? response : [];
            } catch (error) {
                console.error('get messages error:', error);
                return [];
            }
        },
        
        sendText: async (chatId, content) => {
            if (!content || content.trim() === '') {
                throw new Error('Сообщение не может быть пустым');
            }
            
            const chatIdValue = chatId.startsWith('#') ? chatId : `#${chatId}`;
            
            return API.request('/api/messages', {
                method: 'POST',
                body: JSON.stringify({ 
                    chatId: chatIdValue, 
                    content: content.trim() 
                })
            });
        },
        
        sendFile: async (chatId, file, caption = '') => {
            if (!file) {
                throw new Error('Файл не выбран');
            }
            
            if (file.size > 10 * 1024 * 1024) {
                throw new Error('Файл не должен превышать 10MB');
            }
            
            const chatIdValue = chatId.startsWith('#') ? chatId : `#${chatId}`;
            const formData = new FormData();
            formData.append('chatId', chatIdValue);
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
        
        delete: async (messageId) => {
            return API.request(`/api/messages/${messageId}`, {
                method: 'DELETE'
            });
        }
    },
    
    // ===== ПОЛЬЗОВАТЕЛИ =====
    users: {
        getProfile: async () => {
            return API.request('/api/user/profile');
        },
        
        updateNickname: async (nickname) => {
            if (!nickname || nickname.length > 20) {
                throw new Error('Ник должен быть до 20 символов');
            }
            
            if (nickname.length < 2) {
                throw new Error('Ник минимум 2 символа');
            }
            
            return API.request('/api/user/nickname', {
                method: 'PUT',
                body: JSON.stringify({ nickname })
            });
        }
    },
    
    // ===== ПИНГ =====
    ping: async () => {
        try {
            await fetch('/ping');
        } catch (e) {}
    }
};

// Автопинг каждые 5 минут
if (typeof window !== 'undefined') {
    setInterval(() => {
        API.ping();
    }, 5 * 60 * 1000);
}

window.API = API;
