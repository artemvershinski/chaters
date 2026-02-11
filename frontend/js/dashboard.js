console.log('🔥 dashboard.js загрузился');

let userChats = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📱 DOM готов');
    await loadUserProfile();
    await loadChats();
    initEventListeners();
    initPullToRefresh();
});

async function loadUserProfile() {
    try {
        currentUser = await API.users.getProfile();
        document.getElementById('userNickname').textContent = currentUser.nickname;
        console.log('👤 Пользователь:', currentUser.nickname);
    } catch (error) {
        console.log('❌ Не авторизован');
        window.location.href = '/';
    }
}

async function loadChats() {
    try {
        console.log('🔄 Загрузка чатов...');
        userChats = await API.chats.getAll();
        renderChats();
        console.log('✅ Чатов загружено:', userChats.length);
    } catch (error) {
        console.error('❌ Ошибка загрузки чатов:', error);
        API.showToast('Ошибка загрузки чатов', 'error');
    }
}

function renderChats() {
    const container = document.getElementById('chatsList');
    const emptyState = document.getElementById('emptyState');
    
    if (!userChats || userChats.length === 0) {
        container.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }
    
    emptyState?.classList.add('hidden');
    
    container.innerHTML = userChats.map(chat => {
        const lastMessage = chat.last_message ? `
            <div class="last-message">
                <span class="last-message-sender">${escapeHtml(chat.last_message.user_nickname)}:</span>
                <span class="last-message-text">${escapeHtml(chat.last_message.content || '📎 Файл')}</span>
            </div>
        ` : '<div class="last-message">Нет сообщений</div>';
        
        const unreadBadge = chat.unread_count > 0 ? 
            `<span class="unread-badge">${chat.unread_count}</span>` : '';
        
        return `
            <div class="chat-item" data-chat-id="${chat.chat_id}" data-chat-name="${chat.name}">
                <div class="chat-avatar">
                    <span>💬</span>
                </div>
                <div class="chat-info">
                    <div class="chat-header">
                        <span class="chat-name">${escapeHtml(chat.name)}</span>
                        <span class="chat-time">${formatTime(chat.last_message?.sent_at)}</span>
                    </div>
                    <div class="chat-id-badge">${escapeHtml(chat.chat_id)}</div>
                    ${lastMessage}
                </div>
                ${unreadBadge}
            </div>
        `;
    }).join('');
    
    attachChatListeners();
}

function attachChatListeners() {
    document.querySelectorAll('.chat-item').forEach(item => {
        item.addEventListener('click', () => {
            const chatId = item.dataset.chatId;
            console.log('💬 Открыть чат:', chatId);
            window.location.href = `/chat.html?id=${encodeURIComponent(chatId)}`;
        });
    });
}

function initEventListeners() {
    console.log('🔌 Инициализация обработчиков');
    
    const createBtn = document.getElementById('createChatBtn');
    const joinBtn = document.getElementById('joinChatBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (createBtn) {
        createBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🟢 Нажато: создать чат');
            showCreateChatModal();
            return false;
        };
        console.log('✅ createChatBtn обработчик установлен');
    } else {
        console.error('❌ createChatBtn не найден!');
    }
    
    if (joinBtn) {
        joinBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🟡 Нажато: присоединиться');
            showJoinChatModal();
            return false;
        };
        console.log('✅ joinChatBtn обработчик установлен');
    } else {
        console.error('❌ joinChatBtn не найден!');
    }
    
    if (logoutBtn) {
        logoutBtn.onclick = function(e) {
            e.preventDefault();
            console.log('🔴 Нажато: выход');
            handleLogout();
        };
    }
    
    const createSubmit = document.getElementById('createChatSubmit');
    if (createSubmit) {
        createSubmit.onclick = function(e) {
            e.preventDefault();
            console.log('✅ Нажато: подтвердить создание');
            handleCreateChat();
        };
    }
    
    const joinSubmit = document.getElementById('joinChatSubmit');
    if (joinSubmit) {
        joinSubmit.onclick = function(e) {
            e.preventDefault();
            console.log('✅ Нажато: подтвердить присоединение');
            handleJoinChat();
        };
    }
    
    document.querySelectorAll('.modal .close, .modal .cancel-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.preventDefault();
            console.log('❌ Закрыть модалку');
            closeModals();
        };
    });
    
    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) {
            console.log('❌ Клик по оверлею');
            closeModals();
        }
    };
    
    const createChatId = document.getElementById('createChatId');
    if (createChatId) {
        createChatId.oninput = function(e) {
            let value = e.target.value;
            if (value && !value.startsWith('#')) {
                e.target.value = '#' + value.replace(/[^a-zA-Z0-9.]/g, '');
            } else if (value) {
                e.target.value = '#' + value.slice(1).replace(/[^a-zA-Z0-9.]/g, '');
            }
        };
    }
    
    const joinChatId = document.getElementById('joinChatId');
    if (joinChatId) {
        joinChatId.oninput = function(e) {
            let value = e.target.value;
            if (value && !value.startsWith('#')) {
                e.target.value = '#' + value.replace(/[^a-zA-Z0-9.]/g, '');
            } else if (value) {
                e.target.value = '#' + value.slice(1).replace(/[^a-zA-Z0-9.]/g, '');
            }
        };
    }
}

function showCreateChatModal() {
    console.log('📱 ОТКРЫТИЕ МОДАЛКИ: создать чат');
    const modal = document.getElementById('createChatModal');
    if (modal) {
        modal.classList.add('active');
        console.log('✅ Модалка открыта, класс active добавлен');
        
        const input = document.getElementById('createChatId');
        if (input) {
            input.value = '#';
            input.focus();
        }
        document.getElementById('createChatName').value = '';
    } else {
        console.error('❌ Модалка createChatModal не найдена!');
    }
}

function showJoinChatModal() {
    console.log('📱 ОТКРЫТИЕ МОДАЛКИ: присоединиться');
    const modal = document.getElementById('joinChatModal');
    if (modal) {
        modal.classList.add('active');
        console.log('✅ Модалка открыта, класс active добавлен');
        
        const input = document.getElementById('joinChatId');
        if (input) {
            input.value = '#';
            input.focus();
        }
    } else {
        console.error('❌ Модалка joinChatModal не найдена!');
    }
}

async function handleCreateChat() {
    const chatId = document.getElementById('createChatId').value.trim();
    const chatName = document.getElementById('createChatName').value.trim();
    const ttl = document.getElementById('messageTtl')?.value || 1;
    const button = document.getElementById('createChatSubmit');
    
    console.log('📝 Создание чата:', { chatId, chatName, ttl });
    
    if (!chatId || chatId === '#') {
        API.showToast('Введите ID чата', 'error');
        return;
    }
    
    if (!chatName) {
        API.showToast('Введите название чата', 'error');
        return;
    }
    
    button.disabled = true;
    button.textContent = '⏳';
    
    try {
        await API.chats.create({
            chatId,
            name: chatName,
            messageTtl: ttl
        });
        
        console.log('✅ Чат создан успешно');
        closeModals();
        API.showToast('Чат создан!', 'success');
        await loadChats();
    } catch (error) {
        console.error('❌ Ошибка создания чата:', error);
        API.showToast(error.message || 'Ошибка создания', 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Создать';
    }
}

async function handleJoinChat() {
    const chatId = document.getElementById('joinChatId').value.trim();
    const button = document.getElementById('joinChatSubmit');
    
    console.log('📝 Присоединение к чату:', chatId);
    
    if (!chatId || chatId === '#') {
        API.showToast('Введите ID чата', 'error');
        return;
    }
    
    button.disabled = true;
    button.textContent = '⏳';
    
    try {
        await API.chats.join(chatId);
        console.log('✅ Присоединились успешно');
        closeModals();
        API.showToast('Вы присоединились к чату!', 'success');
        await loadChats();
    } catch (error) {
        console.error('❌ Ошибка присоединения:', error);
        API.showToast(error.message || 'Ошибка присоединения', 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Присоединиться';
    }
}

async function handleLogout() {
    try {
        await API.auth.logout();
        window.location.href = '/';
    } catch (error) {
        window.location.href = '/';
    }
}

function closeModals() {
    console.log('❌ Закрытие всех модалок');
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
    
    document.querySelectorAll('.modal input').forEach(input => {
        input.value = '';
    });
}

function initPullToRefresh() {
    let startY = 0;
    const container = document.querySelector('.dashboard-container');
    
    if (!container) return;
    
    container.addEventListener('touchstart', (e) => {
        if (container.scrollTop === 0) {
            startY = e.touches[0].clientY;
        }
    });
    
    container.addEventListener('touchmove', async (e) => {
        const y = e.touches[0].clientY;
        if (container.scrollTop === 0 && y - startY > 50) {
            document.querySelector('.pull-to-refresh')?.classList.add('active');
        }
    });
    
    container.addEventListener('touchend', async (e) => {
        if (document.querySelector('.pull-to-refresh')?.classList.contains('active')) {
            document.querySelector('.pull-to-refresh')?.classList.add('loading');
            await loadChats();
            document.querySelector('.pull-to-refresh')?.classList.remove('active', 'loading');
        }
    });
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
        return 'только что';
    } else if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}м`;
    } else if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.showCreateChatModal = showCreateChatModal;
window.showJoinChatModal = showJoinChatModal;
window.closeModals = closeModals;
