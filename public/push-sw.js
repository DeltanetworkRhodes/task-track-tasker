// Push notification handlers — loaded by VitePWA via importScripts
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(
      data.title || 'DeltaNetwork', {
        body: data.body || '',
        icon: '/pwa-192x192.png',
        badge: '/favicon.png',
        data: data.data || {},
        vibrate: [200, 100, 200],
        requireInteraction: false,
      }
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client)
          return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
