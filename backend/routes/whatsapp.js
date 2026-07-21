const express = require('express');
const router = express.Router();
const axios = require('axios');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

router.post('/embedded-signup', authMiddleware, async (req, res) => {
  const { waba_id: bodyWabaId, phone_number_id: bodyPhoneId } = req.body;
  const systemToken = process.env.META_SYSTEM_USER_TOKEN;
  if (!systemToken) {
    return res.status(500).json({ error: 'Token de sistema de Meta no configurado.' });
  }

  try {
    let waba_id = bodyWabaId;
    let phone_number_id = bodyPhoneId;

    console.log('[embedded-signup] body recibido:', { waba_id, phone_number_id });

    if (!waba_id || !phone_number_id) {
      const bizRes = await axios.get('https://graph.facebook.com/v21.0/me/businesses', {
        headers: { Authorization: `Bearer ${systemToken}` }
      });
      console.log('[embedded-signup] businesses encontrados:', bizRes.data?.data?.map(b => b.id));
      for (const biz of bizRes.data?.data || []) {
        const [ownedRes, clientRes] = await Promise.all([
          axios.get(`https://graph.facebook.com/v21.0/${biz.id}/owned_whatsapp_business_accounts`, {
            headers: { Authorization: `Bearer ${systemToken}` }
          }).catch(() => null),
          axios.get(`https://graph.facebook.com/v21.0/${biz.id}/client_whatsapp_business_accounts`, {
            headers: { Authorization: `Bearer ${systemToken}` }
          }).catch(() => null),
        ]);
        const wabas = [...(ownedRes?.data?.data || []), ...(clientRes?.data?.data || [])];
        console.log(`[embedded-signup] biz ${biz.id} WABAs:`, wabas.map(w => w.id));
        if (wabas.length > 0) {
          waba_id = wabas[0].id;
          const phoneRes = await axios.get(`https://graph.facebook.com/v21.0/${waba_id}/phone_numbers`, {
            headers: { Authorization: `Bearer ${systemToken}` }
          }).catch(() => null);
          const phones = phoneRes?.data?.data || [];
          if (phones.length > 0) phone_number_id = phones[0].id;
          break;
        }
      }
    }

    if (!waba_id || !phone_number_id) {
      return res.status(400).json({ error: 'No se encontró ninguna cuenta de WhatsApp Business. Completá todos los pasos del asistente de Meta.' });
    }

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
