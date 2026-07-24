// Service worker do Firebase Cloud Messaging para Web/PWA - registrado separadamente do
// sw.js principal (cache). Sem ele, o navegador não consegue mostrar push em segundo plano.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBtv6kvVpVfzN05dHMXiSu15PEE7VwAi0k',
  authDomain: 'caule-c064f.firebaseapp.com',
  projectId: 'caule-c064f',
  storageBucket: 'caule-c064f.firebasestorage.app',
  messagingSenderId: '480280627243',
  appId: '1:480280627243:web:c42590a6f3f15465fc826e',
});

// Mensagens chegam aqui só como "data" (a Cloud Function manda data-only de propósito, pra
// poder controlar o ícone grande no Android nativo) - então precisamos montar a notificação
// nós mesmos em vez de deixar o SDK do FCM auto-exibir.
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  self.registration.showNotification(data.title || 'Caule', {
    body: data.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    data,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let path = '/';
  if (data.type === 'tarefa' && data.id) path = `/app?tarefa=${data.id}`;
  else if (data.type === 'mensagem') path = '/comunicacao';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(path);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(path);
    })
  );
});
