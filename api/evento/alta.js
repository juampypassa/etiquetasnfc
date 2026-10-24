const { sb } = require('../../lib/supabase');

// Lo llama el script de Apps Script con cada inscripción (Sí o No).
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const secreto = process.env.EVENTO_SECRET;
  if (!secreto || req.headers['x-evento-secret'] !== secreto) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { codigo, nombre, email, matricula, asiste } = req.body || {};
  if (!/^[a-f0-9]{16}$/.test(codigo || '')) {
    return res.status(400).json({ error: 'Código inválido' });
  }

  try {
    await sb('invitados', {
      method: 'POST',
      prefer: 'return=minimal',
      body: { codigo, nombre, email, matricula, asiste: asiste === true },
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    // 409: ya existe una inscripción con ese mail para este evento
    if (String(err.message).includes('409')) {
      return res.status(409).json({ error: 'Ya estaba inscripto' });
    }
    console.error(err);
    return res.status(500).json({ error: 'No se pudo guardar' });
  }
};
