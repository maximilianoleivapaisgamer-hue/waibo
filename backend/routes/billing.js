const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { reactivateClient } = require('../services/cronjobs');

router.get('/status', authMiddleware, async (req, res) => {
  try {
    let result = await pool.query(
      'SELECT * FROM billing WHERE client_id = $1',
      [req.client.id]
    );

    if (!result.rows.length) {
      result = await pool.query(
        `INSERT INTO billing (client_id, plan, status, amount, last_payment, next_due)
         VALUES ($1, 'standard', 'active', 59999, NOW(), NOW() + INTERVAL '30 days')
         RETURNING *`,
        [req.client.id]
      );
    }

    const billing = result.rows[0];
    const daysUntilDue = Math.ceil((new Date(billing.next_due) - new Date()) / (1000 * 60 * 60 * 24));

    res.json({
      ...billing,
      days_until_due: daysUntilDue,
      is_overdue: daysUntilDue < 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo facturación' });
  }
});

router.post('/pay/:clientId', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  try {
    const success = await reactivateClient(req.params.clientId);
    if (success) {
      res.json({ success: true, message: 'Cliente reactivado correctamente' });
    } else {
      res.status(500).json({ error: 'Error reactivando cliente' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error procesando pago' });
  }
});

router.put('/plan', authMiddleware, async (req, res) => {
  const { plan } = req.body;
  const plans = {
    'standard': 59999,
    'ecommerce_pro': 129999
  };

  if (!plans[plan]) return res.status(400).json({ error: 'Plan inválido' });

  try {
    await pool.query(
      'UPDATE billing SET plan = $1, amount = $2 WHERE client_id = $3',
      [plan, plans[plan], req.client.id]
    );
    await pool.query(
      'UPDATE clients SET plan = $1 WHERE id = $2',
      [plan, req.client.id]
    );
    res.json({ success: true, plan, amount: plans[plan] });
  } catch (err) {
    res.status(500).json({ error: 'Error cambiando plan' });
  }
});

module.exports = router;
