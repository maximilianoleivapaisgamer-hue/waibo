const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

// GET /api/reports/overview?period=week|month|year
router.get('/overview', authMiddleware, async (req, res) => {
  const clientId = req.client.id;
  const period = req.query.period || 'month';

  const intervals = {
    week: "INTERVAL '7 days'",
    month: "INTERVAL '30 days'",
    year: "INTERVAL '365 days'",
  };
  const prevIntervals = {
    week: "INTERVAL '14 days'",
    month: "INTERVAL '60 days'",
    year: "INTERVAL '730 days'",
  };
  const interval = intervals[period] || intervals.month;
  const prevInterval = prevIntervals[period] || prevIntervals.month;

  try {
    const [
      convsCurrent, convsPrev,
      msgsCurrent, msgsPrev,
      ordersCurrent, ordersPrev,
      revenueCurrentRes, revenuePrevRes,
      appointmentsCurrent, appointmentsPrev,
      channelDist,
      hourlyDist,
      topProducts,
      convsByDay,
    ] = await Promise.all([
      // Conversaciones período actual
      pool.query(
        `SELECT COUNT(*) FROM conversations WHERE client_id = $1 AND created_at >= NOW() - ${interval}`,
        [clientId]
      ),
      // Conversaciones período anterior
      pool.query(
        `SELECT COUNT(*) FROM conversations WHERE client_id = $1 AND created_at >= NOW() - ${prevInterval} AND created_at < NOW() - ${interval}`,
        [clientId]
      ),
      // Mensajes período actual
      pool.query(
        `SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.client_id = $1 AND m.timestamp >= NOW() - ${interval}`,
        [clientId]
      ),
      // Mensajes período anterior
      pool.query(
        `SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.client_id = $1 AND m.timestamp >= NOW() - ${prevInterval} AND m.timestamp < NOW() - ${interval}`,
        [clientId]
      ),
      // Pedidos período actual
      pool.query(
        `SELECT COUNT(*) FROM orders WHERE client_id = $1 AND created_at >= NOW() - ${interval}`,
        [clientId]
      ),
      // Pedidos período anterior
      pool.query(
        `SELECT COUNT(*) FROM orders WHERE client_id = $1 AND created_at >= NOW() - ${prevInterval} AND created_at < NOW() - ${interval}`,
        [clientId]
      ),
      // Revenue actual
      pool.query(
        `SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE client_id = $1 AND status != 'cancelado' AND created_at >= NOW() - ${interval}`,
        [clientId]
      ),
      // Revenue anterior
      pool.query(
        `SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE client_id = $1 AND status != 'cancelado' AND created_at >= NOW() - ${prevInterval} AND created_at < NOW() - ${interval}`,
        [clientId]
      ),
      // Turnos período actual
      pool.query(
        `SELECT COUNT(*) FROM appointments WHERE client_id = $1 AND created_at >= NOW() - ${interval}`,
        [clientId]
      ),
      // Turnos período anterior
      pool.query(
        `SELECT COUNT(*) FROM appointments WHERE client_id = $1 AND created_at >= NOW() - ${prevInterval} AND created_at < NOW() - ${interval}`,
        [clientId]
      ),
      // Distribución por canal
      pool.query(
        `SELECT channel, COUNT(*) as count FROM conversations WHERE client_id = $1 AND created_at >= NOW() - ${interval} GROUP BY channel ORDER BY count DESC`,
        [clientId]
      ),
      // Distribución horaria de mensajes entrantes
      pool.query(
        `SELECT EXTRACT(HOUR FROM m.timestamp) as hour, COUNT(*) as count
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE c.client_id = $1 AND m.role = 'user' AND m.timestamp >= NOW() - ${interval}
         GROUP BY hour ORDER BY hour`,
        [clientId]
      ),
      // Productos más pedidos (top 5 de orders)
      pool.query(
        `SELECT item->>'name' as name, SUM((item->>'quantity')::int) as qty, SUM((item->>'price')::numeric * (item->>'quantity')::int) as revenue
         FROM orders, jsonb_array_elements(items) as item
         WHERE client_id = $1 AND status != 'cancelado' AND created_at >= NOW() - ${interval}
         GROUP BY item->>'name' ORDER BY qty DESC LIMIT 5`,
        [clientId]
      ),
      // Conversaciones por día (últimos 30 días o período)
      pool.query(
        `SELECT DATE(created_at) as day, COUNT(*) as count
         FROM conversations WHERE client_id = $1 AND created_at >= NOW() - ${interval}
         GROUP BY day ORDER BY day`,
        [clientId]
      ),
    ]);

    const pct = (curr, prev) => {
      const c = parseInt(curr), p = parseInt(prev);
      if (p === 0) return c > 0 ? 100 : 0;
      return Math.round(((c - p) / p) * 100);
    };

    res.json({
      period,
      stats: {
        conversations: { value: parseInt(convsCurrent.rows[0].count), pct: pct(convsCurrent.rows[0].count, convsPrev.rows[0].count) },
        messages: { value: parseInt(msgsCurrent.rows[0].count), pct: pct(msgsCurrent.rows[0].count, msgsPrev.rows[0].count) },
        orders: { value: parseInt(ordersCurrent.rows[0].count), pct: pct(ordersCurrent.rows[0].count, ordersPrev.rows[0].count) },
        revenue: { value: parseFloat(revenueCurrentRes.rows[0].total), prev: parseFloat(revenuePrevRes.rows[0].total) },
        appointments: { value: parseInt(appointmentsCurrent.rows[0].count), pct: pct(appointmentsCurrent.rows[0].count, appointmentsPrev.rows[0].count) },
      },
      channel_distribution: channelDist.rows,
      hourly_distribution: hourlyDist.rows,
      top_products: topProducts.rows,
      conversations_by_day: convsByDay.rows,
    });
  } catch (err) {
    console.error('[reports/overview]', err.message);
    res.status(500).json({ error: 'Error generando reportes' });
  }
});

module.exports = router;
