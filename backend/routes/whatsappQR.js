const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const axios = require('axios');
const { processIncomingMessage } = require('../services/messageProcessor');

const QR_SERVICE_URL = process.env.QR_SERVICE_URL; // URL de ngrok
const SERVICE_SECRET = process.env.QR_SERVICE_SECRET || 'whabot_qr_secret_2024';

function qrHeaders() {
  return { 'x-service-secret': SERVICE_SECRET, 'Content-Type': 'application/json' };
}

// El cliente inicia la conexión QR
router.post('/connect', authMiddleware, async (req, res) => {
  if (!QR_SERVICE_URL) {
    return res.status(503).json({ error: 'El servicio de QR no está configurado en este momento.' });
  }
  try {
    await axios.post(`${QR_SERVICE_URL}/session/start`, { clientId: req.client.id, secret: SERVICE_SECRET }, { headers: qrHeaders() });
    await pool.query(`UPDATE clients SET whatsapp_mode = 'qr' WHERE id = $1`, [req.client.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error iniciando QR:', err.message);
    res.status(500).json({ error: 'No se pudo iniciar la conexión QR. Intentá de nuevo.' });
  }
});

// Estado + QR image
router.get('/status', authMiddleware, async (req, res) => {
  if (!QR_SERVICE_URL) {
    return res.json({ status: 'unavailable', qr: null });
  }
  try {
    const r = await axios.get(`${QR_SERVICE_URL}/session/${req.client.id}/status`, { headers: qrHeaders() });
    res.json(r.data);
  } catch {
    res.json({ status: 'disconnected', qr: null });
  }
});

// Desconectar
router.post('/disconnect', authMiddleware, async (req, res) => {
  if (QR_SERVICE_URL) {
    try {
      await axios.post(`${QR_SERVICE_URL}/session/${req.client.id}/disconnect`, { secret: SERVICE_SECRET }, { headers: qrHeaders() });
    } catch {}
  }
  await pool.query(`UPDATE clients SET whatsapp_mode = 'api' WHERE id = $1`, [req.client.id]);
  res.json({ success: true });
});

// Enviar mensaje desde Railway al microservicio (usado por sendWhatsAppQRMessage)
router.post('/send', authMiddleware, async (req, res) => {
  const { to, message } = req.body;
  if (!QR_SERVICE_URL) return res.status(503).json({ error: 'QR service no disponible' });
  try {
    await axios.post(`${QR_SERVICE_URL}/session/${req.client.id}/send`, { to, message, secret: SERVICE_SECRET }, { headers: qrHeaders() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Callbacks desde el microservicio QR hacia Railway ──────────────

function checkServiceSecret(req, res, next) {
  const secret = req.body?.secret || req.headers['x-service-secret'];
  if (secret !== SERVICE_SECRET) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// El microservicio avisa que el cliente conectó
router.post('/connected', checkServiceSecret, async (req, res) => {
  const { clientId, phone } = req.body;
  try {
    await pool.query(
      `INSERT INTO whatsapp_qr_sessions (client_id, status, phone_number, connected_at)
       VALUES ($1, 'connected', $2, NOW())
       ON CONFLICT (client_id) DO UPDATE SET status = 'connected', phone_number = $2, connected_at = NOW()`,
      [clientId, phone]
    );
    await pool.query(`UPDATE clients SET whatsapp_mode = 'qr' WHERE id = $1`, [clientId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// El microservicio envía historial de mensajes al conectar
router.post('/history', checkServiceSecret, async (req, res) => {
  const { clientId, messages } = req.body;
  res.json({ ok: true }); // Responder rápido

  if (!Array.isArray(messages) || !messages.length) return;

  try {
    // Agrupar mensajes por teléfono
    const byPhone = {};
    for (const m of messages) {
      if (!byPhone[m.phone]) byPhone[m.phone] = [];
      byPhone[m.phone].push(m);
    }

    for (const [phone, msgs] of Object.entries(byPhone)) {
      // Buscar o crear conversación
      let convResult = await pool.query(
        `SELECT id FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' ORDER BY created_at DESC LIMIT 1`,
        [clientId, phone]
      );
      let convId;
      if (convResult.rows.length) {
        convId = convResult.rows[0].id;
      } else {
        const newConv = await pool.query(
          `INSERT INTO conversations (client_id, customer_phone, customer_name, channel, status) VALUES ($1,$2,$3,'whatsapp','open') RETURNING id`,
          [clientId, phone, phone]
        );
        convId = newConv.rows[0].id;
      }

      // Insertar mensajes que no existan ya (evitar duplicados por timestamp+role+content)
      for (const m of msgs) {
        await pool.query(
          `INSERT INTO messages (conversation_id, role, content, created_at)
           SELECT $1,$2,$3,$4
           WHERE NOT EXISTS (
             SELECT 1 FROM messages
             WHERE conversation_id = $1 AND role = $2 AND content = $3
               AND ABS(EXTRACT(EPOCH FROM (created_at - $4::timestamptz))) < 5
           )`,
          [convId, m.role, m.text, m.timestamp]
        );
      }
    }
    console.log(`[QR history] clientId=${clientId} — ${messages.length} mensajes procesados`);
  } catch (err) {
    console.error('Error procesando historial QR:', err.message);
  }
});

// El microservicio reenvía mensajes entrantes para que la IA los procese
router.post('/message', checkServiceSecret, async (req, res) => {
  const { clientId, from, text } = req.body;
  res.json({ ok: true }); // Responder rápido

  try {
    const sendFn = async (phone, message) => {
      if (!QR_SERVICE_URL) return;
      await axios.post(
        `${QR_SERVICE_URL}/session/${clientId}/send`,
        { to: phone, message, secret: SERVICE_SECRET },
        { headers: qrHeaders() }
      );
    };
    await processIncomingMessage(clientId, from, 'Cliente', text, sendFn);
  } catch (err) {
    console.error('Error procesando mensaje QR:', err.message);
  }
});

module.exports = router;
