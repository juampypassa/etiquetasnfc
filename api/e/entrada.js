const { sb } = require('../../lib/supabase');
const { page, cookie, esc } = require('../../lib/util');

// Lo que se ve al tocar la etiqueta o escanear el QR de la entrada.
module.exports = async (req, res) => {
  const codigo = cookie(req, 'acceso_evento');

  // Sin cookie: la persona no abrió su link, o nunca se inscribió.
  if (!codigo || !/^[a-f0-9]{16}$/.test(codigo)) {
    return page(res, 200, 'No encontramos tu acceso',
      'Si te inscribiste, abrí el link del mail desde este mismo celular y volvé a tocar la etiqueta. Si no te inscribiste, no podés ingresar.');
  }

  try {
    const rows = await sb(`invitados?codigo=eq.${codigo}&select=*`);
    const inv = rows[0];
    if (!inv) {
      return page(res, 403, 'No estás en la lista', 'Revisá tu inscripción o escribí a la organización.');
    }
    if (!inv.asiste) {
      return page(res, 403, 'No figurás como asistente',
        `${esc(inv.nombre)}, tu inscripción indica que no ibas a asistir. Escribí a la organización si fue un error.`);
    }

    const ingresos = await sb(`ingresos?invitado_id=eq.${inv.id}&select=created_at&order=created_at.asc`);
    if (ingresos.length > 0) {
      const hora = new Date(ingresos[0].created_at).toLocaleTimeString('es-AR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba',
      });
      return page(res, 200, 'Ya habías ingresado',
        `${esc(inv.nombre)}, tu ingreso quedó registrado a las ${hora}.`);
    }

    await sb('ingresos', {
      method: 'POST',
      prefer: 'return=minimal',
      body: { invitado_id: inv.id },
    });
    return page(res, 200, 'Permitido', `Bienvenido, ${esc(inv.nombre)}.`);
  } catch (err) {
    console.error(err);
    return page(res, 500, 'Algo salió mal', 'Avisá en la entrada.');
  }
};
