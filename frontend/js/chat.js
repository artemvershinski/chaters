console.log('💬 chat.js загружен');

let currentChatId = null;
let ws = null;
let currentUser = null;
let allMessagesLoaded = false;
let loadingMessages = false;

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
        const chatNameEl = document.querySelector('.chat-name');
        const chatIdEl = document.querySelector('.chat-id');
        
        const chats = await API.chats.getAll();
        const currentChat = chats.find(c => c.chat_id === currentChatId);
        
        if (currentChat) {
            chatNameEl.textContent = currentChat.name;
            chatIdEl.textContent = currentChat.chat_id;
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки информации о чате');
    }
}

async function loadMessages() {
    if (loadingMessages || allMessagesLoaded) return;
    
    loadingMessages = true;
    showLoader();
    
    try {
        console.log('🔄 Загрузка сообщений...');
        const messages = await API.messages.get(currentChatId, 50);
        
        // ✅ ФИКС: проверяем, что messages — массив
        if (!Array.isArray(messages)) {
            console.error('❌ messages не массив:', messages);
            return;
        }
        
        console.log(`✅ Загружено ${messages.length} сообщений`);
        
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '';
        
        if (messages.length === 0) {
            document.getElementById('emptyChat').classList.remove('hidden');
            return;
        }
        
        document.getElementById('emptyChat').classList.add('hidden');
        
        // Сортируем от старых к новым для отображения
        messages.sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
        
        messages.forEach(message => appendMessage(message));
        scrollToBottom();
        
    } catch (error) {
        console.error('❌ Ошибка загрузки сообщений:', error);
        API.showToast('Не удалось загрузить сообщения', 'error');
    } finally {
        loadingMessages = false;
        hideLoader();
    }
}

function appendMessage(message) {
    if (!message || !message.id) return;
    
    const container = document.getElementById('messagesContainer');
    const isOwn = message.user_id === currentUser?.id;
    
    // Удаляем старую версию сообщения если есть
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
    scrollToBottom();
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if (!content) return;
    
    input.value = '';
    input.style.height = 'auto';
    
    try {
        console.log('📤 Отправка сообщения:', content);
        const message = await API.messages.sendText(currentChatId, content);
        
        // Добавляем сообщение сразу
        appendMessage(message);
        
        // Отправляем через WebSocket
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
        input.value = content; // Возвращаем текст
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
    const menuBtn = document.querySelector('.menu-button');
    
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
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = '/dashboard.html';
        });
    }
    
    // Меню чата
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            document.getElementById('chatMenu').classList.toggle('hidden');
        });
    }
    
    // Закрыть меню при клике вне
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.menu-button') && !e.target.closest('.chat-menu')) {
            document.getElementById('chatMenu').classList.add('hidden');
        }
    });
}

function initFileUpload() {
    const attachBtn = document.getElementById('attachButton');
    const fileInput = document.getElementById('fileInput');
    
    if (!attachBtn || !fileInput) return;
    
    attachBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        API.showLoader();
        
        try {
            console.log('📎 Отправка файла:', file.name);
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

let mediaRecorder = null;
let audioChunks = [];

function initVoiceRecording() {
    const voiceBtn = document.getElementById('voiceButton');
    
    if (!voiceBtn) return;
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        voiceBtn.style.display = 'none';
        return;
    }
    
    voiceBtn.addEventListener('click', toggleVoiceRecording);
}

async function toggleVoiceRecording() {
    const button = document.getElementById('voiceButton');
    
    if (mediaRecorder?.state === 'recording') {
        mediaRecorder.stop();
        button.innerHTML = '🎤';
        button.classList.remove('recording');
    } else {
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
                
                try {
                    console.log('🎤 Отправка голосового');
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
            };
            
            mediaRecorder.start();
            button.innerHTML = '⏹';
            button.classList.add('recording');
            
        } catch (error) {
            console.error('❌ Нет доступа к микрофону');
            API.showToast('Микрофон недоступен', 'error');
        }
    }
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

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
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
window.leaveChat = async function() {
    if (!confirm('Покинуть чат?')) return;
    
    try {
        await API.chats.leave(currentChatId);
        window.location.href = '/dashboard.html';
    } catch (error) {
        console.error('Ошибка выхода из чата');
        API.showToast('Не удалось покинуть чат', 'error');
    }
};

window.showMembers = function() {
    console.log('Показ участников');
    // TODO
};

window.showSettings = function() {
    console.log('Настройки чата');
    // TODO
};

window.openImagePreview = function(url) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="background: none; border: none;">
            <img src="${url}" style="max-width: 100%; max-height: 80vh; border-radius: 12px;">
            <button class="close" style="position: absolute; top: 20px; right: 20px;">×</button>
        </div>
    `;
    modal.addEventListener('click', () => modal.remove());
    document.body.appendChild(modal);
};
