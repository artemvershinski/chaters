console.log('💬 chat.js загружен');

let currentChatId = null;
let ws = null;
let currentUser = null;
let currentChat = null;
let allMessagesLoaded = false;
let loadingMessages = false;

// Для голосовых сообщений
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;

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
    initWebSocket();
    initEventListeners();
    initFileUpload();
    initVoiceRecording();
    loadMembers();
});

async function loadUserProfile() {
    try {
        currentUser = await API.users.getProfile();
        console.log('👤 Пользователь:', currentUser.nickname);
    } catch (error) {
        console.error('❌ Ошибка загрузки профиля');
        window.location.href = '/';
    }
}

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
            
            // Показываем настройки только создателю
            if (currentChat.created_by === currentUser?.id) {
                document.getElementById('creatorSettings').classList.remove('hidden');
                document.getElementById('deleteChatItem').classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки информации о чате');
    }
}

async function loadMembers() {
    try {
        const members = await API.chats.getMembers(currentChatId);
        const membersList = document.getElementById('membersList');
        const membersCount = document.querySelector('.chat-members-count');
        const membersCountBadge = document.getElementById('membersCountBadge');
        
        membersCount.textContent = `${members.length} участников`;
        membersCountBadge.textContent = members.length;
        
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
                        '<button class="member-kick" onclick="window.kickMember(' + member.id + ')">✕</button>' : ''}
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('❌ Ошибка загрузки участников:', error);
    }
}

async function loadMessages() {
    if (loadingMessages || allMessagesLoaded) return;
    
    loadingMessages = true;
    showLoader();
    
    try {
        console.log('🔄 Загрузка сообщений...');
        const messages = await API.messages.get(currentChatId, 50);
        
        if (!Array.isArray(messages)) {
            console.error('❌ messages не массив:', messages);
            return;
        }
        
        console.log(`✅ Загружено ${messages.length} сообщений`);
        
        const container = document.getElementById('messagesContainer');
        
        if (messages.length === 0) {
            document.getElementById('emptyChat').classList.remove('hidden');
            return;
        }
        
        document.getElementById('emptyChat').classList.add('hidden');
        
        // Сохраняем позицию скролла
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        
        // Сортируем от старых к новым (сверху вниз)
        messages.sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
        
        // Добавляем сообщения в контейнер (они пойдут сверху вниз)
        messages.forEach(message => appendMessage(message, false));
        
        // Скроллим вниз (к последнему сообщению)
        scrollToBottom();
        
    } catch (error) {
        console.error('❌ Ошибка загрузки сообщений:', error);
        API.showToast('Не удалось загрузить сообщения', 'error');
    } finally {
        loadingMessages = false;
        hideLoader();
    }
}

function appendMessage(message, scroll = true) {
    if (!message || !message.id) return;
    
    const container = document.getElementById('messagesContainer');
    const isOwn = message.user_id === currentUser?.id;
    
    const existing = document.querySelector(`.message[data-message-id="${message.id}"]`);
    if (existing) existing.remove();
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isOwn ? 'own' : 'other'}`;
    messageEl.dataset.messageId = message.id;
    
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
    
    messageEl.innerHTML = `
        <div class="message-header">
            <span class="message-nickname">${escapeHtml(message.user_nickname)}</span>
            <span class="message-time">${time}</span>
            ${isOwn ? `<button class="delete-message" onclick="window.deleteMessage(${message.id})">×</button>` : ''}
        </div>
        ${contentHtml}
    `;
    
    container.appendChild(messageEl);
    
    if (scroll) {
        scrollToBottom();
    }
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

// НОВАЯ ЛОГИКА ГОЛОСОВЫХ
function initVoiceRecording() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendButton');
    const voiceBtn = document.getElementById('voiceButton');
    const wrapper = document.getElementById('messageInputWrapper');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        voiceBtn.style.display = 'none';
        return;
    }
    
    // Показываем/скрываем кнопку голосового в зависимости от пустоты инпута
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
    
    // Триггерим начальное состояние
    input.dispatchEvent(new Event('input'));
    
    // Запись голоса по зажатию кнопки
    voiceBtn.addEventListener('mousedown', startRecording);
    voiceBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRecording();
    });
    
    // Остановка записи при отпускании
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
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioFile = new File([audioBlob], 'voice-message.webm', { type: 'audio/webm' });
            
            // Отправляем голосовое
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
        // Не отправляем, если запись длилась меньше 1 секунды
        if (Date.now() - recordingStartTime < 1000) {
            mediaRecorder.stop();
            return;
        }
        mediaRecorder.stop();
    }
}

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

async function deleteMessage(messageId) {
    if (!confirm('Удалить сообщение?')) return;
    
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
        
    } catch (error) {
        console.error('❌ Ошибка удаления:', error);
        API.showToast('Не удалось удалить сообщение', 'error');
    }
}

async function kickMember(userId) {
    if (!confirm('Исключить участника?')) return;
    
    try {
        await API.chats.kickMember(currentChatId, userId);
        await loadMembers();
        API.showToast('Участник исключен', 'success');
    } catch (error) {
        console.error('❌ Ошибка исключения:', error);
        API.showToast('Не удалось исключить участника', 'error');
    }
}

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

function initEventListeners() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendButton');
    const backBtn = document.querySelector('.back-button');
    const chatHeader = document.getElementById('chatHeader');
    const menuOverlay = document.getElementById('chatMenu');
    const closeMenu = document.querySelector('.close-menu');
    
    // Отправка по Enter
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Авто-высота textarea
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
    
    sendBtn.addEventListener('click', sendMessage);
    
    // Назад
    backBtn.addEventListener('click', () => {
        window.location.href = '/dashboard.html';
    });
    
    // Открытие меню по клику на название
    chatHeader.addEventListener('click', (e) => {
        // Не открываем меню при клике на кнопку назад
        if (e.target.closest('.back-button')) return;
        
        menuOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    });
    
    // Закрытие меню
    closeMenu.addEventListener('click', () => {
        menuOverlay.classList.add('hidden');
        document.body.style.overflow = '';
    });
    
    menuOverlay.addEventListener('click', (e) => {
        if (e.target === menuOverlay) {
            menuOverlay.classList.add('hidden');
            document.body.style.overflow = '';
        }
    });
    
    // Редактирование названия чата
    document.getElementById('editChatNameItem').addEventListener('click', () => {
        document.getElementById('editNameModal').classList.add('active');
        document.getElementById('editChatNameInput').value = currentChat.name;
    });
    
    // Редактирование ID чата
    document.getElementById('editChatIdItem').addEventListener('click', () => {
        document.getElementById('editIdModal').classList.add('active');
        document.getElementById('editChatIdInput').value = currentChat.chat_id;
    });
    
    // Сохранение названия
    document.getElementById('saveChatNameBtn').addEventListener('click', async () => {
        const newName = document.getElementById('editChatNameInput').value.trim();
        if (!newName) return;
        
        try {
            await API.chats.updateSettings(currentChatId, { name: newName });
            currentChat.name = newName;
            await loadChatInfo();
            document.getElementById('editNameModal').classList.remove('active');
            API.showToast('Название обновлено', 'success');
        } catch (error) {
            API.showToast('Ошибка обновления', 'error');
        }
    });
    
    // Сохранение ID
    document.getElementById('saveChatIdBtn').addEventListener('click', async () => {
        let newId = document.getElementById('editChatIdInput').value.trim();
        if (!newId) return;
        
        if (!newId.startsWith('#')) {
            newId = '#' + newId;
        }
        
        try {
            await API.chats.updateSettings(currentChatId, { chatId: newId });
            currentChat.chat_id = newId;
            await loadChatInfo();
            document.getElementById('editIdModal').classList.remove('active');
            API.showToast('ID чата обновлен', 'success');
        } catch (error) {
            API.showToast('Ошибка обновления', 'error');
        }
    });
    
    // Удаление чата
    document.getElementById('deleteChatItem').addEventListener('click', async () => {
        if (!confirm('Удалить чат навсегда? Это действие нельзя отменить.')) return;
        
        try {
            await API.chats.delete(currentChatId);
            window.location.href = '/dashboard.html';
        } catch (error) {
            API.showToast('Ошибка удаления чата', 'error');
        }
    });
    
    // Выход из чата
    document.getElementById('leaveChatItem').addEventListener('click', async () => {
        if (!confirm('Покинуть чат?')) return;
        
        try {
            await API.chats.leave(currentChatId);
            window.location.href = '/dashboard.html';
        } catch (error) {
            API.showToast('Ошибка выхода из чата', 'error');
        }
    });
    
    // Закрытие модалок
    document.querySelectorAll('.modal .close, .modal .cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.remove('active');
        });
    });
}

function initFileUpload() {
    const attachBtn = document.getElementById('attachButton');
    const fileInput = document.getElementById('fileInput');
    
    attachBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
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

function showLoader() {
    document.getElementById('messagesLoader')?.classList.remove('hidden');
}

function hideLoader() {
    document.getElementById('messagesLoader')?.classList.add('hidden');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Глобальные функции
window.sendMessage = sendMessage;
window.deleteMessage = deleteMessage;
window.kickMember = kickMember;
window.openImagePreview = function(url) {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    img.src = url;
    modal.classList.add('active');
    
    modal.querySelector('.close-modal').onclick = () => {
        modal.classList.remove('active');
        img.src = '';
    };
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            img.src = '';
        }
    });
};
