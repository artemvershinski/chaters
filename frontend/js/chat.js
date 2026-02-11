let currentChatId = null;
let ws = null;
let messageLimit = 50;
let loadingMessages = false;
let allMessagesLoaded = false;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
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
    markChatAsRead();
});

async function loadUserProfile() {
    try {
        currentUser = await API.users.getProfile();
    } catch (error) {
        console.error('Failed to load user profile', error);
    }
}

async function loadChatInfo() {
    try {
        const chatName = document.querySelector('.chat-name');
        const chatIdElement = document.querySelector('.chat-id');
        
        const chats = await API.chats.getAll();
        const currentChat = chats.find(c => c.chat_id === currentChatId || c.id.toString() === currentChatId);
        
        if (currentChat) {
            chatName.textContent = currentChat.name;
            chatIdElement.textContent = currentChat.chat_id;
            
            if (currentChat.message_ttl > 0) {
                const ttlInfo = document.createElement('span');
                ttlInfo.className = 'ttl-badge';
                ttlInfo.textContent = `🗑️ ${currentChat.message_ttl}д`;
                document.querySelector('.chat-header-right').appendChild(ttlInfo);
            }
        }
    } catch (error) {
        API.showToast('Ошибка загрузки чата', 'error');
    }
}

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join',
            chatId: currentChatId
        }));
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'message') {
                appendMessage(data.message, false);
                playNotificationSound();
            } else if (data.type === 'message_deleted') {
                removeMessage(data.messageId);
            } else if (data.type === 'typing') {
                showTypingIndicator(data.userNickname);
            }
        } catch (error) {
            console.error('WebSocket error:', error);
        }
    };
    
    ws.onclose = () => {
        setTimeout(initWebSocket, 3000);
    };
}

async function loadMessages(before = null) {
    if (loadingMessages || allMessagesLoaded) return;
    
    loadingMessages = true;
    showLoader();
    
    try {
        const messages = await API.messages.get(currentChatId, messageLimit, before);
        const messagesContainer = document.getElementById('messagesContainer');
        
        if (messages.length < messageLimit) {
            allMessagesLoaded = true;
        }
        
        if (before === null) {
            messagesContainer.innerHTML = '';
        }
        
        messages.reverse().forEach(message => {
            appendMessage(message, true);
        });
        
        if (before === null) {
            scrollToBottom();
        }
    } catch (error) {
        console.error('Failed to load messages:', error);
    } finally {
        loadingMessages = false;
        hideLoader();
    }
}

function appendMessage(message, isHistory = false) {
    const container = document.getElementById('messagesContainer');
    const isOwn = message.user_id === currentUser?.id;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isOwn ? 'own' : 'other'}`;
    messageElement.dataset.messageId = message.id;
    
    let contentHtml = '';
    
    if (message.file_url) {
        if (message.file_type?.startsWith('image/')) {
            contentHtml = `<div class="message-image">
                <img src="${message.file_url}" loading="lazy" onclick="openImagePreview('${message.file_url}')">
                ${message.content ? `<div class="message-caption">${escapeHtml(message.content)}</div>` : ''}
            </div>`;
        } else if (message.file_type?.startsWith('audio/')) {
            contentHtml = `<div class="message-audio">
                <audio controls src="${message.file_url}"></audio>
                ${message.content ? `<div class="message-caption">${escapeHtml(message.content)}</div>` : ''}
            </div>`;
        } else {
            contentHtml = `<div class="message-file">
                <a href="${message.file_url}" target="_blank" class="file-link">
                    <span class="file-icon">📎</span>
                    <span class="file-name">${message.file_name || 'Файл'}</span>
                </a>
                ${message.content ? `<div class="message-caption">${escapeHtml(message.content)}</div>` : ''}
            </div>`;
        }
    } else {
        contentHtml = `<div class="message-text">${escapeHtml(message.content)}</div>`;
    }
    
    const time = new Date(message.sent_at).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-nickname">${escapeHtml(message.user_nickname)}</span>
            <span class="message-time">${time}</span>
            ${isOwn ? '<button class="delete-message" onclick="deleteMessage(' + message.id + ')">✕</button>' : ''}
        </div>
        ${contentHtml}
    `;
    
    if (isHistory) {
        container.insertBefore(messageElement, container.firstChild);
    } else {
        container.appendChild(messageElement);
        scrollToBottom();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if (!content) return;
    
    input.value = '';
    
    try {
        const message = await API.messages.sendText(currentChatId, content);
        
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'message',
                chatId: currentChatId,
                message: message
            }));
        }
    } catch (error) {
        API.showToast('Ошибка отправки', 'error');
    }
}

async function deleteMessage(messageId) {
    if (!confirm('Удалить сообщение?')) return;
    
    try {
        await API.messages.delete(messageId);
        
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'delete',
                chatId: currentChatId,
                messageId: messageId
            }));
        }
        
        removeMessage(messageId);
    } catch (error) {
        API.showToast('Ошибка удаления', 'error');
    }
}

function removeMessage(messageId) {
    const message = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (message) {
        message.remove();
    }
}

function initEventListeners() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendButton');
    
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    input.addEventListener('input', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'typing',
                chatId: currentChatId
            }));
        }
    });
    
    sendBtn.addEventListener('click', sendMessage);
    
    document.getElementById('attachButton')?.addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    
    document.getElementById('voiceButton')?.addEventListener('click', toggleVoiceRecording);
    
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.addEventListener('scroll', () => {
        if (messagesContainer.scrollTop < 100 && !allMessagesLoaded && !loadingMessages) {
            const firstMessage = messagesContainer.firstChild;
            if (firstMessage) {
                loadMessages(firstMessage.dataset.messageId);
            }
        }
    });
}

function initFileUpload() {
    const fileInput = document.getElementById('fileInput');
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        API.showLoader();
        
        try {
            const result = await API.messages.sendFile(currentChatId, file);
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'message',
                    chatId: currentChatId,
                    message: result
                }));
            }
            
            fileInput.value = '';
        } catch (error) {
            API.showToast(error.message, 'error');
        } finally {
            API.hideLoader();
        }
    });
}

let mediaRecorder = null;
let audioChunks = [];

function initVoiceRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        document.getElementById('voiceButton').style.display = 'none';
        return;
    }
}

async function toggleVoiceRecording() {
    const button = document.getElementById('voiceButton');
    
    if (mediaRecorder && mediaRecorder.state === 'recording') {
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
                    await API.messages.sendFile(currentChatId, audioFile);
                } catch (error) {
                    API.showToast('Ошибка отправки голосового', 'error');
                }
                
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            button.innerHTML = '⏹️';
            button.classList.add('recording');
        } catch (error) {
            API.showToast('Микрофон недоступен', 'error');
        }
    }
}

function showTypingIndicator(userNickname) {
    const indicator = document.getElementById('typingIndicator');
    indicator.textContent = `${userNickname} печатает...`;
    indicator.classList.remove('hidden');
    
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => {
        indicator.classList.add('hidden');
    }, 2000);
}

function playNotificationSound() {
    if (document.hidden && Notification.permission === 'granted') {
        new Notification('Chaters', {
            body: 'Новое сообщение',
            icon: '/icons/icon-192.png'
        });
    }
}

async function markChatAsRead() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'read',
            chatId: currentChatId
        }));
    }
}

function openImagePreview(url) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <img src="${url}" alt="Preview">
            <button class="close-modal">✕</button>
        </div>
    `;
    
    modal.addEventListener('click', () => modal.remove());
    document.body.appendChild(modal);
}

function showLoader() {
    const loader = document.getElementById('messagesLoader');
    if (loader) loader.classList.remove('hidden');
}

function hideLoader() {
    const loader = document.getElementById('messagesLoader');
    if (loader) loader.classList.add('hidden');
}

window.deleteMessage = deleteMessage;
window.openImagePreview = openImagePreview;
