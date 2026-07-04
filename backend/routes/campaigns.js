const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { sendWhatsAppMessage } = require('../services/whatsapp');
const { normalizePhone } = require('../services/phone');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM campaigns WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.client.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  const { name, message, recipients } = req.body;
  if (!name || !message || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'Nombre, mensaje y al menos un destinatario son requeridos.' });
  }
  if (recipients.length > 500) {
    return res.status(400).json({ error: 'Máximo 500 destinatarios por campaña.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const campResult = await client.query(
      `INSERT INTO campaigns (client_id, name, message, total_recipients, status)
       VALUES ($1, $2, $3, $4, 'draft') RETURNING *`,
      [req.client.id, name, message, recipients.length]
    );
    const campaign = campResult.rows[0];

    const recipientRows = recipients.map(r => ({
      phone: normalizePhone(r.phone || r),
      name: r.name || null
    }));

    for (const r of recipientRows) {
      await client.query(
        `INSERT INTO campaign_recipients (campaign_id, customer_phone, customer_name) VALUES ($1, $2, $3)`,
        [campaign.id, r.phone, r.name]
      );
    }

    await client.query('COMMIT');
    res.json(campaign);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM campaigns WHERE id = $1 AND client_id = $2 AND status = 'draft' RETURNING id`,
      [req.params.id, req.client.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Campaña no encontrada o ya fue enviada.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/send', authMiddleware, async (req, res) => {
  const clientId = req.client.id;

  const campResult = await pool.query(
    `SELECT * FROM campaigns WHERE id = $1 AND client_id = $2`,
    [req.params.id, clientId]
  );
  if (!campResult.rows.length) return res.status(404).json({ error: 'Campaña no encontrada.' });
  const campaign = campResult.rows[0];
  if (campaign.status === 'sending' || campaign.status === 'sent') {
    return res.status(400).json({ error: 'La campaña ya fue enviada o está en proceso.' });
  }

  const clientResult = await pool.query(
    `SELECT whatsapp_api_key, whatsapp_phone_id, whatsapp_provider, whatsapp_mode FROM clients WHERE id = $1`,
    [clientId]
  );
  if (!clientResult.rows.length) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const clientData = clientResult.rows[0];

  if (!clientData.whatsapp_api_key && clientData.whatsapp_mode !== 'qr') {
    return res.status(400).json({ error: 'No tenés WhatsApp configurado. Conectá WhatsApp desde Integraciones.' });
  }

  await pool.query(
    `UPDATE campaigns SET status = 'sending', started_at = NOW() WHERE id = $1`,
    [campaign.id]
  );

  res.json({ ok: true, message: 'Campaña iniciada. Se está enviando en segundo plano.' });

  // Envío async con throttle de 1 msg/seg para no saturar la API de Meta
  setImmediate(async () => {
    const recipientsResult = await pool.query(
      `SELECT * FROM campaign_recipients WHERE campaign_id = $1 AND status = 'pending' ORDER BY id`,
      [campaign.id]
    );
    const recipients = recipientsResult.rows;

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      try {
        await sendWhatsAppMessage(clientData, recipient.customer_phone, campaign.message);
        await pool.query(
          `UPDATE campaign_recipients SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [recipient.id]
        );
        sentCount++;
      } catch (err) {
        await pool.query(
          `UPDATE campaign_recipients SET status = 'failed', error_message = $1 WHERE id = $2`,
          [err.message?.substring(0, 255), recipient.id]
        );
        failedCount++;
      }

      await pool.query(
        `UPDATE campaigns SET sent_count = $1, failed_count = $2 WHERE id = $3`,
        [sentCount, failedCount, campaign.id]
      );

      // 1 segundo entre mensajes para respetar límites de WhatsApp
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await pool.query(
      `UPDATE campaigns SET status = 'sent', completed_at = NOW(), sent_count = $1, failed_count = $2 WHERE id = $3`,
      [sentCount, failedCount, campaign.id]
    );
  });
});

router.get('/:id/recipients', authMiddleware, async (req, res) => {
  try {
    const campCheck = await pool.query(
      `SELECT id FROM campaigns WHERE id = $1 AND client_id = $2`,
      [req.params.id, req.client.id]
    );
    if (!campCheck.rows.length) return res.status(404).json({ error: 'No encontrada.' });

    const result = await pool.query(
      `SELECT * FROM campaign_recipients WHERE campaign_id = $1 ORDER BY id`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
