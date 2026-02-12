console.log('💬 chat.js загружен');

let currentChatId = null;
let ws = null;
let currentUser = null;
let currentChat = null;
let allMessagesLoaded = false;
let loadingMessages = false;
let pushEnabled = false;

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;

let longPressTimer = null;
let selectedMessageId = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📱 DOM готов');
    
    const urlParams = new URLSearchParams(window.location.search);
    currentChatId = urlParams.get('id');
    
    if (!currentChatId) {
        window.location.href = '/dashboard.html';
        return;
    }
    
    await loadUserProfile();
    await loadChatInfo();
    await loadMessages();
    await loadMembers();
    initWebSocket();
    initEventListeners();
    initFileUpload();
    initVoiceRecording();
    initMessageLongPress();
    initCopyOnLongPress();
    initNotificationButton();
    checkPushStatus();
});

// ===== ПРОФИЛЬ =====
async function loadUserProfile() {
    try {
        currentUser = await API.users.getProfile();
        const nicknameEl = document.getElementById('userNickname');
        if (nicknameEl) {
            nicknameEl.textContent = currentUser.nickname;
        }
        console.log('👤 Текущий пользователь:', currentUser);
    } catch (error) {
        console.error('❌ Ошибка загрузки профиля');
        window.location.href = '/';
    }
}

// ===== ИНФО ЧАТА =====
async function loadChatInfo() {
    try {
        const chats = await API.chats.getAll();
        currentChat = chats.find(c => c.chat_id === currentChatId);
        
        if (currentChat) {
            document.querySelector('.chat-name').textContent = currentChat.name;
            document.querySelector('#menuChatName').textContent = currentChat.name;
            document.querySelector('#menuChatId').textContent = currentChat.chat_id;
            document.querySelector('#currentChatName').textContent = currentChat.name;
            document.querySelector('#currentChatId').textContent = currentChat.chat_id;
            
            if (currentChat.created_by === currentUser?.id) {
                document.getElementById('creatorSettings')?.classList.remove('hidden');
                document.getElementById('deleteChatItem')?.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки информации о чате');
    }
}

// ===== УЧАСТНИКИ =====
async function loadMembers() {
    try {
        console.log('🔄 Загрузка участников чата:', currentChatId);
        
        const members = await API.chats.getMembers(currentChatId);
        console.log('✅ Загружено участников:', members.length);
        
        const membersList = document.getElementById('membersList');
        const membersCount = document.querySelector('.chat-members-count');
        const membersCountBadge = document.getElementById('membersCountBadge');
        
        if (!membersList) return;
        
        if (membersCount) {
            membersCount.textContent = `${members.length} участников`;
        }
        
        if (membersCountBadge) {
            membersCountBadge.textContent = members.length;
        }
        
        if (members.length === 0) {
            membersList.innerHTML = '<div class="member-item" style="justify-content: center; color: #A9A9A9;">Нет участников</div>';
            return;
        }
        
        membersList.innerHTML = members.map(member => {
            const isCreator = member.id === currentChat?.created_by;
            const isMe = member.id === currentUser?.id;
            
            return `
                <div class="member-item" data-user-id="${member.id}">
                    <div class="member-avatar">👤</div>
                    <div class="member-info">
                        <span class="member-name">${escapeHtml(member.nickname)}${isMe ? ' (Вы)' : ''}</span>
                        ${isCreator ? '<span class="member-badge">Создатель</span>' : ''}
                    </div>
                    ${currentChat?.created_by === currentUser?.id && !isCreator && !isMe ? 
                        `<button class="member-kick" onclick="window.kickMember(${member.id})">✕</button>` : ''}
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('❌ Ошибка загрузки участников:', error);
        const membersList = document.getElementById('membersList');
        if (membersList) {
            membersList.innerHTML = '<div class="member-item" style="justify-content: center; color: #FF8888;">Ошибка загрузки</div>';
        }
    }
}

// ===== ИСКЛЮЧИТЬ УЧАСТНИКА =====
async function kickMember(userId) {
    if (!confirm('Исключить участника из чата?')) return;
    
    try {
        await API.chats.kickMember(currentChatId, userId);
        await loadMembers();
        API.showCheckToast('Участник исключен');
    } catch (error) {
        console.error('❌ Ошибка исключения:', error);
        API.showToast('Не удалось исключить участника', 'error');
    }
}

// ===== СООБЩЕНИЯ =====
async function loadMessages() {
    if (loadingMessages || allMessagesLoaded) return;
    
    loadingMessages = true;
    showLoader();
    
    try {
        console.log('🔄 Загрузка сообщений...');
        const messages = await API.messages.get(currentChatId, 50);
        
        console.log(`✅ Загружено ${messages.length} сообщений`);
        
        const container = document.getElementById('messagesContainer');
        const emptyChat = document.getElementById('emptyChat');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (messages.length === 0) {
            if (emptyChat) emptyChat.classList.remove('hidden');
            return;
        }
        
        if (emptyChat) emptyChat.classList.add('hidden');
        
        messages.sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
        messages.forEach(message => appendMessage(message, false));
        
        scrollToBottom();
        
    } catch (error) {
        console.error('❌ Ошибка загрузки сообщений:', error);
    } finally {
        loadingMessages = false;
        hideLoader();
    }
}

// ===== ОТОБРАЖЕНИЕ СООБЩЕНИЯ =====
function appendMessage(message, scroll = true) {
    if (!message || !message.id) return;
    
    const container = document.getElementById('messagesContainer');
    const isOwn = message.user_id === currentUser?.id;
    
    const existing = document.querySelector(`.message[data-message-id="${message.id}"]`);
    if (existing) existing.remove();
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isOwn ? 'own' : 'other'}`;
    messageEl.dataset.messageId = message.id;
    messageEl.dataset.userId = message.user_id;
    messageEl.dataset.messageContent = message.content || '';
    
    const time = new Date(message.sent_at).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    let contentHtml = '';
    
    if (message.file_url) {
        if (message.file_type?.startsWith('image/')) {
            contentHtml = `
                <div class="message-image">
                    <img src="${message.file_url}" loading="lazy" onclick="window.openImagePreview('${message.file_url}')">
                    ${message.content ? `<div class="message-caption">${escapeHtml(message.content)}</div>` : ''}
                </div>
            `;
        } else if (message.file_type?.startsWith('audio/')) {
            contentHtml = `
                <div class="message-audio">
                    <audio controls src="${message.file_url}"></audio>
                    ${message.content ? `<div class="message-caption">${escapeHtml(message.content)}</div>` : ''}
                </div>
            `;
        } else {
            contentHtml = `
                <div class="message-file">
                    <a href="${message.file_url}" target="_blank" class="file-link">
                        <span class="file-icon">📎</span>
                        <span class="file-name">${escapeHtml(message.file_name || 'Файл')}</span>
                    </a>
                    ${message.content ? `<div class="message-caption">${escapeHtml(message.content)}</div>` : ''}
                </div>
            `;
        }
    } else {
        contentHtml = `<div class="message-text">${escapeHtml(message.content || '')}</div>`;
    }
    
    if (isOwn) {
        messageEl.innerHTML = `
            ${contentHtml}
            <div class="message-time">${time}</div>
        `;
    } else {
        messageEl.innerHTML = `
            <div class="message-header">
                <span class="message-nickname">${escapeHtml(message.user_nickname)}</span>
            </div>
            ${contentHtml}
            <div class="message-time">${time}</div>
        `;
    }
    
    container.appendChild(messageEl);
    
    if (scroll) {
        scrollToBottom();
    }
}

// ===== КОПИРОВАНИЕ ПРИ ДОЛГОМ НАЖАТИИ =====
function initCopyOnLongPress() {
    let pressTimer;
    let pressedMessage = null;
    
    document.addEventListener('touchstart', (e) => {
        const messageEl = e.target.closest('.message');
        if (!messageEl) return;
        
        pressedMessage = messageEl;
        
        pressTimer = setTimeout(() => {
            if (pressedMessage) {
                const messageText = pressedMessage.querySelector('.message-text');
                if (messageText) {
                    const text = messageText.textContent;
                    copyToClipboard(text);
                    API.showCheckToast('Скопировано');
                    pressedMessage.classList.add('message-copied');
                    setTimeout(() => {
                        pressedMessage.classList.remove('message-copied');
                    }, 500);
                }
            }
        }, 500);
    });
    
    document.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
        pressedMessage = null;
    });
    
    document.addEventListener('touchmove', () => {
        clearTimeout(pressTimer);
        pressedMessage = null;
    });
}

// ===== КОПИРОВАНИЕ В БУФЕР =====
function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

// ===== УДАЛЕНИЕ СООБЩЕНИЯ =====
async function deleteMessage(messageId) {
    try {
        await API.messages.delete(messageId);
        const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (messageEl) messageEl.remove();
        
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'delete',
                chatId: currentChatId,
                messageId: messageId
            }));
        }
        API.showCheckToast('Удалено');
    } catch (error) {
        console.error('❌ Ошибка удаления:', error);
        API.showToast('Не удалось удалить сообщение', 'error');
    }
}

// ===== ЗАЖАТИЕ ДЛЯ УДАЛЕНИЯ =====
function initMessageLongPress() {
    let pressTimer;
    let pressedMessage = null;
    
    document.addEventListener('touchstart', (e) => {
        const messageEl = e.target.closest('.message');
        if (!messageEl) return;
        if (messageEl.classList.contains('own')) return;
        
        pressedMessage = messageEl;
        
        pressTimer = setTimeout(() => {
            if (pressedMessage) {
                const messageId = pressedMessage.dataset.messageId;
                showDeleteConfirm(messageId);
            }
        }, 500);
    });
    
    document.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
        pressedMessage = null;
    });
    
    document.addEventListener('touchmove', () => {
        clearTimeout(pressTimer);
        pressedMessage = null;
    });
}

function showDeleteConfirm(messageId) {
    const overlay = document.createElement('div');
    overlay.className = 'message-delete-overlay';
    overlay.innerHTML = `
        <div class="delete-confirm">
            <p>Удалить сообщение для всех?</p>
            <div class="delete-confirm-buttons">
                <button class="delete-confirm-btn cancel">Отмена</button>
                <button class="delete-confirm-btn delete">Удалить</button>
            </div>
        </div>
    `;
    
    overlay.querySelector('.cancel').onclick = () => overlay.remove();
    overlay.querySelector('.delete').onclick = async () => {
        await deleteMessage(messageId);
        overlay.remove();
    };
    
    document.body.appendChild(overlay);
}

// ===== ОТПРАВКА СООБЩЕНИЯ =====
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content) return;
    
    input.value = '';
    input.style.height = 'auto';
    input.dispatchEvent(new Event('input'));
    
    try {
        const message = await API.messages.sendText(currentChatId, content);
        appendMessage(message);
        
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'message',
                chatId: currentChatId,
                message: message
            }));
        }
    } catch (error) {
        console.error('❌ Ошибка отправки:', error);
        API.showToast('Не удалось отправить сообщение', 'error');
        input.value = content;
    }
}

// ===== ВЕБСОКЕТ =====
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('🔌 WebSocket подключен');
        ws.send(JSON.stringify({
            type: 'join',
            chatId: currentChatId
        }));
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'message' && data.message) {
                appendMessage(data.message);
            } else if (data.type === 'message_deleted') {
                const msg = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
                if (msg) msg.remove();
            } else if (data.type === 'typing') {
                showTypingIndicator(data.userNickname);
            } else if (data.type === 'chat_updated') {
                loadChatInfo();
                loadMembers();
            }
        } catch (error) {
            console.error('WebSocket error:', error);
        }
    };
    
    ws.onclose = () => {
        console.log('🔌 WebSocket отключен, переподключение...');
        setTimeout(initWebSocket, 3000);
    };
}

// ===== ИВЕНТЫ =====
function initEventListeners() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendButton');
    const backBtn = document.querySelector('.back-button');
    const chatHeader = document.getElementById('chatHeader');
    const menuOverlay = document.getElementById('chatMenu');
    const closeMenu = document.querySelector('.close-menu');
    
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'typing',
                    chatId: currentChatId
                }));
            }
        });
    }
    
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = '/dashboard.html';
        });
    }
    
    if (chatHeader) {
        chatHeader.addEventListener('click', (e) => {
            if (e.target.closest('.back-button') || e.target.closest('.notification-button')) return;
            if (menuOverlay) {
                menuOverlay.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            }
        });
    }
    
    if (closeMenu) {
        closeMenu.addEventListener('click', () => {
            if (menuOverlay) {
                menuOverlay.classList.add('hidden');
                document.body.style.overflow = '';
            }
        });
    }
    
    if (menuOverlay) {
        menuOverlay.addEventListener('click', (e) => {
            if (e.target === menuOverlay) {
                menuOverlay.classList.add('hidden');
                document.body.style.overflow = '';
            }
        });
    }
    
    const editNameItem = document.getElementById('editChatNameItem');
    if (editNameItem) {
        editNameItem.addEventListener('click', () => {
            document.getElementById('editNameModal')?.classList.add('active');
            const input = document.getElementById('editChatNameInput');
            if (input && currentChat) input.value = currentChat.name;
        });
    }
    
    const editIdItem = document.getElementById('editChatIdItem');
    if (editIdItem) {
        editIdItem.addEventListener('click', () => {
            document.getElementById('editIdModal')?.classList.add('active');
            const input = document.getElementById('editChatIdInput');
            if (input && currentChat) input.value = currentChat.chat_id;
        });
    }
    
    const saveNameBtn = document.getElementById('saveChatNameBtn');
    if (saveNameBtn) {
        saveNameBtn.addEventListener('click', async () => {
            const newName = document.getElementById('editChatNameInput')?.value.trim();
            if (!newName) return;
            try {
                await API.chats.updateSettings(currentChatId, { name: newName });
                currentChat.name = newName;
                await loadChatInfo();
                document.getElementById('editNameModal')?.classList.remove('active');
                API.showCheckToast('Название обновлено');
            } catch (error) {
                API.showToast('Ошибка обновления', 'error');
            }
        });
    }
    
    const saveIdBtn = document.getElementById('saveChatIdBtn');
    if (saveIdBtn) {
        saveIdBtn.addEventListener('click', async () => {
            let newId = document.getElementById('editChatIdInput')?.value.trim();
            if (!newId) return;
            if (!newId.startsWith('#')) newId = '#' + newId;
            if (newId.startsWith('##')) newId = '#' + newId.slice(2);
            try {
                await API.chats.updateSettings(currentChatId, { chatId: newId });
                currentChat.chat_id = newId;
                await loadChatInfo();
                document.getElementById('editIdModal')?.classList.remove('active');
                API.showCheckToast('ID чата обновлен');
            } catch (error) {
                API.showToast('Ошибка обновления', 'error');
            }
        });
    }
    
    const deleteChatItem = document.getElementById('deleteChatItem');
    if (deleteChatItem) {
        deleteChatItem.addEventListener('click', async () => {
            if (!confirm('Удалить чат навсегда?')) return;
            try {
                await API.chats.delete(currentChatId);
                window.location.href = '/dashboard.html';
            } catch (error) {
                API.showToast('Ошибка удаления чата', 'error');
            }
        });
    }
    
    const leaveChatItem = document.getElementById('leaveChatItem');
    if (leaveChatItem) {
        leaveChatItem.addEventListener('click', async () => {
            if (!confirm('Покинуть чат?')) return;
            try {
                await API.chats.leave(currentChatId);
                window.location.href = '/dashboard.html';
            } catch (error) {
                API.showToast('Ошибка выхода из чата', 'error');
            }
        });
    }
    
    document.querySelectorAll('.modal .close, .modal .cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });
}

// ===== ФАЙЛЫ =====
function initFileUpload() {
    const attachBtn = document.getElementById('attachButton');
    const fileInput = document.getElementById('fileInput');
    if (!attachBtn || !fileInput) return;
    
    attachBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        API.showLoader();
        try {
            const message = await API.messages.sendFile(currentChatId, file);
            appendMessage(message);
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'message',
                    chatId: currentChatId,
                    message: message
                }));
            }
            fileInput.value = '';
        } catch (error) {
            console.error('❌ Ошибка отправки файла:', error);
            API.showToast(error.message || 'Ошибка отправки файла', 'error');
        } finally {
            API.hideLoader();
        }
    });
}

// ===== ГОЛОСОВЫЕ =====
function initVoiceRecording() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendButton');
    const voiceBtn = document.getElementById('voiceButton');
    const wrapper = document.getElementById('messageInputWrapper');
    
    if (!input || !sendBtn || !voiceBtn || !wrapper) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        voiceBtn.style.display = 'none';
        return;
    }
    
    input.addEventListener('input', function() {
        const isEmpty = this.value.trim() === '';
        if (isEmpty) {
            sendBtn.classList.add('hidden');
            voiceBtn.classList.remove('hidden');
            wrapper.classList.add('voice-mode');
        } else {
            sendBtn.classList.remove('hidden');
            voiceBtn.classList.add('hidden');
            wrapper.classList.remove('voice-mode');
        }
    });
    
    input.dispatchEvent(new Event('input'));
    
    voiceBtn.addEventListener('mousedown', startRecording);
    voiceBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRecording();
    });
    
    [document, voiceBtn].forEach(el => {
        el.addEventListener('mouseup', stopRecording);
        el.addEventListener('touchend', stopRecording);
        el.addEventListener('touchcancel', stopRecording);
    });
}

async function startRecording(e) {
    if (e) e.preventDefault();
    if (isRecording) return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioFile = new File([audioBlob], 'voice-message.webm', { type: 'audio/webm' });
            
            try {
                const message = await API.messages.sendFile(currentChatId, audioFile);
                appendMessage(message);
                if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'message',
                        chatId: currentChatId,
                        message: message
                    }));
                }
            } catch (error) {
                console.error('❌ Ошибка отправки голосового:', error);
                API.showToast('Ошибка отправки голосового', 'error');
            }
            
            stream.getTracks().forEach(track => track.stop());
            isRecording = false;
            voiceBtn.classList.remove('recording');
        };
        
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        voiceBtn.classList.add('recording');
    } catch (error) {
        console.error('❌ Нет доступа к микрофону');
        API.showToast('Микрофон недоступен', 'error');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        if (Date.now() - recordingStartTime < 1000) {
            mediaRecorder.stop();
            return;
        }
        mediaRecorder.stop();
    }
}

// ===== ИНДИКАТОР ПЕЧАТАНИЯ =====
function showTypingIndicator(nickname) {
    const indicator = document.getElementById('typingIndicator');
    if (!indicator) return;
    indicator.textContent = `${nickname} печатает...`;
    indicator.classList.remove('hidden');
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => {
        indicator.classList.add('hidden');
    }, 2000);
}

// ===== СКРОЛЛ =====
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) container.scrollTop = container.scrollHeight;
}

// ===== ЛОУДЕР =====
function showLoader() {
    document.getElementById('messagesLoader')?.classList.remove('hidden');
}

function hideLoader() {
    document.getElementById('messagesLoader')?.classList.add('hidden');
}

// ===== ESCAPE HTML =====
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== УВЕДОМЛЕНИЯ — КНОПКА СПРАВА =====
function initNotificationButton() {
    console.log('🔔 Инициализация кнопки уведомлений');
    
    let headerRight = document.querySelector('.chat-header-right');
    if (!headerRight) {
        console.error('❌ .chat-header-right не найден, создаём');
        const chatHeader = document.querySelector('.chat-header');
        if (chatHeader) {
            headerRight = document.createElement('div');
            headerRight.className = 'chat-header-right';
            chatHeader.appendChild(headerRight);
        } else {
            return;
        }
    }
    
    const oldBtn = document.getElementById('notificationButton');
    if (oldBtn) oldBtn.remove();
    
    const notifBtn = document.createElement('button');
    notifBtn.id = 'notificationButton';
    notifBtn.className = 'notification-button';
    notifBtn.setAttribute('aria-label', 'Уведомления выключены');
    notifBtn.innerHTML = '🔕';
    
    headerRight.appendChild(notifBtn);
    console.log('✅ Кнопка уведомлений добавлена');
    
    notifBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleNotifications(e);
    });
}

// ===== ПРОВЕРКА СТАТУСА ПОДПИСКИ =====
async function checkPushStatus() {
    try {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            updateNotificationButton(false);
            return;
        }
        
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        const isSubscribed = !!subscription;
        
        pushEnabled = isSubscribed;
        updateNotificationButton(isSubscribed);
        console.log('🔔 Статус уведомлений:', isSubscribed ? 'ВКЛ' : 'ВЫКЛ');
    } catch (error) {
        console.error('❌ Ошибка проверки статуса:', error);
        updateNotificationButton(false);
    }
}

// ===== ОБНОВЛЕНИЕ КНОПКИ =====
function updateNotificationButton(enabled) {
    const notifBtn = document.getElementById('notificationButton');
    if (!notifBtn) {
        console.error('❌ Кнопка уведомлений не найдена');
        return;
    }
    
    if (enabled) {
        notifBtn.classList.add('active');
        notifBtn.setAttribute('aria-label', 'Уведомления включены');
        notifBtn.innerHTML = '🔔';
        console.log('🔔 Кнопка обновлена: ВКЛ');
    } else {
        notifBtn.classList.remove('active');
        notifBtn.setAttribute('aria-label', 'Уведомления выключены');
        notifBtn.innerHTML = '🔕';
        console.log('🔕 Кнопка обновлена: ВЫКЛ');
    }
}

// ===== ПЕРЕКЛЮЧЕНИЕ УВЕДОМЛЕНИЙ =====
async function toggleNotifications(e) {
    if (e) e.preventDefault();
    console.log('🔔 Переключение уведомлений, текущий статус:', pushEnabled ? 'ВКЛ' : 'ВЫКЛ');
    
    try {
        if (pushEnabled) {
            // ОТКЛЮЧАЕМ
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            
            if (subscription) {
                await fetch('/api/push/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: subscription.endpoint }),
                    credentials: 'include'
                });
                await subscription.unsubscribe();
            }
            
            pushEnabled = false;
            updateNotificationButton(false);
            API.showCheckToast('🔕 Уведомления отключены');
            console.log('🔕 Уведомления отключены');
            
        } else {
            // ВКЛЮЧАЕМ
            console.log('🔔 Запрос разрешения...');
            const perm = await Notification.requestPermission();
            console.log('🔔 Разрешение:', perm);
            
            if (perm === 'granted') {
                await subscribeToPush();
                pushEnabled = true;
                updateNotificationButton(true);
                API.showCheckToast('🔔 Уведомления включены');
                console.log('🔔 Уведомления включены');
            } else {
                API.showToast('❌ Нет разрешения на уведомления', 'error');
                console.error('❌ Нет разрешения');
            }
        }
    } catch (error) {
        console.error('❌ Ошибка переключения уведомлений:', error);
        API.showToast('❌ Ошибка', 'error');
    }
}

// ===== ПОДПИСКА НА УВЕДОМЛЕНИЯ =====
async function subscribeToPush() {
    try {
        console.log('📨 Создание push-подписки...');
        
        const registration = await navigator.serviceWorker.ready;
        const keyRes = await fetch('/api/push/vapid-public-key');
        const { publicKey } = await keyRes.json();
        
        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding)
                .replace(/\-/g, '+')
                .replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray;
        }

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        const response = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription),
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Ошибка подписки');
        
        console.log('✅ Успешно подписались!');
    } catch (error) {
        console.error('❌ Ошибка подписки:', error);
        throw error;
    }
}

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ =====
window.sendMessage = sendMessage;
window.deleteMessage = deleteMessage;
window.kickMember = kickMember;
window.leaveChat = leaveChat;
window.showMembers = showMembers;
window.showSettings = showSettings;

function openImagePreview(url) {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    if (!modal || !img) return;
    
    img.src = url;
    modal.classList.add('active');
    
    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.classList.remove('active');
            img.src = '';
        };
    }
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            img.src = '';
        }
    });
}
window.openImagePreview = openImagePreview;

function leaveChat() {
    if (!confirm('Покинуть чат?')) return;
    try {
        API.chats.leave(currentChatId);
        window.location.href = '/dashboard.html';
    } catch (error) {
        console.error('❌ Ошибка выхода из чата');
        API.showToast('Не удалось покинуть чат', 'error');
    }
}

function showMembers() {
    console.log('👥 Показ участников');
}

function showSettings() {
    console.log('⚙️ Настройки чата');
}
