const { sb } = require('../../lib/supabase');
const { page, esc } = require('../../lib/util');

// Se abre desde el link del mail. Activa el celular con una cookie.
module.exports = async (req, res) => {
  const codigo = String(req.query.codigo || '');
  if (!/^[a-f0-9]{16}$/.test(codigo)) {
    return page(res, 404, 'Link no válido', 'Revisá el link que te enviamos por mail.');
  }

  try {
    const rows = await sb(`invitados?codigo=eq.${codigo}&select=*`);
    const inv = rows[0];
    if (!inv) return page(res, 404, 'Link no válido', 'No encontramos tu acceso.');

    if (!inv.activado_at) {
      await sb(`invitados?codigo=eq.${codigo}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { activado_at: new Date().toISOString() },
      });
    }

    res.setHeader(
      'Set-Cookie',
      `acceso_evento=${codigo}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
    );
    return page(
      res, 200, '¡Listo, ' + String(inv.nombre || '').split(' ')[0] + '!',
      'Tu acceso está activo. En la entrada, acercá tu celular a la etiqueta o escaneá el QR.'
    );
  } catch (err) {
    console.error(err);
    return page(res, 500, 'Algo salió mal', 'Probá de nuevo en un rato.');
  }
};
