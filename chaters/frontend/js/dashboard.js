let userChats = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadUserProfile();
    await loadChats();
    initEventListeners();
    initPullToRefresh();
});

async function loadUserProfile() {
    try {
        currentUser = await API.users.getProfile();
        document.getElementById('userNickname').textContent = currentUser.nickname;
    } catch (error) {
        window.location.href = '/';
    }
}

async function loadChats() {
    try {
        userChats = await API.chats.getAll();
        renderChats();
    } catch (error) {
        API.showToast('Ошибка загрузки чатов', 'error');
    }
}

function renderChats() {
    const container = document.getElementById('chatsList');
    const emptyState = document.getElementById('emptyState');
    
    if (!userChats || userChats.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
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
            window.location.href = `/chat.html?id=${encodeURIComponent(chatId)}`;
        });
    });
}

function initEventListeners() {
    document.getElementById('createChatBtn').addEventListener('click', showCreateChatModal);
    document.getElementById('joinChatBtn').addEventListener('click', showJoinChatModal);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    document.getElementById('createChatSubmit').addEventListener('click', handleCreateChat);
    document.getElementById('joinChatSubmit').addEventListener('click', handleJoinChat);
    
    document.querySelectorAll('.modal .close, .modal .cancel-btn').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });
    
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModals();
        }
    });
    
    document.getElementById('createChatId').addEventListener('input', (e) => {
        let value = e.target.value;
        if (value && !value.startsWith('#')) {
            e.target.value = '#' + value.replace(/[^a-zA-Z0-9.]/g, '');
        } else {
            e.target.value = '#' + value.slice(1).replace(/[^a-zA-Z0-9.]/g, '');
        }
    });
    
    document.getElementById('joinChatId').addEventListener('input', (e) => {
        let value = e.target.value;
        if (value && !value.startsWith('#')) {
            e.target.value = '#' + value.replace(/[^a-zA-Z0-9.]/g, '');
        } else {
            e.target.value = '#' + value.slice(1).replace(/[^a-zA-Z0-9.]/g, '');
        }
    });
}

function showCreateChatModal() {
    document.getElementById('createChatModal').classList.add('active');
    document.getElementById('createChatId').value = '#';
    document.getElementById('createChatName').value = '';
}

function showJoinChatModal() {
    document.getElementById('joinChatModal').classList.add('active');
    document.getElementById('joinChatId').value = '#';
}

async function handleCreateChat() {
    const chatId = document.getElementById('createChatId').value.trim();
    const chatName = document.getElementById('createChatName').value.trim();
    const ttl = parseInt(document.getElementById('messageTtl').value);
    const button = document.getElementById('createChatSubmit');
    
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
        
        closeModals();
        API.showToast('Чат создан!', 'success');
        await loadChats();
    } catch (error) {
        button.disabled = false;
        button.textContent = 'Создать';
    }
}

async function handleJoinChat() {
    const chatId = document.getElementById('joinChatId').value.trim();
    const button = document.getElementById('joinChatSubmit');
    
    if (!chatId || chatId === '#') {
        API.showToast('Введите ID чата', 'error');
        return;
    }
    
    button.disabled = true;
    button.textContent = '⏳';
    
    try {
        await API.chats.join(chatId);
        closeModals();
        API.showToast('Вы присоединились к чату!', 'success');
        await loadChats();
    } catch (error) {
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
    
    container.addEventListener('touchstart', (e) => {
        if (container.scrollTop === 0) {
            startY = e.touches[0].clientY;
        }
    });
    
    container.addEventListener('touchmove', async (e) => {
        const y = e.touches[0].clientY;
        if (container.scrollTop === 0 && y - startY > 50) {
            document.querySelector('.pull-to-refresh').classList.add('active');
        }
    });
    
    container.addEventListener('touchend', async (e) => {
        if (document.querySelector('.pull-to-refresh').classList.contains('active')) {
            document.querySelector('.pull-to-refresh').classList.add('loading');
            await loadChats();
            document.querySelector('.pull-to-refresh').classList.remove('active', 'loading');
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