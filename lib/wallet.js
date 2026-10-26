const crypto = require('crypto');

const BASE = 'https://etiquetasnfc.vercel.app';
const LOGO = `${BASE}/logo.png`;
const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';

// Ubicación de prueba para la notificación por cercanía (coordenadas de un punto público)
const UBICACION_LOCAL = { latitude: 31.353558, longitude: -64.238625 };

let tokenCache = { value: null, exp: 0 };
let claseLista = false;

function config() {
  const issuer = process.env.GOOGLE_ISSUER_ID;
  const sa = JSON.parse((process.env.GOOGLE_WALLET_SA_KEY || '').trim());
  return { issuer, sa, classId: `${issuer}.cafe_rojo_sellos` };
}

function b64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function firmar(sa, data) {
  return crypto.createSign('RSA-SHA256').update(data).sign(sa.private_key, 'base64url');
}

async function accessToken() {
  if (tokenCache.value && Date.now() < tokenCache.exp - 60000) return tokenCache.value;
  const { sa } = config();
  const ahora = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const claims = b64({
    iss: sa.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 3600,
  });
  const assertion = `${header}.${claims}.${firmar(sa, `${header}.${claims}`)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Token Google: ' + JSON.stringify(data));
  tokenCache = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function api(method, path, body) {
  const token = await accessToken();
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function asegurarClase() {
  if (claseLista) return;
  const { classId } = config();
  const existe = await api('GET', `loyaltyClass/${classId}`);

  if (existe.status === 404) {
    const crea = await api('POST', 'loyaltyClass', {
      id: classId,
      issuerName: 'Tarjeta de sellos',
      programName: 'Café Rojo',
      programLogo: { sourceUri: { uri: LOGO } },
      hexBackgroundColor: '#E85D24',
      reviewStatus: 'UNDER_REVIEW',
    });
    if (crea.status >= 300) throw new Error('Crear clase: ' + JSON.stringify(crea.data));
  } else if (existe.status >= 300) {
    throw new Error('Leer clase: ' + JSON.stringify(existe.data));
  }
  claseLista = true;
}

// El ID del objeto usa el ID interno del cliente, no el token secreto de la cookie
function objetoDe(cliente, total) {
  const { issuer, classId } = config();
  return {
    id: `${issuer}.${cliente.id.replace(/-/g, '')}`,
    classId,
    state: 'ACTIVE',
    accountId: cliente.id,
    accountName: cliente.nombre,
    loyaltyPoints: { label: 'Sellos', balance: { int: total } },
    merchantLocations: [UBICACION_LOCAL],
  };
}

// Crea el objeto si no existe, o actualiza el saldo si ya existe
async function sincronizar(cliente, total) {
  await asegurarClase();
  const obj = objetoDe(cliente, total);

  const actual = await api('PATCH', `loyaltyObject/${obj.id}`, {
    loyaltyPoints: obj.loyaltyPoints,
    merchantLocations: obj.merchantLocations,
  });
  if (actual.status === 404) {
    const crea = await api('POST', 'loyaltyObject', obj);
    if (crea.status >= 300) throw new Error('Crear objeto: ' + JSON.stringify(crea.data));
  } else if (actual.status >= 300) {
    throw new Error('Actualizar objeto: ' + JSON.stringify(actual.data));
  }
}

// Link "Guardar en Google Wallet": un JWT firmado con la clave de la cuenta de servicio
function enlaceGuardar(cliente, total) {
  const { sa } = config();
  const obj = objetoDe(cliente, total);
  const ahora = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const payload = b64({
    iss: sa.client_email,
    aud: 'google',
    typ: 'savetowallet',
    iat: ahora,
    origins: [BASE],
    payload: { loyaltyObjects: [obj] },
  });
  const firma = firmar(sa, `${header}.${payload}`);
  return `https://pay.google.com/gp/v/save/${header}.${payload}.${firma}`;
}

// ---- Entradas de evento (Google Wallet eventTicket) ----

const CLASE_EVENTO = 'evento_prueba';

function claseEventoId() {
  return `${config().issuer}.${CLASE_EVENTO}`;
}

async function asegurarClaseEvento() {
  const id = claseEventoId();
  const existe = await api('GET', `eventTicketClass/${id}`);
  if (existe.status === 404) {
    const crea = await api('POST', 'eventTicketClass', {
      id,
      issuerName: 'Evento de prueba',
      eventName: { defaultValue: { language: 'es', value: 'Evento de prueba' } },
      venue: {
        name: { defaultValue: { language: 'es', value: 'Lugar de prueba' } },
        address: { defaultValue: { language: 'es', value: 'Córdoba, Argentina' } },
      },
      dateTime: { start: '2026-11-20T20:00:00' },
      hexBackgroundColor: '#1F4E79',
      reviewStatus: 'UNDER_REVIEW',
    });
    if (crea.status >= 300) throw new Error('Crear clase evento: ' + JSON.stringify(crea.data));
  } else if (existe.status >= 300) {
    throw new Error('Leer clase evento: ' + JSON.stringify(existe.data));
  }
}

// El QR lleva un link a nuestra página de validación, así cualquier cámara lo abre
function objetoEntrada(inv) {
  const { issuer } = config();
  return {
    id: `${issuer}.ev${inv.id.replace(/-/g, '')}`,
    classId: claseEventoId(),
    state: 'ACTIVE',
    ticketHolderName: inv.nombre,
    barcode: {
      type: 'QR_CODE',
      value: `${BASE}/v/${inv.codigo}`,
      alternateText: inv.codigo,
    },
  };
}

// Link "Guardar en Google Wallet" para la entrada de un invitado
async function enlaceEntrada(inv) {
  await asegurarClaseEvento();
  const { sa } = config();
  const obj = objetoEntrada(inv);
  const ahora = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const payload = b64({
    iss: sa.client_email,
    aud: 'google',
    typ: 'savetowallet',
    iat: ahora,
    origins: [BASE],
    payload: { eventTicketObjects: [obj] },
  });
  const firma = firmar(sa, `${header}.${payload}`);
  return `https://pay.google.com/gp/v/save/${header}.${payload}.${firma}`;
}

// Manda un mensaje de promo a la tarjeta del cliente, con notificación
async function enviarPromo(cliente, total, titulo, texto) {
  const obj = objetoDe(cliente, total);
  const r = await api('PATCH', `loyaltyObject/${obj.id}`, {
    messages: [{
      id: crypto.randomUUID(),
      header: titulo,
      body: texto,
      messageType: 'TEXT',
    }],
    notifyPreference: 'NOTIFY',
  });
  if (r.status >= 300) throw new Error('Promo: ' + JSON.stringify(r.data));
}

module.exports = { sincronizar, enlaceGuardar, enlaceEntrada, enviarPromo };

