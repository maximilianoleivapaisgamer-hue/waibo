const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { createSubscription, createOneTimePayment, getSubscriptionStatus, cancelSubscription, getPaymentDetails } = require('../services/mercadopago');
const { reactivateClient } = require('../services/cronjobs');
const { sendConversionEmail } = require('../services/mailer');

router.get('/plans', authMiddleware, async (req, res) => {
  const result = await pool.query('SELECT * FROM plans WHERE active = true ORDER BY price ASC');
  res.json(result.rows);
});

router.post('/subscribe', authMiddleware, async (req, res) => {
  const { plan_id } = req.body;
  try {
    const planResult = await pool.query('SELECT * FROM plans WHERE id = $1 AND active = true', [plan_id]);
    if (!planResult.rows.length) return res.status(404).json({ error: 'Plan no encontrado' });
    const plan = planResult.rows[0];

    const clientResult = await pool.query('SELECT email FROM clients WHERE id = $1', [req.client.id]);
    const clientEmail = clientResult.rows[0].email;

    const subscription = await createSubscription(req.client.id, clientEmail, plan);

    await pool.query(
      `INSERT INTO mp_subscriptions (client_id, plan_id, mp_preapproval_id, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (client_id) DO UPDATE SET
         plan_id = $2, mp_preapproval_id = $3, status = 'pending', updated_at = NOW()`,
      [req.client.id, plan_id, subscription.id]
    );

    res.json({ checkout_url: subscription.init_point });
  } catch (err) {
    console.error('Error creando suscripción MP:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error iniciando la suscripción. Intentá de nuevo.' });
  }
});

router.post('/pay-once', authMiddleware, async (req, res) => {
  const { plan_id } = req.body;
  try {
    const planResult = await pool.query('SELECT * FROM plans WHERE id = $1 AND active = true', [plan_id]);
    if (!planResult.rows.length) return res.status(404).json({ error: 'Plan no encontrado' });
    const plan = planResult.rows[0];

    const clientResult = await pool.query('SELECT email FROM clients WHERE id = $1', [req.client.id]);
    const clientEmail = clientResult.rows[0].email;

    const preference = await createOneTimePayment(req.client.id, clientEmail, plan);
    res.json({ checkout_url: preference.init_point });
  } catch (err) {
    console.error('Error creando pago único MP:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error iniciando el pago. Intentá de nuevo.' });
  }
});

router.get('/subscription', authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT s.*, p.name as plan_name, p.price as plan_price, p.features
     FROM mp_subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.client_id = $1`,
    [req.client.id]
  );
  if (!result.rows.length) return res.json({ subscribed: false });
  res.json({ subscribed: true, ...result.rows[0] });
});

router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT mp_preapproval_id FROM mp_subscriptions WHERE client_id = $1', [req.client.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'No hay suscripción activa' });

    await cancelSubscription(result.rows[0].mp_preapproval_id);
    await pool.query(`UPDATE mp_subscriptions SET status = 'cancelled', updated_at = NOW() WHERE client_id = $1`, [req.client.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error cancelando la suscripción' });
  }
});

router.get('/payments', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM mp_payments_log WHERE client_id = $1 ORDER BY created_at DESC LIMIT 24',
    [req.client.id]
  );
  res.json(result.rows);
});

router.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      const payment = await getPaymentDetails(data.id);
      const clientId = payment.external_reference;
      if (!clientId) return;

      await pool.query(
        `INSERT INTO mp_payments_log (client_id, mp_payment_id, amount, status) VALUES ($1, $2, $3, $4)`,
        [clientId, String(payment.id), payment.transaction_amount, payment.status]
      );

      if (payment.status === 'approved') {
        const wasActive = await pool.query(`SELECT status FROM mp_subscriptions WHERE client_id = $1`, [clientId]);
        const isFirstPayment = !wasActive.rows.length || wasActive.rows[0].status !== 'authorized';
        await reactivateClient(clientId);
        await pool.query(
          `UPDATE mp_subscriptions SET status = 'authorized', last_payment_status = 'approved', last_payment_at = NOW() WHERE client_id = $1`,
          [clientId]
        );
        if (isFirstPayment) {
          const clientData = await pool.query(
            `SELECT c.name, c.email, c.business_name, p.name as plan_name
             FROM clients c
             JOIN mp_subscriptions s ON s.client_id = c.id
             JOIN plans p ON p.id = s.plan_id
             WHERE c.id = $1`, [clientId]
          );
          if (clientData.rows.length) {
            sendConversionEmail(clientData.rows[0], clientData.rows[0].plan_name).catch(e => console.error('[conversion-email]', e.message));
          }
        }
      } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
        await pool.query(
          `UPDATE mp_subscriptions SET last_payment_status = $1 WHERE client_id = $2`,
          [payment.status, clientId]
        );
      }
    }

    if (type === 'subscription_preapproval') {
      const status = await getSubscriptionStatus(data.id);
      await pool.query(
        `UPDATE mp_subscriptions SET status = $1, updated_at = NOW() WHERE mp_preapproval_id = $2`,
        [status.status, data.id]
      );
    }
  } catch (err) {
    console.error('❌ Error webhook MercadoPago:', err.message);
  }
});

module.exports = router;
