const { sb } = require('./supabase');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function cookie(req, name) {
  const raw = req.headers.cookie || '';
  const found = raw.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

// titulo se escapa aquí. mensaje es HTML propio: nunca le pases datos del usuario sin esc()
function page(res, status, titulo, mensaje) {
  res
    .status(status)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<style>
body{font-family:system-ui,sans-serif;background:#FDDCAC;color:#16361E;margin:0;min-height:100vh;display:grid;place-items:center;padding:1.5rem;text-align:center}
h1{font-size:1.7rem;margin:0 0 .5rem}
p{color:#5f5e5a;font-size:1.1rem;line-height:1.5}
a{color:#EF461D}
</style></head><body><div><h1>${esc(titulo)}</h1><p>${mensaje}</p></div></body></html>`);
}

async function getLocal(slug) {
  const rows = await sb(`locales?slug=eq.${encodeURIComponent(slug)}&select=*`);
  return rows[0] || null;
}

async function getCliente(token, localId) {
  const rows = await sb(
    `clientes?token=eq.${encodeURIComponent(token)}&local_id=eq.${localId}&select=*`
  );
  return rows[0] || null;
}

async function saldo(clienteId) {
  const rows = await sb(`sellos?cliente_id=eq.${clienteId}&select=cantidad`);
  return rows.reduce((acc, r) => acc + r.cantidad, 0);
}

module.exports = { esc, cookie, page, getLocal, getCliente, saldo };
