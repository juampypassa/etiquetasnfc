// Service worker: recibe notificaciones push y abre la tarjeta al tocarlas.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Handler mínimo de fetch (pasa todo a la red). Lo pide Chrome para considerar la app instalable.
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let data = { title: 'Café Rojo', body: 'Tenés novedades', url: '/mi' };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    // Si el push no trae JSON, se muestra el mensaje por defecto
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/mi' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/mi';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
