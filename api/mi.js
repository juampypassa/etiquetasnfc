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
<meta name="theme-color" content="#16361E">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Titan+One&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
<title>Mi tarjeta · ${esc('Tierra de Sol')}</title>
<style>
:root{--dark:#16361E;--green:#1E4426;--cream:#FDDCAC;--paper:#FFF3DC;--accent:#EF461D;--accent-dark:#B8320F;--leaf:#A9D18E;--brown:#7A4A1E;--ink:#16361E;--muted:#4d5b43}
*{box-sizing:border-box}
body{margin:0;font-family:"Barlow",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--cream);min-height:100vh}
.cabecera{background:var(--dark);color:var(--cream);text-align:center;padding:1.5rem 1rem 3rem;border-bottom:6px solid var(--brown)}
.cabecera img{width:110px;height:auto;display:block;margin:0 auto .5rem}
.cabecera h1{font-family:"Titan One",system-ui,sans-serif;font-weight:400;font-size:1.5rem;margin:0;color:var(--cream)}
main{max-width:520px;margin:-2.2rem auto 0;padding:0 1.1rem 2rem;position:relative}
.tarjeta{background:var(--paper);border:3px solid var(--brown);border-radius:18px;padding:1.3rem 1.15rem;box-shadow:0 6px 0 var(--brown)}
.progreso{font-size:1.1rem;margin:0 0 .9rem;color:var(--dark)}
.puntos{display:grid;grid-template-columns:repeat(5,1fr);gap:.6rem;margin-bottom:.4rem}
.punto{aspect-ratio:1;border-radius:50%;border:2px dashed var(--brown);background:#fff}
.punto.lleno{background:var(--accent);border:2px solid var(--accent-dark)}
button{background:var(--accent);color:#fff;border:0;border-bottom:4px solid var(--accent-dark);border-radius:12px;padding:.9rem 1.1rem;font-family:"Titan One",system-ui,sans-serif;font-size:1.05rem;width:100%;cursor:pointer;margin-top:.9rem}
button:disabled{opacity:.55;cursor:default}
.aviso{margin-top:.75rem;font-size:1rem;color:var(--dark);min-height:1.2em;font-weight:500}
.ayuda{font-size:.95rem;color:var(--muted);margin-top:1.4rem;background:var(--dark);color:var(--cream);border-radius:14px;padding:1rem 1.1rem;line-height:1.6}
[hidden]{display:none !important}
.instalar{margin:0 0 1rem;background:var(--dark);color:var(--cream);border-bottom:4px solid #0b2112;width:100%}
.ayuda strong{color:var(--leaf);font-family:"Titan One",system-ui,sans-serif;font-weight:400}
</style></head>
<body>
<header class="cabecera">
  <img src="/logo.png" alt="Tierra de Sol">
  <h1>Hola, ${esc(cliente.nombre)}</h1>
</header>
<main>
  <button id="instalar" class="instalar" type="button" hidden>Instalar Tierra de Sol</button>
  <section class="tarjeta">
    <p class="progreso">Llevás <strong>${total}</strong> de ${requeridos} sellos.${total >= requeridos ? ' ¡Completaste la tarjeta! Tocá la etiqueta de canje.' : ' Tocá la etiqueta del mostrador para sumar.'}</p>
    <div class="puntos">${puntos}</div>

    <button id="notif" type="button">Activar avisos de promos</button>
    <div id="aviso" class="aviso" role="status"></div>
  </section>

  <div class="ayuda">
    <strong>Para tener la tarjeta siempre a mano:</strong><br>
    Android (Chrome): menú ⋮ → "Instalar app" o "Agregar a inicio".<br>
    iPhone (Safari): botón Compartir → "Agregar a pantalla de inicio". Después abrila desde ese ícono.
  </div>
</main>

<script>
const VAPID = ${JSON.stringify(vapid)};
const btn = document.getElementById('notif');
const aviso = document.getElementById('aviso');
const soporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const enApp = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Instalación directa: cuando Chrome permite instalar, mostramos nuestro propio botón
let eventoInstalar = null;
const botonInstalar = document.getElementById('instalar');
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  eventoInstalar = e;
  botonInstalar.hidden = false;
});
botonInstalar.addEventListener('click', async function () {
  if (!eventoInstalar) return;
  eventoInstalar.prompt();
  await eventoInstalar.userChoice;
  eventoInstalar = null;
  botonInstalar.hidden = true;
});
window.addEventListener('appinstalled', function () {
  botonInstalar.hidden = true;
});

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
