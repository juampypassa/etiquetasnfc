const webpush = require('web-push');
const { sb } = require('../../lib/supabase');
const { getLocal } = require('../../lib/util');

// Envía una notificación push a todos los clientes con avisos activados de un local.
// Requiere el header x-evento-secret (igual que promo/enviar).
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const secreto = process.env.EVENTO_SECRET;
  if (!secreto || req.headers['x-evento-secret'] !== secreto) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { local, titulo, texto, url } = req.body || {};
  const title = String(titulo || '').slice(0, 60);
  const body = String(texto || '').slice(0, 200);
  if (!title || !body) return res.status(400).json({ error: 'Falta título o texto' });

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:contacto@ejemplo.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const loc = await getLocal(String(local || 'cafe-rojo'));
    if (!loc) return res.status(404).json({ error: 'Local no encontrado' });

    const clientes = await sb(`clientes?local_id=eq.${loc.id}&select=id`);
    if (!clientes.length) return res.status(200).json({ ok: true, enviados: 0, errores: [] });

    const ids = clientes.map((c) => c.id).join(',');
    const subs = await sb(`suscripciones?cliente_id=in.(${ids})&select=*`);

    const payload = JSON.stringify({ title, body, url: String(url || '/mi') });
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
          errores.push(String(e.statusCode || e.message).slice(0, 200));
        }
      }
    }
    return res.status(200).json({ ok: true, enviados, errores });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'No se pudo enviar' });
  }
};
