const { sb } = require('../../lib/supabase');
const { cookie, page, getLocal, getCliente, saldo } = require('../../lib/util');
const { sincronizar } = require('../../lib/wallet');

const VENTANA_MS = 2 * 60 * 60 * 1000; // un sello cada 2 horas

module.exports = async (req, res) => {
  const slug = String(req.query.local || '');

  try {
    const loc = await getLocal(slug);
    if (!loc) return page(res, 404, 'Local no encontrado', 'Revisá la etiqueta.');

    const token = cookie(req, `tok_${slug}`);
    const cliente = token ? await getCliente(token, loc.id) : null;
    if (!cliente) {
      return page(res, 200, 'Primero registrate',
        'Entrá a <a href="/">la página del programa</a>, registrate y volvé a tocar la etiqueta.');
    }

    const ultimo = await sb(
      `sellos?cliente_id=eq.${cliente.id}&etiqueta=eq.suma&select=created_at&order=created_at.desc&limit=1`
    );
    if (ultimo[0] && Date.now() - new Date(ultimo[0].created_at).getTime() < VENTANA_MS) {
      const total = await saldo(cliente.id);
      return page(res, 200, 'Ya sumaste hace poco',
        `Llevás ${total} de ${loc.sellos_requeridos} sellos. Volvé más tarde.`);
    }

    await sb('sellos', {
      method: 'POST',
      prefer: 'return=minimal',
      body: { cliente_id: cliente.id, etiqueta: 'suma', cantidad: 1 },
    });

    const total = await saldo(cliente.id);
    try { await sincronizar(cliente, total); } catch (e) { console.error('Wallet:', e.message); }
    const extra = total >= loc.sellos_requeridos
      ? ' ¡Completaste la tarjeta! Tocá la etiqueta de canje.'
      : '';
    return page(res, 200, '¡Sello sumado!',
      `Llevás ${total} de ${loc.sellos_requeridos}.${extra}`);
  } catch (e) {
    console.error(e);
    return page(res, 500, 'Algo salió mal', 'Probá de nuevo en un momento.');
  }
};
