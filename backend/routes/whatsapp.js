const express = require('express');
const router = express.Router();
const axios = require('axios');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

router.post('/embedded-signup', authMiddleware, async (req, res) => {
  const { waba_id: bodyWabaId, phone_number_id: bodyPhoneId, phone_number: typedPhone } = req.body;
  const systemToken = process.env.META_SYSTEM_USER_TOKEN;
  if (!systemToken) {
    return res.status(500).json({ error: 'Token de sistema de Meta no configurado.' });
  }

  try {
    let waba_id = bodyWabaId;
    let phone_number_id = bodyPhoneId;

    console.log('[embedded-signup] body recibido:', { waba_id, phone_number_id });

    if (phone_number_id) {
      const dupRes = await pool.query(
        'SELECT id FROM clients WHERE whatsapp_phone_id = $1 AND id != $2',
        [phone_number_id, req.client.id]
      );
      if (dupRes.rows.length > 0) {
        return res.status(400).json({ error: 'Ese número ya está conectado a otra cuenta de Waibo.' });
      }
    }

    if (!waba_id || !phone_number_id) {
      // Con un system user token, me/businesses suele venir vacío.
      // Usamos el ID del portfolio de Waibo directamente si está configurado.
      let businessIds = [];
      if (process.env.META_BUSINESS_ID) {
        businessIds = [{ id: process.env.META_BUSINESS_ID }];
      } else {
        const bizRes = await axios.get('https://graph.facebook.com/v21.0/me/businesses', {
          headers: { Authorization: `Bearer ${systemToken}` }
        });
        businessIds = bizRes.data?.data || [];
      }
      console.log('[embedded-signup] businesses a revisar:', businessIds.map(b => b.id));

      // Juntar TODOS los WABAs con sus números y dejar que el usuario elija
      const options = [];
      for (const biz of businessIds) {
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
        for (const waba of wabas) {
          const phoneRes = await axios.get(`https://graph.facebook.com/v21.0/${waba.id}/phone_numbers`, {
            headers: { Authorization: `Bearer ${systemToken}` }
          }).catch(() => null);
          for (const phone of phoneRes?.data?.data || []) {
            options.push({
              waba_id: waba.id,
              waba_name: waba.name || '',
              phone_number_id: phone.id,
              display_phone_number: phone.display_phone_number || '',
              verified_name: phone.verified_name || ''
            });
          }
        }
      }

      // Excluir números que ya están conectados a otros clientes de Waibo
      const takenRes = await pool.query(
        'SELECT whatsapp_phone_id FROM clients WHERE whatsapp_phone_id IS NOT NULL AND id != $1',
        [req.client.id]
      );
      const taken = new Set(takenRes.rows.map(r => r.whatsapp_phone_id));
      const available = options.filter(o => !taken.has(o.phone_number_id));

      console.log('[embedded-signup] números encontrados:', options.length, '— disponibles:', available.length);

      options.length = 0;
      options.push(...available);

      if (options.length === 0) {
        return res.status(400).json({ error: 'No se encontró ninguna cuenta de WhatsApp Business. Completá todos los pasos del asistente de Meta.' });
      }
      if (options.length === 1 && !typedPhone) {
        waba_id = options[0].waba_id;
        phone_number_id = options[0].phone_number_id;
      } else if (typedPhone) {
        // El usuario escribió su número — lo buscamos entre los disponibles
        const userDigits = String(typedPhone).replace(/\D/g, '');
        if (userDigits.length < 8) {
          return res.status(400).json({ error: 'Ingresá tu número completo con código de área.' });
        }
        const tail = userDigits.slice(-8);
        const matches = options.filter(o => {
          const optDigits = String(o.display_phone_number).replace(/\D/g, '');
          return optDigits.endsWith(tail) || userDigits.endsWith(optDigits.slice(-8));
        });
        console.log('[embedded-signup] match para', tail, '→', matches.length);
        if (matches.length === 0) {
          return res.status(404).json({ error: 'No encontramos ese número. Si lo acabás de vincular, esperá un minuto y volvé a intentar.' });
        }
        if (matches.length > 1) {
          return res.status(400).json({ error: 'Hay más de un número parecido. Escribí el número completo con código de país.' });
        }
        waba_id = matches[0].waba_id;
        phone_number_id = matches[0].phone_number_id;
      } else {
        // Hay varios números y no sabemos cuál es el del cliente:
        // pedimos que escriba el suyo (no mostramos la lista por privacidad)
        return res.json({ needs_phone: true });
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
