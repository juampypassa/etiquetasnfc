const { sb } = require('../../lib/supabase');
const { cookie } = require('../../lib/util');
const { enlaceEntrada } = require('../../lib/wallet');

// Solo para quien activó su acceso (tiene la cookie). Redirige a Google Wallet.
module.exports = async (req, res) => {
  const codigo = cookie(req, 'acceso_evento');
  if (!codigo || !/^[a-f0-9]{16}$/.test(codigo)) {
    return res.status(403).send('Primero abrí el link que te enviamos por mail.');
  }
  try {
    const rows = await sb(`invitados?codigo=eq.${codigo}&select=*`);
    const inv = rows[0];
    if (!inv || !inv.asiste) return res.status(403).send('No encontramos tu acceso.');
    const url = await enlaceEntrada(inv);
    res.setHeader('Location', url);
    return res.status(302).end();
  } catch (err) {
    console.error('Wallet entrada:', err.message);
    return res.status(500).send('No pudimos generar tu entrada. Probá de nuevo.');
  }
};
