const { sb } = require('../lib/supabase');
const { getLocal, saldo } = require('../lib/util');
const { sincronizar, enlaceGuardar } = require('../lib/wallet');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const body = req.body || {};
  const slug = String(body.local || 'cafe-rojo');
  const nombre = String(body.nombre || '').trim().slice(0, 60);
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '');

  if (!nombre || whatsapp.length < 8) {
    return res.status(400).json({ error: 'Completá nombre y un WhatsApp válido.' });
  }

  try {
    const loc = await getLocal(slug);
    if (!loc) return res.status(404).json({ error: 'Local no encontrado.' });

    // Si el WhatsApp ya existe en ese local, reutiliza el mismo cliente
    const rows = await sb('clientes?on_conflict=local_id,whatsapp', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: { local_id: loc.id, nombre, whatsapp },
    });
    const cliente = rows[0];

    // Cookie que el navegador manda después al tocar la etiqueta
    res.setHeader(
      'Set-Cookie',
      `tok_${slug}=${cliente.token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
    );

    const total = await saldo(cliente.id);

    // Si Wallet falla, el registro igual se guarda y se sigue con sellos
    let saveUrl = null;
    try {
      saveUrl = enlaceGuardar(cliente, total);
    } catch (e) {
      console.error('Wallet enlace:', e.message);
    }
    try {
      await sincronizar(cliente, total);
    } catch (e) {
      console.error('Wallet sync:', e.message);
    }

    return res.status(200).json({
      ok: true,
      sellos: total,
      requeridos: loc.sellos_requeridos,
      saveUrl,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'No pudimos guardar tu registro. Probá de nuevo.' });
  }
};
