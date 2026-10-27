const { sb } = require('../../lib/supabase');
const { getLocal, saldo } = require('../../lib/util');
const { enviarPromo } = require('../../lib/wallet');
const { enviarPush } = require('../../lib/push');

// Manda una promo a un local por dos canales:
//  - Google Wallet (mensaje en la tarjeta)
//  - Push a la app instalada (notificación directa)
// Usa la misma clave secreta que el evento (EVENTO_SECRET).
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const secreto = process.env.EVENTO_SECRET;
  if (!secreto || req.headers['x-evento-secret'] !== secreto) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { local, titulo, texto, whatsapp } = req.body || {};
  const titu = String(titulo || '').slice(0, 60);
  const cuerpo = String(texto || '').slice(0, 300);
  if (!titu || !cuerpo) return res.status(400).json({ error: 'Falta título o texto' });

  try {
    const loc = await getLocal(String(local || 'cafe-rojo'));
    if (!loc) return res.status(404).json({ error: 'Local no encontrado' });

    let filtro = `clientes?local_id=eq.${loc.id}&select=*`;
    if (whatsapp) filtro += `&whatsapp=eq.${String(whatsapp).replace(/\D/g, '')}`;
    const clientes = await sb(filtro);

    // Wallet
    let enviados = 0;
    const errores = [];
    for (const c of clientes) {
      try {
        const total = await saldo(c.id);
        await enviarPromo(c, total, titu, cuerpo);
        enviados++;
      } catch (e) {
        errores.push(`wallet: ${e.message.slice(0, 200)}`);
      }
    }

    // Push (si falla, no corta el envío de Wallet)
    let enviadosPush = 0;
    try {
      const r = await enviarPush(clientes.map((c) => c.id), { title: titu, body: cuerpo, url: '/mi' });
      enviadosPush = r.enviados;
      errores.push(...r.errores);
    } catch (e) {
      errores.push(`push: ${String(e.message).slice(0, 200)}`);
    }

    return res.status(200).json({ ok: true, enviados, enviados_push: enviadosPush, errores });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'No se pudo enviar' });
  }
};
