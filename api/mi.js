const { getLocal, getCliente, saldo, cookie, esc, page } = require('../lib/util');

// Página "Mi tarjeta": muestra sellos y activa notificaciones. Es la app instalable (PWA).
module.exports = async (req, res) => {
  const slug = 'cafe-rojo';
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
    const puntos = Array.from({ length: requeridos }, (_, i) =>
      `<span class="punto${i < total ? ' lleno' : ''}"></span>`).join('');
    const vapid = process.env.VAPID_PUBLIC_KEY || '';

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#E85D24">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icon-192.png">
<title>Mi tarjeta · ${esc(loc.nombre || 'Café Rojo')}</title>
<style>
:root{--accent:#E85D24;--accent-dark:#993C1D;--ink:#1f1f1d;--muted:#5f5e5a;--bg:#fbfaf7;--border:#e4e2da}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg);min-height:100vh;padding:1.25rem 1rem 2rem}
.wrap{max-width:520px;margin:0 auto}
h1{font-size:1.5rem;margin:.25rem 0 .25rem}
p{color:var(--muted);margin:.25rem 0 1rem;line-height:1.5}
.tarjeta{background:#fff;border:1px solid var(--border);border-radius:14px;padding:1.25rem;margin-top:1rem}
.progreso{font-size:1.05rem;margin:0 0 .75rem}
.puntos{display:grid;grid-template-columns:repeat(5,1fr);gap:.6rem;margin-bottom:.5rem}
.punto{aspect-ratio:1;border-radius:50%;border:2px dashed var(--border);background:#f4f2ec}
.punto.lleno{background:var(--accent);border:2px solid var(--accent-dark)}
button{background:var(--accent);color:#fff;border:0;border-radius:10px;padding:.9rem 1.1rem;font:inherit;font-weight:600;width:100%;cursor:pointer;margin-top:.75rem}
button:disabled{background:#c9c7bf;cursor:default}
.aviso{margin-top:.75rem;font-size:.95rem;color:var(--muted);min-height:1.2em}
.ayuda{font-size:.9rem;color:var(--muted);margin-top:1.25rem;border-top:1px solid var(--border);padding-top:1rem}
</style></head>
<body><div class="wrap">
  <h1>Hola, ${esc(cliente.nombre)}</h1>
  <p>Tu tarjeta de sellos en ${esc(loc.nombre || 'Café Rojo')}.</p>

  <div class="tarjeta">
    <p class="progreso">Llevás <strong>${total}</strong> de ${requeridos} sellos.${total >= requeridos ? ' ¡Completaste la tarjeta! Tocá la etiqueta de canje.' : ' Tocá la etiqueta del mostrador para sumar.'}</p>
    <div class="puntos">${puntos}</div>

    <button id="notif" type="button">Activar avisos de promos</button>
    <div id="aviso" class="aviso" role="status"></div>
  </div>

  <div class="ayuda">
    <strong>Para tener la tarjeta siempre a mano:</strong><br>
    Android (Chrome): menú ⋮ → "Instalar app" o "Agregar a inicio".<br>
    iPhone (Safari): botón Compartir → "Agregar a pantalla de inicio". Después abrila desde ese ícono.
  </div>
</div>

<script>
const VAPID = ${JSON.stringify(vapid)};
const btn = document.getElementById('notif');
const aviso = document.getElementById('aviso');
const soporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const enApp = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function bytesDeClave(b64) {
  const base = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base), (c) => c.charCodeAt(0));
}

async function guardarSuscripcion(sub) {
  const res = await fetch('/api/push/suscribir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  });
  if (!res.ok) throw new Error('guardar');
}

async function activar() {
  btn.disabled = true;
  aviso.textContent = '';
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') {
      aviso.textContent = 'No activaste los avisos. Podés hacerlo desde la configuración del navegador.';
      btn.disabled = false;
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytesDeClave(VAPID),
      });
    }
    await guardarSuscripcion(sub);
    btn.textContent = 'Avisos activados';
    aviso.textContent = 'Listo. Te avisamos cuando tengamos promos.';
  } catch (e) {
    aviso.textContent = 'No pudimos activar los avisos. Probá de nuevo.';
    btn.disabled = false;
  }
}

if (!soporta) {
  btn.disabled = true;
  aviso.textContent = esIOS && !enApp
    ? 'En iPhone, primero agregá la app a la pantalla de inicio y abrila desde ahí.'
    : 'Tu navegador no admite avisos. Probá con Chrome.';
} else if (esIOS && !enApp) {
  aviso.textContent = 'En iPhone, primero agregá la app a la pantalla de inicio y abrila desde ahí.';
}

if (soporta) {
  navigator.serviceWorker.register('/sw.js');
  btn.addEventListener('click', activar);
  // Si ya dio permiso antes, mantenemos la suscripción sincronizada con esta tarjeta
  if (Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await guardarSuscripcion(sub).catch(() => {});
        btn.textContent = 'Avisos activados';
        btn.disabled = true;
      }
    });
  }
}
</script>
</body></html>`);
  } catch (e) {
    console.error(e);
    return page(res, 500, 'Algo salió mal', 'Probá de nuevo en un momento.');
  }
};
