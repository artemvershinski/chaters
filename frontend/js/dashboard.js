console.log('🔥 dashboard.js загружен');

let userChats = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📱 DOM готов');
    await loadUserProfile();
    await loadChats();
    initEventListeners();
    initChatLongPress();
});

// ===== ПРОФИЛЬ =====
async function loadUserProfile() {
    try {
        currentUser = await API.users.getProfile();
        const nicknameEl = document.getElementById('userNickname');
        if (nicknameEl) {
            nicknameEl.textContent = currentUser.nickname;
        }
        console.log('👤 Пользователь:', currentUser);
    } catch (error) {
        console.log('❌ Не авторизован');
        window.location.href = '/';
    }
}

// ===== ЗАГРУЗКА ЧАТОВ =====
async function loadChats() {
    try {
        console.log('🔄 Загрузка чатов...');
        userChats = await API.chats.getAll();
        console.log('✅ Чатов загружено:', userChats.length);
        renderChats();
    } catch (error) {
        console.error('❌ Ошибка загрузки чатов:', error);
        API.showToast('Ошибка загрузки чатов', 'error');
    }
}

// ===== ОТОБРАЖЕНИЕ ЧАТОВ =====
function renderChats() {
    const container = document.getElementById('chatsList');
    const emptyState = document.getElementById('emptyState');
    
    if (!container) return;
    
    if (!userChats || userChats.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    
    if (emptyState) emptyState.classList.add('hidden');
    
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
            <div class="chat-item" data-chat-id="${chat.chat_id}" data-chat-name="${chat.name}" data-created-by="${chat.created_by}">
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

// ===== КЛИК ПО ЧАТУ =====
function attachChatListeners() {
    document.querySelectorAll('.chat-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Не открываем чат при долгом нажатии
            if (e.defaultPrevented) return;
            
            const chatId = item.dataset.chatId;
            console.log('💬 Открыть чат:', chatId);
            window.location.href = `/chat.html?id=${encodeURIComponent(chatId)}`;
        });
    });
}

// ===== ДОЛГОЕ НАЖАТИЕ НА ЧАТ =====
function initChatLongPress() {
    let pressTimer;
    let pressedItem = null;
    
    document.addEventListener('touchstart', (e) => {
        const chatItem = e.target.closest('.chat-item');
        if (!chatItem) return;
        
        pressedItem = chatItem;
        
        pressTimer = setTimeout(() => {
            if (pressedItem) {
                e.preventDefault();
                const chatId = pressedItem.dataset.chatId;
                const chatName = pressedItem.dataset.chatName;
                const createdBy = parseInt(pressedItem.dataset.createdBy);
                showChatContextMenu(chatId, chatName, createdBy, e);
            }
        }, 500);
    });
    
    document.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
        pressedItem = null;
    });
    
    document.addEventListener('touchmove', () => {
        clearTimeout(pressTimer);
        pressedItem = null;
    });
    
    // Для мыши (для тестирования на компе)
    document.addEventListener('mousedown', (e) => {
        const chatItem = e.target.closest('.chat-item');
        if (!chatItem) return;
        
        pressedItem = chatItem;
        
        pressTimer = setTimeout(() => {
            if (pressedItem) {
                e.preventDefault();
                const chatId = pressedItem.dataset.chatId;
                const chatName = pressedItem.dataset.chatName;
                const createdBy = parseInt(pressedItem.dataset.createdBy);
                showChatContextMenu(chatId, chatName, createdBy, e);
            }
        }, 500);
    });
    
    document.addEventListener('mouseup', () => {
        clearTimeout(pressTimer);
        pressedItem = null;
    });
    
    document.addEventListener('mousemove', () => {
        clearTimeout(pressTimer);
        pressedItem = null;
    });
}

// ===== ПОКАЗ КОНТЕКСТНОГО МЕНЮ =====
function showChatContextMenu(chatId, chatName, createdBy, e) {
    // Удаляем старое меню
    document.querySelector('.chat-context-menu')?.remove();
    
    // Определяем позицию
    let x, y;
    if (e.touches) {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
    } else {
        x = e.clientX;
        y = e.clientY;
    }
    
    // Создаем меню
    const menu = document.createElement('div');
    menu.className = 'chat-context-menu';
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;
    
    // Проверяем, создатель ли я
    const isCreator = currentUser?.id === createdBy;
    
    let menuItems = '';
    menuItems += `<div class="context-menu-item" onclick="window.leaveChat('${chatId}')">🚪 Выйти из чата</div>`;
    
    if (isCreator) {
        menuItems += `<div class="context-menu-item danger" onclick="window.deleteChat('${chatId}')">🗑️ Удалить чат</div>`;
    }
    
    menu.innerHTML = menuItems;
    document.body.appendChild(menu);
    
    // Закрытие по клику вне
    setTimeout(() => {
        function closeMenu(e) {
            if (!e.target.closest('.chat-context-menu')) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
                document.removeEventListener('touchstart', closeMenu);
            }
        }
        document.addEventListener('click', closeMenu);
        document.addEventListener('touchstart', closeMenu);
    }, 100);
}

// ===== ВЫЙТИ ИЗ ЧАТА =====
window.leaveChat = async function(chatId) {
    if (!confirm('Покинуть чат?')) return;
    
    try {
        await API.chats.leave(chatId);
        await loadChats();
        API.showToast('Вы покинули чат', 'success');
    } catch (error) {
        console.error('❌ Ошибка выхода:', error);
        API.showToast('Ошибка выхода из чата', 'error');
    }
    
    document.querySelector('.chat-context-menu')?.remove();
};

// ===== УДАЛИТЬ ЧАТ =====
window.deleteChat = async function(chatId) {
    if (!confirm('Удалить чат навсегда? Это действие нельзя отменить.')) return;
    
    try {
        await API.chats.delete(chatId);
        await loadChats();
        API.showToast('Чат удален', 'success');
    } catch (error) {
        console.error('❌ Ошибка удаления:', error);
        API.showToast('Ошибка удаления чата', 'error');
    }
    
    document.querySelector('.chat-context-menu')?.remove();
};

// ===== ИНИЦИАЛИЗАЦИЯ ИВЕНТОВ =====
function initEventListeners() {
    const createBtn = document.getElementById('createChatBtn');
    const joinBtn = document.getElementById('joinChatBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const nicknameBtn = document.getElementById('userNickname');
    
    if (createBtn) {
        createBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🟢 Нажато: создать чат');
            showCreateChatModal();
            return false;
        };
    }
    
    if (joinBtn) {
        joinBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🟡 Нажато: присоединиться');
            showJoinChatModal();
            return false;
        };
    }
    
    if (logoutBtn) {
        logoutBtn.onclick = function(e) {
            e.preventDefault();
            console.log('🔴 Нажато: выход');
            handleLogout();
        };
    }
    
    if (nicknameBtn) {
        nicknameBtn.onclick = function() {
            showNicknameModal();
        };
    }
    
    // Кнопки модалок
    const createSubmit = document.getElementById('createChatSubmit');
    if (createSubmit) {
        createSubmit.onclick = function(e) {
            e.preventDefault();
            handleCreateChat();
        };
    }
    
    const joinSubmit = document.getElementById('joinChatSubmit');
    if (joinSubmit) {
        joinSubmit.onclick = function(e) {
            e.preventDefault();
            handleJoinChat();
        };
    }
    
    const updateNicknameBtn = document.getElementById('updateNicknameBtn');
    if (updateNicknameBtn) {
        updateNicknameBtn.onclick = function(e) {
            e.preventDefault();
            handleUpdateNickname();
        };
    }
    
    // Закрытие модалок
    document.querySelectorAll('.modal .close, .modal .cancel-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.preventDefault();
            closeModals();
        };
    });
    
    // Закрытие по клику на оверлей
    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) {
            closeModals();
        }
    };
    
    // Валидация ID чата
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
    
    // Счетчик ника
    const nicknameInput = document.getElementById('newNickname');
    const counter = document.querySelector('.counter');
    
    if (nicknameInput && counter) {
        nicknameInput.oninput = function() {
            const length = this.value.length;
            counter.textContent = `${length}/20`;
            counter.style.color = length > 18 ? '#FF8888' : '#A9A9A9';
        };
    }
}

// ===== ПОКАЗ МОДАЛОК =====
function showCreateChatModal() {
    console.log('📱 Открытие: создать чат');
    const modal = document.getElementById('createChatModal');
    if (modal) {
        modal.classList.add('active');
        const input = document.getElementById('createChatId');
        if (input) {
            input.value = '#';
            input.focus();
        }
        document.getElementById('createChatName').value = '';
        document.getElementById('messageTtl').value = '1';
    }
}

function showJoinChatModal() {
    console.log('📱 Открытие: присоединиться');
    const modal = document.getElementById('joinChatModal');
    if (modal) {
        modal.classList.add('active');
        const input = document.getElementById('joinChatId');
        if (input) {
            input.value = '#';
            input.focus();
        }
    }
}

function showNicknameModal() {
    console.log('📱 Открытие: смена ника');
    const modal = document.getElementById('nicknameModal');
    const input = document.getElementById('newNickname');
    if (modal && input) {
        input.value = currentUser?.nickname || '';
        modal.classList.add('active');
        input.focus();
    }
}

// ===== СОЗДАНИЕ ЧАТА =====
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
            messageTtl: parseInt(ttl)
        });
        
        console.log('✅ Чат создан');
        closeModals();
        API.showToast('Чат создан!', 'success');
        await loadChats();
    } catch (error) {
        console.error('❌ Ошибка:', error);
        API.showToast(error.message || 'Ошибка создания', 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Создать';
    }
}

// ===== ПРИСОЕДИНЕНИЕ =====
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
        console.log('✅ Присоединились');
        closeModals();
        API.showToast('Вы присоединились к чату!', 'success');
        await loadChats();
    } catch (error) {
        console.error('❌ Ошибка:', error);
        API.showToast(error.message || 'Ошибка присоединения', 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Присоединиться';
    }
}

// ===== СМЕНА НИКА =====
async function handleUpdateNickname() {
    const nickname = document.getElementById('newNickname').value.trim();
    const button = document.getElementById('updateNicknameBtn');
    
    if (!nickname) {
        API.showToast('Введите ник', 'error');
        return;
    }
    
    if (nickname.length > 20) {
        API.showToast('Максимум 20 символов', 'error');
        return;
    }
    
    button.disabled = true;
    button.textContent = '⏳';
    
    try {
        await API.users.updateNickname(nickname);
        currentUser.nickname = nickname;
        document.getElementById('userNickname').textContent = nickname;
        closeModals();
        API.showToast('Ник изменен', 'success');
    } catch (error) {
        console.error('❌ Ошибка:', error);
        API.showToast('Ошибка смены ника', 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Сохранить';
    }
}

// ===== ВЫХОД =====
async function handleLogout() {
    try {
        await API.auth.logout();
        window.location.href = '/';
    } catch (error) {
        window.location.href = '/';
    }
}

// ===== ЗАКРЫТИЕ МОДАЛОК =====
function closeModals() {
    console.log('❌ Закрытие модалок');
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
    
    document.querySelectorAll('.modal input').forEach(input => {
        input.value = '';
    });
}

// ===== ФОРМАТ ВРЕМЕНИ =====
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

// ===== ESCAPE HTML =====
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== API МЕТОДЫ (если отсутствуют) =====
if (!API.chats.leave) {
    API.chats.leave = async (chatId) => {
        return API.request(`/api/chats/${chatId}/leave`, {
            method: 'POST'
        });
    };
}

if (!API.chats.delete) {
    API.chats.delete = async (chatId) => {
        return API.request(`/api/chats/${chatId}`, {
            method: 'DELETE'
        });
    };
}

if (!API.users.updateNickname) {
    API.users.updateNickname = async (nickname) => {
        return API.request('/api/user/nickname', {
            method: 'PUT',
            body: JSON.stringify({ nickname })
        });
    };
}
