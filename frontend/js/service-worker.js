const CACHE_NAME = 'chaters-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/chat.html',
  '/css/style.css',
  '/js/api.js',
  '/js/auth.js',
  '/js/dashboard.js',
  '/js/chat.js',
  '/manifest.json'
];

// Установка сервис-воркера и кэширование статики
self.addEventListener('install', (event) => {
  console.log('🔄 Service Worker установлен');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Активация и очистка старых кэшей
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker активирован');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Перехват запросов (кэширование)
self.addEventListener('fetch', (event) => {
  // Не кэшируем API запросы
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  // Стратегия: Cache First, потом Network
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchResponse) => {
        // Кэшируем успешные ответы
        if (fetchResponse.status === 200) {
          const responseClone = fetchResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return fetchResponse;
      });
    }).catch(() => {
      // Если всё упало — отдаём главную
      if (event.request.mode === 'navigate') {
        return caches.match('/');
      }
    })
  );
});

// ========== PUSH-УВЕДОМЛЕНИЯ ==========
self.addEventListener('push', (event) => {
  console.log('📨 Получено push-уведомление', event);
  
  if (!event.data) {
    console.log('❌ Нет данных в уведомлении');
    return;
  }

  try {
    const data = event.data.json();
    console.log('📦 Данные уведомления:', data);
    
    const options = {
      body: data.body,
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/badge-72.png',
      vibrate: [200, 100, 200],
      tag: data.data?.chatId || 'chat',
      renotify: true,
      silent: false,
      data: data.data || {},
      actions: [
        {
          action: 'open',
          title: '📱 Открыть'
        },
        {
          action: 'close',
          title: '❌ Закрыть'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Chaters', options)
    );
  } catch (error) {
    console.error('❌ Ошибка парсинга push-уведомления:', error);
    
    // Если не JSON — показываем как текст
    event.waitUntil(
      self.registration.showNotification('Chaters', {
        body: event.data.text(),
        icon: '/icons/icon-192.png'
      })
    );
  }
});

// ========== КЛИК ПО УВЕДОМЛЕНИЮ ==========
self.addEventListener('notificationclick', (event) => {
  console.log('👆 Клик по уведомлению:', event.notification);
  
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/';
  console.log('🔗 Открываем URL:', urlToOpen);

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      // Проверяем, есть ли уже открытое окно
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          console.log('✅ Фокус на существующее окно');
          return client.focus();
        }
      }
      // Открываем новое окно
      if (clients.openWindow) {
        console.log('🆕 Открываем новое окно');
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ========== ЗАКРЫТИЕ УВЕДОМЛЕНИЯ ==========
self.addEventListener('notificationclose', (event) => {
  console.log('🚫 Уведомление закрыто:', event.notification);
});

// ========== ФОНОВАЯ СИНХРОНИЗАЦИЯ ==========
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    console.log('🔄 Фоновая синхронизация сообщений');
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  try {
    const db = await openDB();
    const offlineMessages = await db.getAll('offline-messages');
    
    console.log(`📤 Отправка ${offlineMessages.length} офлайн-сообщений`);
    
    for (const message of offlineMessages) {
      try {
        await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(message),
          credentials: 'include'
        });
        
        await db.delete('offline-messages', message.id);
        console.log('✅ Сообщение отправлено:', message.id);
      } catch (error) {
        console.error('❌ Ошибка отправки офлайн-сообщения:', error);
      }
    }
  } catch (error) {
    console.error('❌ Ошибка синхронизации:', error);
  }
}

// ========== INDEXEDDB ДЛЯ ОФЛАЙН-СООБЩЕНИЙ ==========
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ChatersOffline', 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('offline-messages')) {
        db.createObjectStore('offline-messages', { keyPath: 'id', autoIncrement: true });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
