const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Baileys a veces lanza rechazos no manejados — logueamos en vez de morir
process.on('unhandledRejection', (err) => console.error('⚠️ unhandledRejection:', err?.message || err));
process.on('uncaughtException', (err) => console.error('⚠️ uncaughtException:', err?.message || err));

const PORT = process.env.PORT || 3002;
const RAILWAY_BACKEND = process.env.RAILWAY_BACKEND_URL || 'https://whabot-backend-production.up.railway.app';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'whabot_qr_secret_2024';

// Sessions en memoria: clientId -> { sock, qr, status, phone }
const sessions = {};

function getSessionDir(clientId) {
  return path.join(__dirname, 'sessions', clientId);
}

async function createSession(clientId) {
  const sessionDir = getSessionDir(clientId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    // Identidad "Desktop" + syncFullHistory: WhatsApp solo manda el historial
    // completo a clientes de escritorio con este flag activado.
    browser: ['WhaBot', 'Desktop', '1.0.0'],
    syncFullHistory: true,
  });

  sessions[clientId] = { sock, qr: null, status: 'connecting', phone: null };

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const qrImage = await QRCode.toDataURL(qr);
      sessions[clientId].qr = qrImage;
      sessions[clientId].status = 'qr_ready';
      console.log(`[${clientId}] QR generado`);
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] || null;
      sessions[clientId].status = 'connected';
      sessions[clientId].phone = phone;
      sessions[clientId].qr = null;
      console.log(`[${clientId}] Conectado - ${phone}`);

      // Notificar al backend de Railway
      try {
        await axios.post(`${RAILWAY_BACKEND}/api/whatsapp-qr/connected`, {
          clientId,
          phone,
          secret: SERVICE_SECRET
        });
      } catch (err) {
        console.error(`[${clientId}] Error notificando backend:`, err.message);
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`[${clientId}] Desconectado (código ${code}), reconectar: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => createSession(clientId), 5000);
      } else {
        sessions[clientId].status = 'logged_out';
        // Limpiar sesión
        fs.rmSync(getSessionDir(clientId), { recursive: true, force: true });
        delete sessions[clientId];
      }
    }
  });

  // Historial al conectar
  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages: histMsgs, isLatest }) => {
    if (contacts?.length) sendContacts(contacts).catch(() => {});
    // Chats archivados en WhatsApp → avisar al backend para marcarlos
    const archivedPhones = (chats || [])
      .filter(c => c.archived && c.id && !c.id.endsWith('@g.us'))
      .map(c => c.id.replace('@s.whatsapp.net', ''));

    if (!histMsgs?.length && !archivedPhones.length) return;
    console.log(`[${clientId}] Historial recibido: ${histMsgs?.length || 0} mensajes, ${archivedPhones.length} chats archivados`);

    const batch = [];
    for (const msg of histMsgs || []) {
      if (!msg.message) continue;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith('@g.us')) continue; // ignorar grupos

      const phone = jid.replace('@s.whatsapp.net', '');
      const innerMsg = msg.message?.ephemeralMessage?.message
        || msg.message?.viewOnceMessage?.message
        || msg.message?.viewOnceMessageV2?.message
        || msg.message;
      const text =
        innerMsg?.conversation ||
        innerMsg?.extendedTextMessage?.text ||
        innerMsg?.imageMessage?.caption ||
        innerMsg?.videoMessage?.caption ||
        null;

      if (!text) continue;

      const role = msg.key.fromMe ? 'assistant' : 'user';
      const timestamp = msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();

      batch.push({ phone, role, text, timestamp });
    }

    if (!batch.length && !archivedPhones.length) return;

    try {
      await axios.post(`${RAILWAY_BACKEND}/api/whatsapp-qr/history`, {
        clientId,
        messages: batch,
        archived_phones: archivedPhones,
        secret: SERVICE_SECRET
      }, { headers: { 'x-service-secret': SERVICE_SECRET, 'Content-Type': 'application/json' } });
      console.log(`[${clientId}] Historial enviado al backend: ${batch.length} mensajes`);
    } catch (err) {
      console.error(`[${clientId}] Error enviando historial:`, err.message);
    }
  });

  // Etiquetas de WhatsApp Business → tags en Waibo
  // labels.edit define las etiquetas (id → nombre); labels.association las asigna a chats.
  const labelNames = {};   // labelId -> name
  const pendingAssoc = []; // { chatJid, labelId }
  let labelFlushTimer = null;

  const flushLabels = async () => {
    const assoc = pendingAssoc.splice(0);
    const items = assoc
      .filter(a => labelNames[a.labelId] && !a.chatJid.endsWith('@g.us'))
      .map(a => ({
        phone: a.chatJid.replace('@s.whatsapp.net', ''),
        label: labelNames[a.labelId]
      }));
    if (!items.length) return;
    try {
      await axios.post(`${RAILWAY_BACKEND}/api/whatsapp-qr/labels`, {
        clientId, items, secret: SERVICE_SECRET
      }, { headers: { 'x-service-secret': SERVICE_SECRET, 'Content-Type': 'application/json' } });
      console.log(`[${clientId}] Etiquetas enviadas: ${items.length} asignaciones`);
    } catch (err) {
      console.error(`[${clientId}] Error enviando etiquetas:`, err.message);
    }
  };

  sock.ev.on('labels.edit', (label) => {
    if (label?.id && label?.name && !label.deleted) labelNames[label.id] = label.name;
  });

  sock.ev.on('labels.association', ({ type, association }) => {
    if (type !== 'add' || !association?.chatId || !association?.labelId) return;
    pendingAssoc.push({ chatJid: association.chatId, labelId: association.labelId });
    clearTimeout(labelFlushTimer);
    labelFlushTimer = setTimeout(flushLabels, 5000);
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    if (remoteJid?.endsWith('@g.us') || remoteJid === 'status@broadcast') return;
    // Preservar el JID completo (puede ser @s.whatsapp.net o @lid)
    const from = remoteJid?.endsWith('@s.whatsapp.net')
      ? remoteJid.replace('@s.whatsapp.net', '')
      : remoteJid; // conservar @lid u otros formatos tal cual

    // Desenvolver mensajes temporales / ver una vez
    const inner = msg.message.ephemeralMessage?.message
      || msg.message.viewOnceMessage?.message
      || msg.message.viewOnceMessageV2?.message
      || msg.message;

    const text =
      inner?.conversation ||
      inner?.extendedTextMessage?.text ||
      inner?.imageMessage?.caption ||
      inner?.videoMessage?.caption ||
      '';

    if (!from) return;
    if (!text) {
      console.log(`[${clientId}] Mensaje sin texto de ${from} (tipos: ${Object.keys(msg.message).join(',')})`);
      return;
    }

    console.log(`[${clientId}] Mensaje entrante de ${from}: ${text.slice(0, 60)}`);

    // Reenviar mensaje al backend de Railway para que lo procese la IA
    try {
      await axios.post(`${RAILWAY_BACKEND}/api/whatsapp-qr/message`, {
        clientId,
        from,
        name: msg.pushName || null,
        text,
        secret: SERVICE_SECRET
      });
      console.log(`[${clientId}] Mensaje reenviado al backend OK`);
    } catch (err) {
      console.error(`[${clientId}] Error enviando mensaje al backend:`, err.message);
    }
  });

  // Contactos: mapear LID → número real y nombre
  const sendContacts = async (contacts) => {
    const items = (contacts || []).map(c => {
      const phone = c.id?.endsWith('@s.whatsapp.net') ? c.id.replace('@s.whatsapp.net', '') : null;
      const lid = c.lid || (c.id?.endsWith('@lid') ? c.id : null);
      const name = c.name || c.notify || c.verifiedName || null;
      return { phone, lid, name };
    }).filter(i => i.phone || i.name);
    if (!items.length) return;
    try {
      await axios.post(`${RAILWAY_BACKEND}/api/whatsapp-qr/contacts`, {
        clientId, items, secret: SERVICE_SECRET
      }, { headers: { 'x-service-secret': SERVICE_SECRET, 'Content-Type': 'application/json' } });
      console.log(`[${clientId}] Contactos enviados: ${items.length}`);
    } catch (err) {
      console.error(`[${clientId}] Error enviando contactos:`, err.message);
    }
  };

  sock.ev.on('contacts.upsert', sendContacts);

  return sock;
}

// ── Middleware de autenticación simple ─────────────────────────────
function checkSecret(req, res, next) {
  const secret = req.headers['x-service-secret'] || req.body?.secret;
  if (secret !== SERVICE_SECRET) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// ── Rutas ──────────────────────────────────────────────────────────

// Iniciar sesión / obtener QR
app.post('/session/start', checkSecret, async (req, res) => {
  const { clientId } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });

  if (sessions[clientId]?.status === 'connected') {
    return res.json({ status: 'connected', phone: sessions[clientId].phone });
  }

  if (!sessions[clientId]) {
    createSession(clientId).catch(console.error);
  }

  res.json({ status: 'starting' });
});

// Estado de la sesión + QR
app.get('/session/:clientId/status', checkSecret, (req, res) => {
  const { clientId } = req.params;
  const session = sessions[clientId];
  if (!session) return res.json({ status: 'disconnected', qr: null });

  res.json({
    status: session.status,
    qr: session.qr,
    phone: session.phone
  });
});

// Enviar mensaje (llamado desde Railway)
app.post('/session/:clientId/send', checkSecret, async (req, res) => {
  const { clientId } = req.params;
  const { to, message } = req.body;

  const session = sessions[clientId];
  if (!session || session.status !== 'connected') {
    return res.status(400).json({ error: 'Sesión no conectada' });
  }

  try {
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    await session.sock.sendMessage(jid, { text: message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Desconectar sesión
app.post('/session/:clientId/disconnect', checkSecret, async (req, res) => {
  const { clientId } = req.params;
  const session = sessions[clientId];
  if (!session) return res.json({ ok: true });

  try {
    await session.sock.logout();
  } catch {}

  fs.rmSync(getSessionDir(clientId), { recursive: true, force: true });
  delete sessions[clientId];
  res.json({ ok: true });
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true, sessions: Object.keys(sessions).length }));

// ── Auto-restauración de sesiones al iniciar ───────────────────────
async function restoreExistingSessions() {
  const sessionsDir = path.join(__dirname, 'sessions');
  if (!fs.existsSync(sessionsDir)) return;

  const clientIds = fs.readdirSync(sessionsDir).filter(name => {
    const dir = path.join(sessionsDir, name);
    return fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length > 0;
  });

  if (!clientIds.length) {
    console.log('   Sin sesiones guardadas para restaurar.');
    return;
  }

  console.log(`   Restaurando ${clientIds.length} sesión(es): ${clientIds.join(', ')}`);
  for (const clientId of clientIds) {
    try {
      await createSession(clientId);
      console.log(`   ↳ [${clientId}] sesión iniciando...`);
    } catch (err) {
      console.error(`   ↳ [${clientId}] error al restaurar:`, err.message);
    }
  }
}

app.listen(PORT, async () => {
  console.log(`✅ WhaBot QR Service corriendo en puerto ${PORT}`);
  console.log(`   Backend Railway: ${RAILWAY_BACKEND}`);
  await restoreExistingSessions();
});
