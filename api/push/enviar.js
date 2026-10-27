const { getLocal } = require('../../lib/util');
const { sb } = require('../../lib/supabase');
const { enviarPush } = require('../../lib/push');

// Envía solo notificación push a los clientes con avisos activados de un local.
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
    const loc = await getLocal(String(local || 'cafe-rojo'));
    if (!loc) return res.status(404).json({ error: 'Local no encontrado' });

    const clientes = await sb(`clientes?local_id=eq.${loc.id}&select=id`);
    const r = await enviarPush(clientes.map((c) => c.id), { title, body, url });
    return res.status(200).json({ ok: true, enviados: r.enviados, errores: r.errores });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'No se pudo enviar' });
  }
};
