const express = require('express');
const router = express.Router();
const axios = require('axios');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

router.post('/embedded-signup', authMiddleware, async (req, res) => {
  const { code, waba_id: bodyWabaId, phone_number_id: bodyPhoneId } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos' });
  }

  try {
    // Exchange code for short-lived token, then for long-lived token (60-day expiry)
    const tokenRes = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: 'https://www.facebook.com/connect/login_success.html',
        code
      }
    });
    const shortLivedToken = tokenRes.data.access_token;

    const llRes = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: shortLivedToken
      }
    });
    const longLivedToken = llRes.data.access_token;

    // Si no vienen los IDs, buscarlos en Meta
    let waba_id = bodyWabaId;
    let phone_number_id = bodyPhoneId;

    if (!waba_id || !phone_number_id) {
      const wabasRes = await axios.get('https://graph.facebook.com/v21.0/me/businesses', {
        headers: { Authorization: `Bearer ${longLivedToken}` }
      });
      const businesses = wabasRes.data?.data || [];
      for (const biz of businesses) {
        const waRes = await axios.get(`https://graph.facebook.com/v21.0/${biz.id}/owned_whatsapp_business_accounts`, {
          headers: { Authorization: `Bearer ${longLivedToken}` }
        }).catch(() => null);
        const wabas = waRes?.data?.data || [];
        if (wabas.length > 0) {
          waba_id = wabas[0].id;
          const phoneRes = await axios.get(`https://graph.facebook.com/v21.0/${waba_id}/phone_numbers`, {
            headers: { Authorization: `Bearer ${longLivedToken}` }
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

    // Subscribe our app to the WABA webhooks
    await axios.post(
      `https://graph.facebook.com/v21.0/${waba_id}/subscribed_apps`,
      {},
      { headers: { Authorization: `Bearer ${longLivedToken}` } }
    );

    await pool.query(
      `UPDATE clients SET
        whatsapp_api_key = $1,
        whatsapp_phone_id = $2,
        whatsapp_provider = 'cloud_api',
        waba_id = $3,
        whatsapp_mode = 'api'
       WHERE id = $4`,
      [longLivedToken, phone_number_id, waba_id, req.client.id]
    );

    res.json({ ok: true, phone_number_id, waba_id });
  } catch (err) {
    const metaError = err.response?.data;
    console.error('Embedded signup error:', metaError || err.message);
    res.status(500).json({
      error: metaError?.error?.message || metaError?.error_description || err.message || 'Error conectando WhatsApp.',
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
