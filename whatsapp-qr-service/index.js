/*
 * Servicio de WhatsApp por QR para Waibo — whatsapp-web.js
 *
 * Corre en la PC del admin (WhatsApp bloquea IPs de datacenter) y se expone con un
 * túnel de Cloudflare. Railway lo llama para mandar mensajes/multimedia, etiquetar y
 * archivar; este servicio le avisa a Railway cada mensaje entrante.
 *
 * Basado en el bot del Captador de Clientes (misma versión de whatsapp-web.js y los
 * mismos rodeos para funciones rotas de la librería). El servicio anterior con Baileys
 * quedó en index.baileys.js.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

/* Parche a whatsapp-web.js 1.34.7 (se aplica en cada arranque, así sobrevive a un
   npm install). Al armar un mensaje con multimedia, la librería copia el objeto
   interno del archivo entero (`...mediaOptions`) dentro del mensaje. Ese objeto trae
   propiedades internas de WhatsApp (`__x_id` vacío, `parent`, `collection`…) y
   `__x_id` le gana al id real del mensaje: el envío falla con "Data passed to getter
   must include an id property". Copiamos solo los datos útiles del archivo.
   Utils.js se inyecta en la página como texto, por eso se parchea el archivo antes
   de cargar la librería. */
(function parchearEnvioMultimedia() {
  const archivo = path.join(__dirname, 'node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');
  const parches = [
    {
      marca: '/* waibo: media sin props internas */',
      ancla: '            ...mediaOptions,\n            ...(mediaOptions.toJSON ? mediaOptions.toJSON() : {}),',
      nuevo: "            /* waibo: media sin props internas */ ...Object.fromEntries(Object.entries(mediaOptions).filter(([k]) => !k.startsWith('_') && !['parent', 'collection', 'mirror', 'revisionNumber'].includes(k))),\n            ...(mediaOptions.toJSON ? mediaOptions.toJSON() : {}),"
    }
  ];
  try {
    let src = fs.readFileSync(archivo, 'utf8');
    let cambios = 0;
    for (const p of parches) {
      if (src.includes(p.marca)) continue;
      if (!src.includes(p.ancla)) { console.warn('⚠️ No se pudo aplicar un parche de multimedia (cambió la librería)'); continue; }
      src = src.replace(p.ancla, p.nuevo);
      cambios++;
    }
    if (cambios) {
      fs.writeFileSync(archivo, src);
      console.log('🩹 Parche de envío multimedia aplicado a whatsapp-web.js');
    }
  } catch (e) {
    console.warn('⚠️ Parche de multimedia:', e.message);
  }
})();

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '60mb' }));

const PORT = process.env.PORT || 3002;
const RAILWAY_BACKEND = process.env.RAILWAY_BACKEND_URL || 'https://whabot-backend-production.up.railway.app';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'whabot_qr_secret_2024';
const AUTH_DIR = path.join(__dirname, 'sessions-wweb');
const CHATMAP_FILE = path.join(__dirname, 'chatmap.json');
const LIDMAP_FILE = path.join(__dirname, 'lidmap.json');

// Chrome instalado: el Chromium que trae puppeteer no puede mandar videos (sin H.264).
const CHROME_DEFAULT = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_PATH = process.env.CHROME_PATH || (fs.existsSync(CHROME_DEFAULT) ? CHROME_DEFAULT : undefined);

process.on('unhandledRejection', (err) => console.error('⚠️ unhandledRejection:', err?.message || err));
process.on('uncaughtException', (err) => console.error('⚠️ uncaughtException:', err?.message || err));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Las notas de voz de WhatsApp tienen que ser OGG/Opus mono. Un audio subido puede ser
// MP3, M4A (iPhone), WAV o WebM (grabado en el navegador): lo convertimos con ffmpeg.
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
function aNotaDeVoz(base64) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', '48000',
      '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', '-f', 'ogg', 'pipe:1']);
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => reject(new Error('no se encontró ffmpeg: ' + e.message)));
    p.on('close', (code) => code === 0 ? resolve(Buffer.concat(out).toString('base64')) : reject(new Error('ffmpeg: ' + err.slice(0, 200))));
    p.stdin.end(Buffer.from(base64, 'base64'));
  });
}
const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

function leerJson(file) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}; } catch (_) { return {}; }
}
function guardarLuego(file, getData) {
  let t = null;
  return () => { clearTimeout(t); t = setTimeout(() => { try { fs.writeFileSync(file, JSON.stringify(getData())); } catch (_) {} }, 1500); };
}

// clientId -> { teléfono -> chatId }. Railway manda "to" como teléfono; acá recordamos
// el chatId exacto (a veces @lid) con el que ese cliente nos escribió, que es el único
// que funciona seguro para responder, etiquetar y archivar.
const chatmap = leerJson(CHATMAP_FILE);
const guardarChatmap = guardarLuego(CHATMAP_FILE, () => chatmap);
const lidmap = leerJson(LIDMAP_FILE); // lid (dígitos) -> teléfono (dígitos)
const guardarLidmap = guardarLuego(LIDMAP_FILE, () => lidmap);

const IMPORTED_FILE = path.join(__dirname, 'imported.json');
const imported = leerJson(IMPORTED_FILE); // clientId -> fecha de la última importación completa
const guardarImported = guardarLuego(IMPORTED_FILE, () => imported);

const sessions = {}; // clientId -> { client, status, qr, phone, labelsCache }
const importJobs = {}; // clientId -> { estado, total, hechos, chats, error }

/* Teléfono real de un remitente. Si viene @lid (id interno de WhatsApp, no es el
   teléfono) lo resolvemos contra WhatsApp y lo cacheamos. */
async function telefonoDe(client, addr) {
  const s = String(addr || '');
  if (!s) return '';
  if (!s.includes('@lid')) return soloDigitos(s);
  const lid = soloDigitos(s);
  if (lidmap[lid]) return lidmap[lid];
  try {
    const [par] = await client.getContactLidAndPhone([s]);
    const tel = soloDigitos(par && par.pn);
    if (tel && tel !== lid) { lidmap[lid] = tel; guardarLidmap(); return tel; }
  } catch (_) {}
  try {
    const c = await client.getContactById(s);
    const tel = soloDigitos(c && (c.number || (c.id && c.id.user)));
    if (tel && tel !== lid) { lidmap[lid] = tel; guardarLidmap(); return tel; }
  } catch (_) {}
  return '';
}

function chatIdPara(clientId, to) {
  const s = String(to || '');
  if (s.includes('@')) return s;
  const known = chatmap[clientId] && chatmap[clientId][soloDigitos(s)];
  return known || soloDigitos(s) + '@c.us';
}

/* Para un número con el que nunca se chateó, "549...@c.us" armado a mano falla
   ("Data passed to getter must include an id property"): hay que pedirle a WhatsApp
   el id real del número. En Argentina probamos también sin/con el 9. */
async function resolverDestino(client, clientId, to) {
  const s = String(to || '');
  if (s.includes('@')) return s;
  const digits = soloDigitos(s);
  const known = chatmap[clientId] && chatmap[clientId][digits];
  if (known) return known;
  const variantes = [digits];
  if (/^54(?!9)/.test(digits)) variantes.push('549' + digits.slice(2));
  if (/^549/.test(digits)) variantes.push('54' + digits.slice(3));
  for (const v of variantes) {
    try {
      const wid = await client.getNumberId(v);
      if (wid && wid._serialized) return wid._serialized;
    } catch (_) {}
  }
  throw new Error('ese número no tiene WhatsApp');
}

async function etiquetasDe(rec) {
  const ahora = Date.now();
  if (rec.labelsCache && ahora - rec.labelsCache.at < 5 * 60 * 1000) return rec.labelsCache.list;
  try {
    const list = (await rec.client.getLabels()).map((l) => ({ id: String(l.id), name: l.name }));
    rec.labelsCache = { at: ahora, list };
    return list;
  } catch (_) {
    return []; // la cuenta no es WhatsApp Business
  }
}

async function avisarBackend(ruta, body, timeout = 20000) {
  return axios.post(`${RAILWAY_BACKEND}/api/whatsapp-qr/${ruta}`, { ...body, secret: SERVICE_SECRET }, {
    headers: { 'x-service-secret': SERVICE_SECRET, 'Content-Type': 'application/json' },
    timeout
  });
}

/* Transcripción de notas de voz con el Whisper local del Captador de Clientes
   (faster-whisper + modelo ya bajado en su carpeta): gratis, sin internet y sin mandar
   el audio afuera. De a una por vez: cada transcripción carga el modelo en memoria. */
const TRANSCRIBIR_PY = process.env.TRANSCRIBIR_PY
  || 'C:\\Proyecto APP\\Captador de Clientes\\waibo-bot_1\\waibo-bot\\transcribir.py';
const PYTHON = process.env.PYTHON_PATH || 'python';
const MODO_TRANSCRIPCION = (process.env.TRANSCRIPCION || 'auto').toLowerCase();
let colaTranscripcion = Promise.resolve();

// msg.downloadMedia() falla con algunos audios en esta versión: vamos directo al gestor
// de descargas de WhatsApp pasándole el mimetype (sin eso rechaza los ptt con
// "Unexpected mimetype application/octet-stream"). Copiado de bajar-audio.js del Captador.
async function bajarMedia(client, msgId) {
  const r = await client.pupPage.evaluate(async (id) => {
    const Coll = window.require('WAWebCollections');
    let m = Coll.Msg.get(id);
    if (!m) m = (await Coll.Msg.getMessagesById([id]))?.messages?.[0];
    if (!m) return { error: 'no encuentro el mensaje' };
    try {
      if (m.mediaData && m.mediaData.mediaStage !== 'RESOLVED') await m.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 });
      const qpl = { addAnnotations() { return this; }, addPoint() { return this; } };
      const crudo = await window.require('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({
        directPath: m.directPath, encFilehash: m.encFilehash, filehash: m.filehash,
        mediaKey: m.mediaKey, mediaKeyTimestamp: m.mediaKeyTimestamp, type: m.type,
        mimetype: m.mimetype || 'audio/ogg; codecs=opus',
        signal: new AbortController().signal, downloadQpl: qpl
      });
      return { ok: true, b64: await window.WWebJS.arrayBufferToBase64Async(crudo), mimetype: m.mimetype || 'application/octet-stream', filename: m.filename || null };
    } catch (e) { return { error: String((e && e.message) || e).slice(0, 200) }; }
  }, msgId);
  if (!r || !r.ok) throw new Error((r && r.error) || 'no se pudo bajar el archivo');
  return r;
}

async function bajarAudio(client, msgId) {
  return (await bajarMedia(client, msgId)).b64;
}

const TIPOS_MEDIA = ['image', 'video', 'audio', 'ptt', 'document', 'sticker'];

/* ── Cola de envíos por línea ───────────────────────────────────────────────
   Todo lo que sale por una línea (bot, panel, vendedores, seguimiento) pasa por acá:
   - de a uno por línea, en orden de llegada;
   - entre un mensaje y el siguiente, entre 8 y 16 segundos al azar (un intervalo fijo
     se ve como una máquina; a CeluLock ya la restringieron por mandar en ráfaga);
   - el mismo texto al mismo número dentro de 10 minutos no sale dos veces;
   - tope por línea en 24 h (LIMITE_DIARIO, por defecto 500). Pasado el tope NO se descarta:
     el mensaje espera en la cola hasta que se libere lugar, y se avisa en el panel a quién
     le quedó demorado (perder gente en silencio es el error que más caro salió).
   Como este servicio es el único que habla con WhatsApp, esta cola es el candado de la
   línea. El candado de arranque (más abajo) impide que corran dos copias del servicio. */
const LIMITE_DIARIO = Number(process.env.LIMITE_DIARIO || 500);
const ESPERA_MIN = Number(process.env.ESPERA_MIN_MS || 8000);
const ESPERA_MAX = Number(process.env.ESPERA_MAX_MS || 16000);
const ultimoEnvio = {};  // clientId -> ms del último envío
const enviados24 = {};   // clientId -> [ms]
const recientes = {};    // clientId -> Map(firma -> ms)
const idsPropios = new Set(); // ids de lo que mandó este servicio (para no confundirlo con el celular)

// Prioridades: 0 = lo escribe una persona en el panel (pasa primero y no espera el tope),
// 1 = el bot le contesta a alguien que acaba de escribir, 2 = seguimiento y masivos.
// El espaciado de 8 a 16 s se respeta siempre; la prioridad solo decide quién va primero.
// Ventana horaria (VENTANA_HORARIA, por defecto 8-22, hora argentina): lo masivo nunca sale
// fuera de hora, y una respuesta del bot que quedó demorada más de 15 minutos (por el tope)
// tampoco: no se le escribe a nadie a las 3 de la mañana.
const VENTANA = String(process.env.VENTANA_HORARIA || '8-22').split('-').map(Number);
function dentroDeHorario() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false })) % 24;
  return h >= VENTANA[0] && h < VENTANA[1];
}
const pendientes = {}; // clientId -> [{ prioridad, llegada, firma, tarea, to, resolve, reject }]
const trabajando = {};
let avisoTope = {};    // clientId -> Set(to) ya avisados en esta ventana
const avisoManual = {}; // clientId -> ya se avisó que los manuales pasaron el tope

function puedeSalir(item) {
  if (item.prioridad === 0) return true;
  if (item.prioridad >= 2 || Date.now() - item.llegada > 15 * 60 * 1000) return dentroDeHorario();
  return true;
}

async function trabajarCola(clientId) {
  if (trabajando[clientId]) return;
  trabajando[clientId] = true;
  try {
    const fila = pendientes[clientId];
    while (fila && fila.length) {
      fila.sort((a, b) => a.prioridad - b.prioridad || a.llegada - b.llegada);
      // Los repetidos se descartan antes de mirar el tope: no tienen que ocupar lugar ni avisar
      const yaSalio = recientes[clientId] || new Map();
      for (let i = fila.length - 1; i >= 0; i--) {
        const f = fila[i].firma;
        if (f && yaSalio.has(f) && Date.now() - yaSalio.get(f) < 10 * 60 * 1000) {
          console.log(`[${clientId}] envío repetido descartado`);
          fila.splice(i, 1)[0].resolve({ duplicado: true });
        }
      }
      if (!fila.length) break;
      let lista = (enviados24[clientId] = (enviados24[clientId] || []).filter((t) => Date.now() - t < 24 * 3600 * 1000));
      const enTope = lista.length >= LIMITE_DIARIO;
      const idx = fila.findIndex((it) => puedeSalir(it) && (!enTope || it.prioridad === 0));
      if (idx === -1) {
        if (enTope) {
          const libre = lista[0] + 24 * 3600 * 1000;
          const avisados = (avisoTope[clientId] = avisoTope[clientId] || new Set());
          for (const it of fila) {
            if (it.to && !avisados.has(it.to)) {
              avisados.add(it.to);
              console.log(`[${clientId}] tope diario (${LIMITE_DIARIO}): el mensaje a ${it.to} queda esperando`);
              avisarBackend('line-limit', { clientId, to: it.to, limite: LIMITE_DIARIO, sale: new Date(libre).toISOString() }).catch(() => {});
            }
          }
        }
        await wait(60000);
        continue;
      }
      const item = fila.splice(idx, 1)[0];
      // Lo escrito a mano pasa aunque la línea esté en el tope (y suma al contador igual),
      // pero se avisa una vez por ventana: es el ritmo que hizo restringir a CeluLock.
      if (enTope && item.prioridad === 0 && !avisoManual[clientId]) {
        avisoManual[clientId] = true;
        console.log(`[${clientId}] mensajes escritos a mano por arriba del tope diario`);
        avisarBackend('line-limit', { clientId, to: null, limite: LIMITE_DIARIO, manual: true, enviados: lista.length }).catch(() => {});
      }
      const rec = (recientes[clientId] = recientes[clientId] || new Map());
      for (const [f, t] of rec) if (Date.now() - t > 10 * 60 * 1000) rec.delete(f);
      if (item.firma && rec.has(item.firma)) {
        console.log(`[${clientId}] envío repetido descartado`);
        item.resolve({ duplicado: true });
        continue;
      }
      const espera = ESPERA_MIN + Math.random() * (ESPERA_MAX - ESPERA_MIN);
      const falta = (ultimoEnvio[clientId] || 0) + espera - Date.now();
      if (falta > 0) await wait(falta);
      try {
        const r = await item.tarea();
        if (r && r.id && r.id._serialized) idsPropios.add(r.id._serialized);
        ultimoEnvio[clientId] = Date.now();
        lista.push(Date.now());
        if (item.firma) rec.set(item.firma, Date.now());
        if (lista.length < LIMITE_DIARIO) { avisoTope[clientId] = new Set(); avisoManual[clientId] = false; }
        item.resolve({ ok: true });
      } catch (e) {
        item.reject(e);
      }
    }
  } finally {
    trabajando[clientId] = false;
  }
}

function enviarEnCola(clientId, firma, tarea, to, prioridad = 1) {
  return new Promise((resolve, reject) => {
    (pendientes[clientId] = pendientes[clientId] || []).push({
      prioridad: [0, 1, 2].includes(Number(prioridad)) ? Number(prioridad) : 1,
      llegada: Date.now(), firma, tarea, to, resolve, reject
    });
    trabajarCola(clientId);
  });
}

function firmaDe(to, contenido) {
  return require('crypto').createHash('sha1').update(`${String(to).replace(/\D/g, '')}|${contenido}`).digest('hex');
}

// Una sola copia del servicio a la vez: dos procesos escribiendo sobre la misma línea
// fue lo que en el Captador mandó el mismo mensaje tres veces.
const CANDADO = path.join(__dirname, 'servicio.lock');
(function tomarCandado() {
  try {
    const previo = JSON.parse(fs.readFileSync(CANDADO, 'utf8'));
    let vivo = false;
    try { process.kill(previo.pid, 0); vivo = previo.pid !== process.pid; } catch (_) {}
    if (vivo && Date.now() - previo.ts < 45 * 60 * 1000) {
      console.error(`Ya hay otra copia del servicio corriendo (pid ${previo.pid}). Me cierro.`);
      process.exit(1);
    }
  } catch (_) {}
  const marcar = () => { try { fs.writeFileSync(CANDADO, JSON.stringify({ pid: process.pid, ts: Date.now() })); } catch (_) {} };
  marcar();
  setInterval(marcar, 5 * 60 * 1000).unref();
  process.on('exit', () => { try { const p = JSON.parse(fs.readFileSync(CANDADO, 'utf8')); if (p.pid === process.pid) fs.unlinkSync(CANDADO); } catch (_) {} });
})();


function transcribir(base64) {
  const tarea = colaTranscripcion.then(() => new Promise((resolve, reject) => {
    const os = require('os');
    const { execFile } = require('child_process');
    const archivo = path.join(os.tmpdir(), `waibo-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.ogg`);
    fs.writeFileSync(archivo, Buffer.from(base64, 'base64'));
    execFile(PYTHON, [TRANSCRIBIR_PY, archivo], {
      timeout: 180000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' } // sin esto los acentos llegan rotos
    }, (err, stdout) => {
      try { fs.unlinkSync(archivo); } catch (_) {}
      const linea = String(stdout || '').trim().split('\n').reverse().find((l) => l.trim().startsWith('{'));
      let out = null;
      try { out = linea && JSON.parse(linea); } catch (_) {}
      if (out && out.ok) return resolve(out.texto || '');
      reject(new Error((out && out.error) || (err && err.message) || 'transcripción sin respuesta'));
    });
  }));
  colaTranscripcion = tarea.catch(() => {});
  return tarea;
}

/* Texto de un mensaje entrante. En los multimedia el body es el epígrafe; si viene
   algo que no parece texto (base64 de miniatura) no lo usamos. */
function textoDe(msg) {
  if (msg.type === 'chat') return String(msg.body || '');
  const epigrafe = msg.body && msg.body.length < 1500 && !/^[A-Za-z0-9+/=]{200,}$/.test(msg.body) ? msg.body : '';
  const tipos = { image: 'una imagen', video: 'un video', document: 'un archivo', audio: 'un audio', ptt: 'un audio', sticker: 'un sticker', location: 'una ubicación' };
  const que = tipos[msg.type];
  if (!que) return '';
  return `[El cliente mandó ${que}]${epigrafe ? ' ' + epigrafe : ''}`;
}

// Inicializamos de a una: dos Chrome arrancando juntos se cuelgan.
let initQueue = Promise.resolve();

function ensureClient(clientId) {
  if (sessions[clientId]) return sessions[clientId];
  const rec = { client: null, status: 'starting', qr: null, phone: null, labelsCache: null };
  sessions[clientId] = rec;

  const client = new Client({
    authStrategy: new LocalAuth({ clientId, dataPath: AUTH_DIR }),
    puppeteer: {
      headless: true,
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run']
    }
  });
  rec.client = client;

  client.on('qr', async (qr) => {
    rec.status = 'qr_ready';
    rec.qr = await qrcode.toDataURL(qr);
    console.log(`[${clientId}] QR generado`);
  });
  client.on('authenticated', () => { if (rec.status !== 'connected') rec.status = 'connecting'; });
  client.on('ready', async () => {
    rec.status = 'connected';
    rec.qr = null;
    rec.phone = client.info?.wid?.user || null;
    console.log(`[${clientId}] Conectado - ${rec.phone}`);
    avisarBackend('connected', { clientId, phone: rec.phone }).catch((e) => console.error(`[${clientId}] aviso connected:`, e.message));
    // Primera vez que se conecta esta cuenta: traemos sus chats. Esperamos a que
    // WhatsApp Web termine de cargar la lista de chats.
    // Si ya se importó antes, al reconectar se ponen al día solo los chats con movimiento
    // desde la última vez (lo que llegó mientras estuvo desconectado).
    setTimeout(() => {
      const ultima = imported[clientId] ? Math.floor(new Date(imported[clientId]).getTime() / 1000) - 3600 : 0;
      importarHistorial(clientId, ultima ? { desde: ultima } : {}).catch((e) => console.error(`[${clientId}] importación:`, e.message));
    }, 20000);
  });
  client.on('auth_failure', (m) => {
    rec.status = 'auth_failure';
    console.error(`[${clientId}] auth_failure:`, m);
    avisarBackend('disconnected', { clientId, reason: 'auth_failure' }).catch(() => {});
  });
  client.on('disconnected', (reason) => {
    rec.status = 'disconnected';
    console.log(`[${clientId}] Desconectado: ${reason}`);
    avisarBackend('disconnected', { clientId, reason: String(reason || 'LOGOUT') }).catch((e) => console.error(`[${clientId}] aviso disconnected:`, e.message));
    // Se arranca una sesión nueva para que el panel muestre un QR fresco. Antes quedaba
    // trabada en "disconnected" (Chrome todavía tenía tomados los archivos de la sesión vieja)
    // y no había forma de volver a escanear sin reiniciar el servicio.
    setTimeout(async () => {
      if (sessions[clientId] !== rec) return;
      try { await client.destroy(); } catch (_) {}
      delete sessions[clientId];
      const dir = path.join(AUTH_DIR, `session-${clientId}`);
      for (let i = 0; i < 5 && fs.existsSync(dir); i++) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { await wait(3000); }
      }
      console.log(`[${clientId}] Sesión nueva para volver a escanear el QR`);
      ensureClient(clientId);
    }, 5000);
  });

  // Lo que se escribe desde el celular (los cierres que hace el dueño) se guarda en el
  // momento. WhatsApp no devuelve después la propia historia, así que si no se guarda acá
  // se pierde. Lo de este servicio se reconoce por el id: la sesión web arma ids que
  // empiezan con "3EB0"; los del celular son 32 caracteres hex (deviceType viene vacío).
  client.on('message_create', async (msg) => {
    try {
      if (!msg.fromMe) return;
      const idCompleto = msg.id && msg.id._serialized;
      const idCorto = String((msg.id && msg.id.id) || '');
      if (!idCompleto || idsPropios.has(idCompleto) || idCorto.startsWith('3EB0')) return;
      const to = String(msg.to || '');
      if (!to || to === 'status@broadcast' || to.endsWith('@g.us') || to.endsWith('@newsletter')) return;
      const tipos = { image: '[imagen]', video: '[video]', document: '[archivo]', audio: '[audio]', ptt: '[audio]', sticker: '[sticker]', location: '[ubicación]', vcard: '[contacto]' };
      const epigrafe = msg.body && msg.body.length < 1500 && !/^[A-Za-z0-9+/=]{200,}$/.test(msg.body) ? msg.body : '';
      const text = msg.type === 'chat' ? String(msg.body || '') : [tipos[msg.type] || `[${msg.type}]`, epigrafe].join(' ').trim();
      if (!text) return;
      const tel = await telefonoDe(client, to);
      const phone = tel || soloDigitos(to);
      if (!chatmap[clientId]) chatmap[clientId] = {};
      chatmap[clientId][phone] = to;
      guardarChatmap();
      console.log(`[${clientId}] Enviado desde el celular a ${phone}: ${text.slice(0, 60)}`);
      await avisarBackend('outgoing', { clientId, to: phone, text, waId: idCompleto, mediaType: TIPOS_MEDIA.includes(msg.type) ? msg.type : null }, 60000);
    } catch (err) {
      console.error(`[${clientId}] No se pudo guardar lo enviado desde el celular:`, err.response?.data?.error || err.message);
    }
  });

  client.on('message', async (msg) => {
    try {
      if (msg.fromMe) return;
      const from = String(msg.from || '');
      if (!from || from === 'status@broadcast' || from.endsWith('@g.us') || from.endsWith('@newsletter')) return;

      let text = textoDe(msg);
      if (!text) return;

      // Notas de voz: primero el Whisper local; si no está o falla, se manda el audio a
      // Railway para que lo transcriba un proveedor en la nube (TRANSCRIPCION=auto|local|nube).
      let audioParaNube = null;
      if (msg.type === 'ptt' || msg.type === 'audio') {
        let b64 = null;
        try { b64 = await bajarAudio(client, msg.id._serialized); }
        catch (e) { console.error(`[${clientId}] No se pudo bajar el audio:`, e.message); }
        if (b64) {
          let listo = false;
          if (MODO_TRANSCRIPCION !== 'nube' && fs.existsSync(TRANSCRIBIR_PY)) {
            try {
              const t0 = Date.now();
              const dicho = (await transcribir(b64)).trim();
              if (dicho) { text = `[Audio del cliente]: ${dicho}`; listo = true; }
              console.log(`[${clientId}] Audio transcripto en la PC en ${Math.round((Date.now() - t0) / 1000)}s: ${dicho.slice(0, 60)}`);
            } catch (e) {
              console.error(`[${clientId}] Whisper local falló:`, e.message);
            }
          }
          if (!listo && MODO_TRANSCRIPCION !== 'local') {
            audioParaNube = { data: b64, mimetype: msg._data?.mimetype || 'audio/ogg; codecs=opus' };
          }
        }
      }

      const tel = await telefonoDe(client, from);
      const phone = tel || soloDigitos(from);
      if (!chatmap[clientId]) chatmap[clientId] = {};
      chatmap[clientId][phone] = from;
      guardarChatmap();

      let labels = [];
      try {
        const chat = await msg.getChat();
        const ids = (chat.labels || []).map(String);
        if (ids.length) {
          const todas = await etiquetasDe(rec);
          labels = todas.filter((l) => ids.includes(l.id)).map((l) => l.name);
        }
      } catch (_) {}

      const name = msg._data?.notifyName || null;
      console.log(`[${clientId}] Mensaje entrante de ${phone}: ${text.slice(0, 60)}`);
      const media = TIPOS_MEDIA.includes(msg.type) ? { waId: msg.id._serialized, mediaType: msg.type } : { waId: msg.id._serialized };
      await avisarBackend('message', { clientId, from: phone, name, text, labels, ...media, ...(audioParaNube && { audio: audioParaNube }) }, 120000);
    } catch (err) {
      console.error(`[${clientId}] Error del backend:`, err.response?.data?.error || err.message);
    }
  });

  initQueue = initQueue.then(() => new Promise((resolve) => {
    let listo = false;
    const seguir = () => { if (!listo) { listo = true; resolve(); } };
    client.once('qr', seguir);
    client.once('ready', seguir);
    client.once('auth_failure', seguir);
    setTimeout(seguir, 60000);
    client.initialize().catch((e) => {
      rec.status = 'error';
      console.error(`[${clientId}] no pudo iniciar:`, String(e).slice(0, 200));
      seguir();
    });
  }));
  return rec;
}

function sesionLista(clientId) {
  const rec = sessions[clientId];
  return rec && rec.status === 'connected' ? rec : null;
}

/* Etiquetar sumando (sin pisar las que ya tenga). Va directo a los módulos internos
   porque las funciones de etiquetas de la librería están rotas en esta versión de
   WhatsApp Web. Copiado del Captador, que lo tiene probado. */
async function etiquetar(client, chatId, telefono, nombreEtiqueta) {
  return client.pupPage.evaluate(async (idExacto, digits, nombre) => {
    const Coll = window.require('WAWebCollections');
    const labels = window.WWebJS.getLabels();
    const lab = labels.find((l) => String(l.name).toLowerCase() === String(nombre).toLowerCase());
    if (!lab) return { ok: false, motivo: 'no existe la etiqueta «' + nombre + '»' };

    const variantes = digits ? [digits] : [];
    if (/^54(?!9)/.test(digits)) variantes.push('549' + digits.slice(2));
    if (/^549/.test(digits)) variantes.push('54' + digits.slice(3));
    const candidatos = [
      idExacto,
      ...variantes.map((v) => v + '@lid'),
      ...variantes.map((v) => v + '@c.us')
    ].filter(Boolean);

    let chat = null;
    for (let intento = 0; intento < 4 && !chat; intento++) {
      if (intento) await new Promise((r) => setTimeout(r, 2500));
      for (const id of candidatos) {
        try {
          const c = await window.WWebJS.getChat(id, { getAsModel: false });
          if (c) { chat = c; break; }
        } catch (e) {}
      }
    }
    if (!chat) return { ok: false, motivo: 'no encontré el chat' };
    if ((chat.labels || []).map(String).includes(String(lab.id))) return { ok: true, yaTenia: true };
    await Coll.Label.addOrRemoveLabels([{ id: lab.id, type: 'add' }], [chat]);
    return { ok: true };
  }, chatId, soloDigitos(telefono), nombreEtiqueta);
}

async function archivar(client, chatId) {
  for (let intento = 0; intento < 2; intento++) {
    try { await client.archiveChat(chatId); return true; } catch (_) {}
    try {
      const ok = await client.pupPage.evaluate(async (id) => {
        const chat = await window.WWebJS.getChat(id, { getAsModel: false });
        if (!chat) return false;
        await window.require('WAWebCmd').Cmd.archiveChat(chat, true);
        return true;
      }, chatId);
      if (ok) return true;
    } catch (_) {}
    await wait(800);
  }
  return false;
}

/* Importar los chats existentes. WhatsApp Web tiene en memoria uno o dos mensajes por
   chat hasta que se abre la conversación, así que pedimos el historial chat por chat
   (loadEarlierMsgs) con una pausa entre uno y otro: tironear cientos de chats de golpe
   es patrón de scraping. Mismo método que el Captador. Se manda a Railway en lotes. */
const SISTEMA = ['e2e_notification', 'notification_template', 'call_log', 'revoked', 'gp2', 'protocol', 'ciphertext'];

async function importarHistorial(clientId, { porChat = 30, demora = 400, desde = 0 } = {}) {
  const rec = sesionLista(clientId);
  if (!rec) throw new Error('WhatsApp no está conectado');
  if (importJobs[clientId]?.estado === 'corriendo') return importJobs[clientId];

  const job = { estado: 'corriendo', tipo: desde ? 'actualizacion' : 'completa', total: 0, hechos: 0, chats: 0, error: null, inicio: new Date().toISOString() };
  importJobs[clientId] = job;

  (async () => {
    try {
      const ids = await rec.client.pupPage.evaluate((desde) => {
        const Coll = window.require('WAWebCollections');
        const arr = Coll.Chat.getModelsArray ? Coll.Chat.getModelsArray() : (Coll.Chat.models || []);
        return arr
          .filter((c) => !desde || (c.t || 0) >= desde)
          .slice()
          .sort((a, b) => (b.t || 0) - (a.t || 0))
          .map((c) => c.id && c.id._serialized)
          .filter((id) => id && !id.includes('@g.us') && !id.includes('status@') && !id.includes('@newsletter'));
      }, desde);
      job.total = ids.length;
      console.log(`[${clientId}] Importando ${ids.length} chats…`);

      rec.labelsCache = null;
      const labelsList = await etiquetasDe(rec);
      const labelName = (id) => (labelsList.find((l) => l.id === String(id)) || {}).name;

      let lote = [];
      const enviarLote = async () => {
        if (!lote.length) return;
        const chats = lote;
        lote = [];
        try {
          await avisarBackend('history-chats', { clientId, chats }, 180000);
          job.chats += chats.length;
        } catch (e) {
          console.error(`[${clientId}] error mandando lote de historial:`, e.response?.data?.error || e.message);
        }
      };

      for (const id of ids) {
        if (job.estado !== 'corriendo') break;
        try {
          const c = await rec.client.pupPage.evaluate(async (chatId, porChat, sistema) => {
            const Coll = window.require('WAWebCollections');
            const wid = window.require('WAWebWidFactory').createWid(chatId);
            const chat = Coll.Chat.get(wid) || (await Coll.Chat.find(wid));
            if (!chat || !chat.msgs) return null;

            const utiles = () => chat.msgs.getModelsArray().filter((m) => !m.isNotification && !sistema.includes(m.type));
            let vueltas = 0;
            while (utiles().length < porChat && vueltas < 4) {
              const mas = await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat });
              vueltas++;
              if (!mas || !mas.length) break;
            }

            let tel = '';
            try {
              if (chatId.includes('@lid')) {
                const p = window.require('WAWebApiContact').getPhoneNumber(chat.id);
                tel = (p && p.user) || '';
              } else {
                tel = chat.id.user || '';
              }
            } catch (e) {}

            const tipos = { image: '[imagen]', video: '[video]', document: '[archivo]', audio: '[audio]', ptt: '[audio]', sticker: '[sticker]', location: '[ubicación]', vcard: '[contacto]' };
            // En los multimedia m.body trae el base64 de la miniatura: se usa el epígrafe.
            const msgs = utiles().slice(-porChat).map((m) => {
              let texto = m.type === 'chat' ? String(m.body || '') : [tipos[m.type] || `[${m.type}]`, m.caption || ''].join(' ').trim();
              return { mio: !!(m.id && m.id.fromMe), ts: m.t || 0, texto: texto.slice(0, 4000), waId: m.id ? (m.id._serialized || String(m.id)) : null, tipo: m.type };
            }).filter((m) => m.texto);

            const ct = chat.contact || {};
            let nombre = ct.pushname || ct.notifyName || chat.name || chat.formattedTitle || '';
            if (nombre && !/[a-zA-ZÀ-ɏ]/.test(nombre)) nombre = '';

            return { tel, nombre: String(nombre).trim().slice(0, 80), archivado: !!chat.archive, labels: (chat.labels || []).map(String), msgs };
          }, id, porChat, SISTEMA);

          if (c && c.tel && c.msgs.length) {
            if (!chatmap[clientId]) chatmap[clientId] = {};
            chatmap[clientId][c.tel] = id;
            lote.push({
              phone: c.tel,
              name: c.nombre || null,
              archived: c.archivado,
              labels: c.labels.map(labelName).filter(Boolean),
              messages: c.msgs.map((m) => ({ role: m.mio ? 'assistant' : 'user', text: m.texto, timestamp: new Date(m.ts * 1000).toISOString(), waId: m.waId || null, mediaType: TIPOS_MEDIA.includes(m.tipo) ? m.tipo : null }))
            });
          }
        } catch (_) {}
        job.hechos++;
        if (lote.length >= 40) await enviarLote();
        await wait(demora);
      }
      await enviarLote();
      guardarChatmap();
      if (job.estado === 'corriendo') {
        job.estado = 'terminado';
        imported[clientId] = new Date().toISOString();
        guardarImported();
      }
      console.log(`[${clientId}] Importación ${job.estado}: ${job.chats} chats con mensajes de ${job.total}`);
    } catch (e) {
      job.estado = 'error';
      job.error = e.message;
      console.error(`[${clientId}] Error importando historial:`, e.message);
    }
  })();
  return job;
}

function checkSecret(req, res, next) {
  const secret = req.headers['x-service-secret'] || req.body?.secret;
  if (secret !== SERVICE_SECRET) return res.status(401).json({ error: 'No autorizado' });
  next();
}

app.get('/health', (req, res) => {
  res.json({ ok: true, engine: 'whatsapp-web.js', sessions: Object.keys(sessions).length });
});

app.post('/session/start', checkSecret, (req, res) => {
  const { clientId } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
  const rec = ensureClient(clientId);
  res.json({ status: rec.status, phone: rec.phone });
});

app.get('/session/:clientId/status', checkSecret, (req, res) => {
  const rec = sessions[req.params.clientId];
  if (!rec) return res.json({ status: 'disconnected', qr: null });
  res.json({ status: rec.status, qr: rec.qr, phone: rec.phone });
});

app.post('/session/:clientId/send', checkSecret, async (req, res) => {
  const rec = sesionLista(req.params.clientId);
  if (!rec) return res.status(409).json({ error: 'WhatsApp no está conectado' });
  const { to, message, prioridad } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'faltan to/message' });
  try {
    const r = await enviarEnCola(req.params.clientId, firmaDe(to, message), async () =>
      rec.client.sendMessage(await resolverDestino(rec.client, req.params.clientId, to), message), to, prioridad);
    res.json(r);
  } catch (err) {
    console.error(`[${req.params.clientId}] error enviando:`, err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/session/:clientId/send-media', checkSecret, async (req, res) => {
  const rec = sesionLista(req.params.clientId);
  if (!rec) return res.status(409).json({ error: 'WhatsApp no está conectado' });
  const { to, mimetype, data, filename, caption, asVoice, prioridad } = req.body;
  if (!to || !mimetype || !data) return res.status(400).json({ error: 'faltan to/mimetype/data' });
  try {
    // asVoice: el audio llega como nota de voz (micrófono), no como archivo.
    const media = asVoice
      ? new MessageMedia('audio/ogg; codecs=opus', await aNotaDeVoz(data), 'audio.ogg')
      : new MessageMedia(mimetype, data, filename || undefined);
    const opciones = asVoice ? { sendAudioAsVoice: true } : { caption: caption || '' };
    const firma = firmaDe(to, `media:${data.length}:${data.slice(0, 64)}:${caption || ''}`);
    const r = await enviarEnCola(req.params.clientId, firma, async () =>
      rec.client.sendMessage(await resolverDestino(rec.client, req.params.clientId, to), media, opciones), to, prioridad);
    res.json(r);
  } catch (err) {
    console.error(`[${req.params.clientId}] error enviando multimedia:`, err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Baja una foto, audio, video o archivo de un mensaje para mostrarlo en el panel
app.get('/session/:clientId/media', checkSecret, async (req, res) => {
  const rec = sesionLista(req.params.clientId);
  if (!rec) return res.status(409).json({ error: 'WhatsApp no está conectado' });
  try {
    const r = await bajarMedia(rec.client, String(req.query.waId || ''));
    res.json({ mimetype: r.mimetype, data: r.b64, filename: r.filename });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.get('/session/:clientId/labels', checkSecret, async (req, res) => {
  const rec = sesionLista(req.params.clientId);
  if (!rec) return res.status(409).json({ error: 'WhatsApp no está conectado', labels: [] });
  rec.labelsCache = null;
  res.json({ labels: await etiquetasDe(rec) });
});

app.post('/session/:clientId/label', checkSecret, async (req, res) => {
  const rec = sesionLista(req.params.clientId);
  if (!rec) return res.status(409).json({ error: 'WhatsApp no está conectado' });
  const { to, label } = req.body;
  if (!to || !label) return res.status(400).json({ error: 'faltan to/label' });
  try {
    const r = await etiquetar(rec.client, chatIdPara(req.params.clientId, to), to, label);
    if (!r.ok) return res.status(422).json({ error: r.motivo });
    res.json({ ok: true, yaTenia: !!r.yaTenia });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/session/:clientId/archive', checkSecret, async (req, res) => {
  const rec = sesionLista(req.params.clientId);
  if (!rec) return res.status(409).json({ error: 'WhatsApp no está conectado' });
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'falta to' });
  const ok = await archivar(rec.client, chatIdPara(req.params.clientId, to));
  if (!ok) return res.status(500).json({ error: 'no se pudo archivar' });
  res.json({ ok: true });
});

app.post('/session/:clientId/import-history', checkSecret, async (req, res) => {
  try {
    const job = await importarHistorial(req.params.clientId);
    res.json(job);
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});

app.get('/session/:clientId/import-status', checkSecret, (req, res) => {
  res.json(importJobs[req.params.clientId] || { estado: imported[req.params.clientId] ? 'terminado' : 'nunca', ultima: imported[req.params.clientId] || null });
});

app.post('/session/:clientId/disconnect', checkSecret, async (req, res) => {
  const { clientId } = req.params;
  const rec = sessions[clientId];
  delete sessions[clientId];
  if (importJobs[clientId]) importJobs[clientId].estado = 'cancelado';
  delete imported[clientId];
  guardarImported();
  if (rec?.client) {
    try { await rec.client.logout(); } catch (_) {}
    try { await rec.client.destroy(); } catch (_) {}
  }
  try { fs.rmSync(path.join(AUTH_DIR, `session-${clientId}`), { recursive: true, force: true }); } catch (_) {}
  res.json({ ok: true });
});

// Vigilante: una sesión puede decir "connected" con la página de Chrome muerta
// ("detached Frame"). Cada 2 minutos la probamos y si no responde la reiniciamos.
setInterval(async () => {
  for (const [clientId, rec] of Object.entries(sessions)) {
    if (rec.status !== 'connected') continue;
    try {
      await Promise.race([rec.client.getState(), wait(20000).then(() => { throw new Error('timeout'); })]);
    } catch (e) {
      console.log(`[${clientId}] la sesión no responde (${e.message}), reiniciando…`);
      delete sessions[clientId];
      try { await rec.client.destroy(); } catch (_) {}
      ensureClient(clientId);
    }
  }
}, 2 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`✅ Waibo QR Service (whatsapp-web.js) en puerto ${PORT}`);
  console.log(`   Backend Railway: ${RAILWAY_BACKEND}`);
  console.log(`   Chrome: ${CHROME_PATH || 'Chromium de puppeteer (no manda videos)'}`);
  try {
    const guardadas = fs.existsSync(AUTH_DIR)
      ? fs.readdirSync(AUTH_DIR).filter((d) => d.startsWith('session-')).map((d) => d.slice('session-'.length))
      : [];
    if (guardadas.length) {
      console.log(`   Restaurando ${guardadas.length} sesión(es): ${guardadas.join(', ')}`);
      guardadas.forEach((id) => ensureClient(id));
    } else {
      console.log('   Sin sesiones guardadas para restaurar.');
    }
  } catch (e) {
    console.error('   Error restaurando sesiones:', e.message);
  }
});
