const { sb } = require('../../lib/supabase');
const { cookie, getLocal, getCliente } = require('../../lib/util');

// Guarda la suscripción de notificaciones del navegador/celular de un cliente.
// Se identifica con la misma cookie que la tarjeta de sellos.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const slug = 'cafe-rojo';
  const body = req.body || {};
  const endpoint = String(body.endpoint || '');
  const p256dh = String((body.keys && body.keys.p256dh) || '');
  const auth = String((body.keys && body.keys.auth) || '');

  if (!endpoint.startsWith('https://') || !p256dh || !auth) {
    return res.status(400).json({ error: 'Suscripción inválida' });
  }

  try {
    const loc = await getLocal(slug);
    const token = cookie(req, `tok_${slug}`);
    const cliente = token && loc ? await getCliente(token, loc.id) : null;
    if (!cliente) return res.status(401).json({ error: 'Primero registrate' });

    await sb('suscripciones?on_conflict=endpoint', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: { cliente_id: cliente.id, endpoint, p256dh, auth },
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'No se pudo guardar' });
  }
};
