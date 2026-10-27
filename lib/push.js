const webpush = require('web-push');
const { sb } = require('./supabase');

let configurado = false;
function configurar() {
  if (configurado) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contacto@ejemplo.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  configurado = true;
}

// Envía una notificación push a las suscripciones de los clientes indicados.
async function enviarPush(clienteIds, { title, body, url }) {
  if (!clienteIds.length) return { enviados: 0, errores: [] };
  configurar();

  const subs = await sb(`suscripciones?cliente_id=in.(${clienteIds.join(',')})&select=*`);
  const payload = JSON.stringify({ title, body, url: url || '/mi' });
  let enviados = 0;
  const errores = [];

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 24 }
      );
      enviados++;
    } catch (e) {
      // 404/410: el navegador ya no acepta esa suscripción, la borramos
      if (e.statusCode === 404 || e.statusCode === 410) {
        await sb(`suscripciones?id=eq.${s.id}`, { method: 'DELETE', prefer: 'return=minimal' });
      } else {
        errores.push(`push ${e.statusCode || ''} ${String(e.message).slice(0, 150)}`.trim());
      }
    }
  }
  return { enviados, errores };
}

module.exports = { enviarPush };
