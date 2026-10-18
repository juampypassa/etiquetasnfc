const { sb } = require('../../lib/supabase');
const { cookie, page, getLocal, getCliente, saldo } = require('../../lib/util');

module.exports = async (req, res) => {
  const slug = String(req.query.local || '');

  try {
    const loc = await getLocal(slug);
    if (!loc) return page(res, 404, 'Local no encontrado', 'Revisá la etiqueta.');

    const token = cookie(req, `tok_${slug}`);
    const cliente = token ? await getCliente(token, loc.id) : null;
    if (!cliente) {
      return page(res, 200, 'Primero registrate',
        'Entrá a <a href="/">la página del programa</a> y registrate.');
    }

    const requeridos = loc.sellos_requeridos;
    const total = await saldo(cliente.id);
    if (total < requeridos) {
      return page(res, 200, 'Todavía no',
        `Llevás ${total} de ${requeridos}. Te faltan ${requeridos - total}.`);
    }

    // Evita un canje doble si toca dos veces seguidas
    const ultimo = await sb(
      `sellos?cliente_id=eq.${cliente.id}&etiqueta=eq.canje&select=created_at&order=created_at.desc&limit=1`
    );
    if (ultimo[0] && Date.now() - new Date(ultimo[0].created_at).getTime() < 5 * 60 * 1000) {
      return page(res, 200, 'Canje registrado', 'Mostrá esta pantalla en caja.');
    }

    await sb('sellos', {
      method: 'POST',
      prefer: 'return=minimal',
      body: { cliente_id: cliente.id, etiqueta: 'canje', cantidad: -requeridos },
    });

        const quedan = total - requeridos;
    const txt = quedan === 1 ? '1 sello' : `${quedan} sellos`;
    return page(res, 200, `¡${loc.premio_texto}!`,
      `Mostrá esta pantalla en caja. Te quedan ${txt}.`);
  } catch (e) {
    console.error(e);
    return page(res, 500, 'Algo salió mal', 'Probá de nuevo en un momento.');
  }
};
