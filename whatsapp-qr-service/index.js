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
    if (!imported[clientId]) {
      setTimeout(() => {
        importarHistorial(clientId).catch((e) => console.error(`[${clientId}] importación:`, e.message));
      }, 20000);
    }
  });
  client.on('auth_failure', (m) => { rec.status = 'auth_failure'; console.error(`[${clientId}] auth_failure:`, m); });
  client.on('disconnected', (reason) => {
    rec.status = 'disconnected';
    console.log(`[${clientId}] Desconectado: ${reason}`);
  });

  client.on('message', async (msg) => {
    try {
      if (msg.fromMe) return;
      const from = String(msg.from || '');
      if (!from || from === 'status@broadcast' || from.endsWith('@g.us') || from.endsWith('@newsletter')) return;

      const text = textoDe(msg);
      if (!text) return;

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
      await avisarBackend('message', { clientId, from: phone, name, text, labels }, 120000);
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

async function importarHistorial(clientId, { porChat = 30, demora = 400 } = {}) {
  const rec = sesionLista(clientId);
  if (!rec) throw new Error('WhatsApp no está conectado');
  if (importJobs[clientId]?.estado === 'corriendo') return importJobs[clientId];

  const job = { estado: 'corriendo', total: 0, hechos: 0, chats: 0, error: null, inicio: new Date().toISOString() };
  importJobs[clientId] = job;

  (async () => {
    try {
      const ids = await rec.client.pupPage.evaluate(() => {
        const Coll = window.require('WAWebCollections');
        const arr = Coll.Chat.getModelsArray ? Coll.Chat.getModelsArray() : (Coll.Chat.models || []);
        return arr
          .slice()
          .sort((a, b) => (b.t || 0) - (a.t || 0))
          .map((c) => c.id && c.id._serialized)
          .filter((id) => id && !id.includes('@g.us') && !id.includes('status@') && !id.includes('@newsletter'));
      });
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
              return { mio: !!(m.id && m.id.fromMe), ts: m.t || 0, texto: texto.slice(0, 4000) };
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
              messages: c.msgs.map((m) => ({ role: m.mio ? 'assistant' : 'user', text: m.texto, timestamp: new Date(m.ts * 1000).toISOString() }))
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
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'faltan to/message' });
  try {
    await wait(1200 + Math.random() * 1800); // pausa humana
    await rec.client.sendMessage(await resolverDestino(rec.client, req.params.clientId, to), message);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[${req.params.clientId}] error enviando:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/session/:clientId/send-media', checkSecret, async (req, res) => {
  const rec = sesionLista(req.params.clientId);
  if (!rec) return res.status(409).json({ error: 'WhatsApp no está conectado' });
  const { to, mimetype, data, filename, caption } = req.body;
  if (!to || !mimetype || !data) return res.status(400).json({ error: 'faltan to/mimetype/data' });
  try {
    await wait(1200 + Math.random() * 1800);
    const media = new MessageMedia(mimetype, data, filename || undefined);
    await rec.client.sendMessage(await resolverDestino(rec.client, req.params.clientId, to), media, { caption: caption || '' });
    res.json({ ok: true });
  } catch (err) {
    console.error(`[${req.params.clientId}] error enviando multimedia:`, err.message);
    res.status(500).json({ error: err.message });
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
