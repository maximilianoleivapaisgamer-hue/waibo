const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const pool = require('../db');

const activeSessions = new Map();
const pendingQRCodes = new Map();

const SESSIONS_DIR = path.join(__dirname, '..', 'qr-sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);

async function startQRSession(clientId, onMessage) {
  const sessionPath = path.join(SESSIONS_DIR, clientId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  activeSessions.set(clientId, sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      pendingQRCodes.set(clientId, qr);
      await pool.query(
        `INSERT INTO whatsapp_qr_sessions (client_id, status)
         VALUES ($1, 'waiting_qr')
         ON CONFLICT (client_id) DO UPDATE SET status = 'waiting_qr'`,
        [clientId]
      );
    }

    if (connection === 'open') {
      pendingQRCodes.delete(clientId);
      const phoneNumber = sock.user?.id?.split(':')[0] || null;
      await pool.query(
        `UPDATE whatsapp_qr_sessions SET status = 'connected', phone_number = $1, connected_at = NOW() WHERE client_id = $2`,
        [phoneNumber, clientId]
      );
      console.log(`✅ Sesión QR conectada para cliente ${clientId}`);
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      await pool.query(`UPDATE whatsapp_qr_sessions SET status = 'disconnected' WHERE client_id = $1`, [clientId]);
      activeSessions.delete(clientId);

      if (shouldReconnect) {
        console.log(`⚠️ Sesión QR de ${clientId} se cortó, reintentando...`);
        setTimeout(() => startQRSession(clientId, onMessage), 5000);
      } else {
        console.log(`❌ Sesión QR de ${clientId} cerrada por el usuario (logout desde el celular)`);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!text) continue;

      const fromPhone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
      const senderName = msg.pushName || 'Cliente';

      await onMessage(clientId, fromPhone, senderName, text, sock);
    }
  });

  return sock;
}

function getPendingQR(clientId) {
  return pendingQRCodes.get(clientId) || null;
}

async function sendQRMessage(clientId, toPhone, message) {
  const sock = activeSessions.get(clientId);
  if (!sock) throw new Error('Sesión QR no activa para este cliente');
  await sock.sendMessage(`${toPhone}@s.whatsapp.net`, { text: message });
}

async function stopQRSession(clientId) {
  const sock = activeSessions.get(clientId);
  if (sock) {
    await sock.logout().catch(() => {});
    activeSessions.delete(clientId);
  }
  pendingQRCodes.delete(clientId);
  await pool.query(`UPDATE whatsapp_qr_sessions SET status = 'disconnected' WHERE client_id = $1`, [clientId]);
}

module.exports = { startQRSession, getPendingQR, sendQRMessage, stopQRSession };
