const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { startQRSession, getPendingQR, sendQRMessage, stopQRSession } = require('../services/whatsappQR');
const { processIncomingMessage } = require('../services/messageProcessor');

router.post('/connect', authMiddleware, async (req, res) => {
  try {
    const onMessage = async (clientId, fromPhone, senderName, text, sock) => {
      const sendFn = (phone, message) => sendQRMessage(clientId, phone, message);
      await processIncomingMessage(clientId, fromPhone, senderName, text, sendFn);
    };
    await startQRSession(req.client.id, onMessage);
    await pool.query(`UPDATE clients SET whatsapp_mode = 'qr' WHERE id = $1`, [req.client.id]);
    res.json({ success: true, message: 'Generando código QR...' });
  } catch (err) {
    console.error('Error iniciando sesión QR:', err.message);
    res.status(500).json({ error: 'No pudimos iniciar la conexión. Intentá de nuevo.' });
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  const qr = getPendingQR(req.client.id);
  const result = await pool.query('SELECT * FROM whatsapp_qr_sessions WHERE client_id = $1', [req.client.id]);
  res.json({
    qr: qr || null,
    session: result.rows[0] || { status: 'disconnected' }
  });
});

router.post('/disconnect', authMiddleware, async (req, res) => {
  await stopQRSession(req.client.id);
  await pool.query(`UPDATE clients SET whatsapp_mode = 'api' WHERE id = $1`, [req.client.id]);
  res.json({ success: true });
});

module.exports = router;
