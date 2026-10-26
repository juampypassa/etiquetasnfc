const { sb } = require('../../lib/supabase');
const { page, esc } = require('../../lib/util');

// Lo abre la cámara al escanear el QR de la entrada
module.exports = async (req, res) => {
  const codigo = String(req.query.codigo || '');
  if (!/^[a-f0-9]{16}$/.test(codigo)) {
    return page(res, 404, 'QR no válido', 'Este código no corresponde a una entrada.');
  }
  try {
    const rows = await sb(`invitados?codigo=eq.${codigo}&select=*`);
    const inv = rows[0];
    if (!inv) return page(res, 403, 'No está inscripto', 'Esta entrada no figura en la lista.');
    if (!inv.asiste) return page(res, 403, 'No figura como asistente', `${esc(inv.nombre)} indicó que no iba a asistir.`);

    const ingresos = await sb(`ingresos?invitado_id=eq.${inv.id}&select=created_at&order=created_at.asc`);
    if (ingresos.length > 0) {
      const hora = new Date(ingresos[0].created_at).toLocaleTimeString('es-AR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba',
      });
      return page(res, 200, 'Ya había ingresado', `${esc(inv.nombre)}, ingresó a las ${hora}.`);
    }

    await sb('ingresos', { method: 'POST', prefer: 'return=minimal', body: { invitado_id: inv.id } });
    return page(res, 200, 'Ingreso registrado', `Bienvenido, ${esc(inv.nombre)}.`);
  } catch (err) {
    console.error(err);
    return page(res, 500, 'Algo salió mal', 'Probá de nuevo.');
  }
};
