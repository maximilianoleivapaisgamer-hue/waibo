const express = require('express');
const router = express.Router();
const axios = require('axios');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

router.post('/embedded-signup', authMiddleware, async (req, res) => {
  const { access_token, waba_id, phone_number_id } = req.body;
  const systemToken = process.env.META_SYSTEM_USER_TOKEN;

  if (!access_token || !waba_id || !phone_number_id) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos.' });
  }
  if (!systemToken) {
    return res.status(500).json({ error: 'Token de sistema de Meta no configurado.' });
  }

  try {
    // Suscribir la app a los webhooks del WABA usando el system token
    await axios.post(
      `https://graph.facebook.com/v21.0/${waba_id}/subscribed_apps`,
      {},
      { headers: { Authorization: `Bearer ${systemToken}` } }
    );

    await pool.query(
      `UPDATE clients SET
        whatsapp_api_key = $1,
        whatsapp_phone_id = $2,
        whatsapp_provider = 'cloud_api',
        waba_id = $3,
        whatsapp_mode = 'api'
       WHERE id = $4`,
      [systemToken, phone_number_id, waba_id, req.client.id]
    );

    res.json({ ok: true, phone_number_id, waba_id });
  } catch (err) {
    const metaError = err.response?.data;
    console.error('Embedded signup error:', metaError || err.message);
    res.status(500).json({
      error: metaError?.error?.message || err.message || 'Error conectando WhatsApp.',
      meta_error: metaError
    });
  }
});

router.delete('/disconnect', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `UPDATE clients SET
        whatsapp_api_key = NULL,
        whatsapp_phone_id = NULL,
        whatsapp_provider = NULL,
        waba_id = NULL,
        whatsapp_mode = 'api'
       WHERE id = $1`,
      [req.client.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error desconectando WhatsApp' });
  }
});

module.exports = router;
