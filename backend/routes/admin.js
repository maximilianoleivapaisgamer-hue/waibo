const express = require('express');
const router = express.Router();
const pool = require('../db');

function checkAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// GET /api/admin/stats — métricas globales
router.get('/stats', checkAdmin, async (req, res) => {
  try {
    const [clients, activeClients, totalConvs, totalMsgs, pendingBajas, revenue] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM clients'),
      pool.query("SELECT COUNT(*) FROM clients WHERE active = true"),
      pool.query('SELECT COUNT(*) FROM conversations'),
      pool.query('SELECT COUNT(*) FROM messages'),
      pool.query("SELECT COUNT(*) FROM data_deletion_requests WHERE status = 'pending'"),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM billing WHERE status = 'active'"),
    ]);
    res.json({
      total_clients: parseInt(clients.rows[0].count),
      active_clients: parseInt(activeClients.rows[0].count),
      total_conversations: parseInt(totalConvs.rows[0].count),
      total_messages: parseInt(totalMsgs.rows[0].count),
      pending_deletion_requests: parseInt(pendingBajas.rows[0].count),
      monthly_revenue: parseFloat(revenue.rows[0].total),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/clients — lista de todos los clientes
router.get('/clients', checkAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id, c.name, c.email, c.business_name, c.phone_number,
        c.whatsapp_mode, c.whatsapp_provider, c.active, c.plan, c.created_at,
        b.status as billing_status, b.amount, b.last_payment, b.next_due, b.suspended_at,
        (SELECT COUNT(*) FROM conversations cv WHERE cv.client_id = c.id) as total_conversations,
        (SELECT COUNT(*) FROM messages m JOIN conversations cv ON cv.id = m.conversation_id WHERE cv.client_id = c.id) as total_messages,
        (SELECT MAX(cv.updated_at) FROM conversations cv WHERE cv.client_id = c.id) as last_activity
      FROM clients c
      LEFT JOIN billing b ON b.client_id = c.id
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/clients/:id/suspend
router.post('/clients/:id/suspend', checkAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE clients SET active = false WHERE id = $1', [req.params.id]);
    await pool.query("UPDATE billing SET status = 'suspended', suspended_at = NOW() WHERE client_id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/clients/:id/activate
router.post('/clients/:id/activate', checkAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE clients SET active = true WHERE id = $1', [req.params.id]);
    await pool.query("UPDATE billing SET status = 'active', suspended_at = NULL WHERE client_id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/deletion-requests — solicitudes de baja pendientes
router.get('/deletion-requests', checkAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM data_deletion_requests
      ORDER BY requested_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/deletion-requests/:id/resolve
router.put('/deletion-requests/:id/resolve', checkAdmin, async (req, res) => {
  try {
    await pool.query(
      "UPDATE data_deletion_requests SET status = 'processed', processed_at = NOW() WHERE id = $1",
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
