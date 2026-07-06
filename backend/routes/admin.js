const express = require('express');
const router = express.Router();
const pool = require('../db');
const nodemailer = require('nodemailer');

function checkAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// GET /api/admin/stats
router.get('/stats', checkAdmin, async (req, res) => {
  try {
    const [
      clients, activeClients, suspendedClients,
      newThisWeek, newThisMonth,
      totalConvs, convsToday, convsThisWeek, convsThisMonth,
      totalMsgs, msgsToday, msgsThisWeek, msgsThisMonth,
      pendingBajas, revenue,
      channelDist
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM clients'),
      pool.query("SELECT COUNT(*) FROM clients WHERE active = true"),
      pool.query("SELECT COUNT(*) FROM clients WHERE active = false"),
      pool.query("SELECT COUNT(*) FROM clients WHERE created_at >= date_trunc('week', NOW())"),
      pool.query("SELECT COUNT(*) FROM clients WHERE created_at >= date_trunc('month', NOW())"),
      pool.query('SELECT COUNT(*) FROM conversations'),
      pool.query("SELECT COUNT(*) FROM conversations WHERE created_at >= CURRENT_DATE"),
      pool.query("SELECT COUNT(*) FROM conversations WHERE created_at >= date_trunc('week', NOW())"),
      pool.query("SELECT COUNT(*) FROM conversations WHERE created_at >= date_trunc('month', NOW())"),
      pool.query('SELECT COUNT(*) FROM messages'),
      pool.query("SELECT COUNT(*) FROM messages WHERE timestamp >= CURRENT_DATE"),
      pool.query("SELECT COUNT(*) FROM messages WHERE timestamp >= date_trunc('week', NOW())"),
      pool.query("SELECT COUNT(*) FROM messages WHERE timestamp >= date_trunc('month', NOW())"),
      pool.query("SELECT COUNT(*) FROM data_deletion_requests WHERE status = 'pending'"),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM billing WHERE status = 'active'"),
      pool.query("SELECT channel, COUNT(*) as count FROM conversations GROUP BY channel ORDER BY count DESC"),
    ]);

    const tc = parseInt(clients.rows[0].count);
    const ac = parseInt(activeClients.rows[0].count);

    res.json({
      total_clients: tc,
      active_clients: ac,
      suspended_clients: parseInt(suspendedClients.rows[0].count),
      new_clients_week: parseInt(newThisWeek.rows[0].count),
      new_clients_month: parseInt(newThisMonth.rows[0].count),
      churn_rate: tc > 0 ? Math.round((tc - ac) / tc * 100) : 0,
      total_conversations: parseInt(totalConvs.rows[0].count),
      conversations_today: parseInt(convsToday.rows[0].count),
      conversations_week: parseInt(convsThisWeek.rows[0].count),
      conversations_month: parseInt(convsThisMonth.rows[0].count),
      total_messages: parseInt(totalMsgs.rows[0].count),
      messages_today: parseInt(msgsToday.rows[0].count),
      messages_week: parseInt(msgsThisWeek.rows[0].count),
      messages_month: parseInt(msgsThisMonth.rows[0].count),
      pending_deletion_requests: parseInt(pendingBajas.rows[0].count),
      monthly_revenue: parseFloat(revenue.rows[0].total),
      channel_distribution: channelDist.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/clients — lista completa con canales, actividad y salud
router.get('/clients', checkAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id, c.name, c.email, c.business_name, c.phone_number,
        c.whatsapp_mode, c.whatsapp_provider, c.whatsapp_api_key,
        c.active, c.plan, c.created_at, c.trial_ends_at,
        b.status as billing_status, b.amount, b.last_payment, b.next_due, b.suspended_at,

        -- canales conectados
        EXISTS(SELECT 1 FROM instagram_tokens it WHERE it.client_id = c.id) as has_instagram,
        EXISTS(SELECT 1 FROM facebook_tokens ft WHERE ft.client_id = c.id) as has_facebook,
        EXISTS(SELECT 1 FROM mercadolibre_tokens mt WHERE mt.client_id = c.id) as has_ml,
        EXISTS(SELECT 1 FROM tiendanube_tokens tt WHERE tt.client_id = c.id) as has_tiendanube,
        EXISTS(SELECT 1 FROM whatsapp_qr_sessions wqs WHERE wqs.client_id::uuid = c.id AND wqs.status = 'connected') as has_whatsapp_qr,

        -- actividad
        (SELECT COUNT(*) FROM conversations cv WHERE cv.client_id = c.id) as total_conversations,
        (SELECT COUNT(*) FROM conversations cv WHERE cv.client_id = c.id AND cv.created_at >= date_trunc('month', NOW())) as convs_this_month,
        (SELECT COUNT(*) FROM messages m JOIN conversations cv ON cv.id = m.conversation_id WHERE cv.client_id = c.id AND m.timestamp >= date_trunc('month', NOW())) as msgs_this_month,
        (SELECT MAX(cv.updated_at) FROM conversations cv WHERE cv.client_id = c.id) as last_activity,

        -- salud del bot
        (SELECT LENGTH(COALESCE(bc.system_prompt, '')) > 100 FROM bot_configs bc WHERE bc.client_id = c.id) as bot_configured,
        (SELECT COUNT(*) FROM knowledge_base kb WHERE kb.client_id = c.id) as knowledge_entries,
        (SELECT bc.has_tested_bot FROM bot_configs bc WHERE bc.client_id = c.id) as has_tested_bot,

        -- alertas abiertas
        (SELECT COUNT(*) FROM alerts a WHERE a.client_id = c.id AND a.resolved = false) as open_alerts

      FROM clients c
      LEFT JOIN billing b ON b.client_id = c.id
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('[admin/clients]', err.message);
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

// GET /api/admin/activity — feed de actividad reciente de toda la plataforma
router.get('/activity', checkAdmin, async (req, res) => {
  try {
    const [recentConvs, recentClients] = await Promise.all([
      pool.query(`
        SELECT cv.id, cv.customer_name, cv.customer_phone, cv.channel,
               cv.status, cv.updated_at, cv.message_count,
               c.business_name, c.name as client_name
        FROM conversations cv
        JOIN clients c ON c.id = cv.client_id
        ORDER BY cv.updated_at DESC
        LIMIT 30
      `),
      pool.query(`
        SELECT id, name, email, business_name, plan, created_at
        FROM clients
        ORDER BY created_at DESC
        LIMIT 10
      `),
    ]);
    res.json({
      recent_conversations: recentConvs.rows,
      recent_registrations: recentClients.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/health — clientes en riesgo de churn
router.get('/health', checkAdmin, async (req, res) => {
  try {
    const [noChannels, noActivity, noBotConfig] = await Promise.all([
      // Activos sin ningún canal conectado
      pool.query(`
        SELECT c.id, c.name, c.email, c.business_name, c.created_at
        FROM clients c
        WHERE c.active = true
          AND NOT EXISTS(SELECT 1 FROM instagram_tokens it WHERE it.client_id = c.id)
          AND NOT EXISTS(SELECT 1 FROM facebook_tokens ft WHERE ft.client_id = c.id)
          AND NOT EXISTS(SELECT 1 FROM mercadolibre_tokens mt WHERE mt.client_id = c.id)
          AND NOT EXISTS(SELECT 1 FROM whatsapp_qr_sessions wqs WHERE wqs.client_id = c.id::text AND wqs.status = 'connected')
          AND (c.whatsapp_api_key IS NULL OR c.whatsapp_api_key = '')
        ORDER BY c.created_at DESC
      `),
      // Activos sin actividad en los últimos 7 días
      pool.query(`
        SELECT c.id, c.name, c.email, c.business_name,
               MAX(cv.updated_at) as last_activity
        FROM clients c
        LEFT JOIN conversations cv ON cv.client_id = c.id
        WHERE c.active = true
        GROUP BY c.id, c.name, c.email, c.business_name
        HAVING MAX(cv.updated_at) < NOW() - INTERVAL '7 days'
           OR MAX(cv.updated_at) IS NULL
        ORDER BY last_activity ASC NULLS FIRST
      `),
      // Activos con bot sin configurar
      pool.query(`
        SELECT c.id, c.name, c.email, c.business_name, c.created_at
        FROM clients c
        JOIN bot_configs bc ON bc.client_id = c.id
        WHERE c.active = true
          AND (
            bc.system_prompt IS NULL
            OR LENGTH(bc.system_prompt) < 100
            OR bc.system_prompt = 'Sos un asistente útil.'
          )
        ORDER BY c.created_at DESC
      `),
    ]);
    res.json({
      no_channels: noChannels.rows,
      no_activity_7d: noActivity.rows,
      no_bot_config: noBotConfig.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/deletion-requests
router.get('/deletion-requests', checkAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM data_deletion_requests ORDER BY requested_at DESC LIMIT 100'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/clients/:id/notify-payment
router.post('/clients/:id/notify-payment', checkAdmin, async (req, res) => {
  try {
    const client = await pool.query('SELECT c.name, c.email, c.business_name, b.next_due, b.amount FROM clients c LEFT JOIN billing b ON b.client_id = c.id WHERE c.id = $1', [req.params.id]);
    if (!client.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    const c = client.rows[0];
    const nextDue = c.next_due ? new Date(c.next_due).toLocaleDateString('es-AR') : 'próximamente';
    const amount = c.amount ? `$${Number(c.amount).toLocaleString('es-AR')} ARS` : 'según tu plan';

    const transporter = nodemailer.createTransport({
      host: '172.65.255.143',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
      tls: { servername: 'smtp.hostinger.com' },
    });

    await transporter.verify();
    console.log('[mail] SMTP verificado OK');
    await transporter.sendMail({
      from: `"Waibo" <${process.env.MAIL_USER}>`,
      to: c.email,
      subject: 'Recordatorio de pago — Waibo',
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#1A1A2E">
          <img src="https://frontend-lac-nine-16.vercel.app/waibo-logo.png" width="48" style="border-radius:12px;margin-bottom:16px"/>
          <h2 style="margin:0 0 8px">Recordatorio de pago</h2>
          <p>Hola <strong>${c.business_name || c.name}</strong>,</p>
          <p>Te recordamos que tu suscripción a <strong>Waibo</strong> vence el <strong>${nextDue}</strong>.</p>
          <p>El monto a abonar es <strong>${amount}</strong>.</p>
          <p>Para renovar tu plan y seguir usando el bot sin interrupciones, ingresá a tu panel:</p>
          <a href="https://frontend-lac-nine-16.vercel.app/billing" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#7C3AED;color:white;border-radius:10px;text-decoration:none;font-weight:600">Ver mi plan</a>
          <p style="color:#6B7280;font-size:13px;margin-top:32px">Si ya realizaste el pago, ignorá este mensaje. Ante dudas escribinos a <a href="mailto:hola@waibochat.com">hola@waibochat.com</a></p>
        </div>
      `,
    });

    res.json({ ok: true, sent_to: c.email });
  } catch (err) {
    console.error('[admin/notify-payment]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/clients/:id/plan — cambiar plan y monto de facturación
router.put('/clients/:id/plan', checkAdmin, async (req, res) => {
  const { plan, amount, next_due } = req.body;
  if (!plan) return res.status(400).json({ error: 'plan requerido' });
  try {
    await pool.query('UPDATE clients SET plan = $1 WHERE id = $2', [plan, req.params.id]);
    await pool.query(
      'UPDATE billing SET plan = $1, amount = $2, next_due = $3 WHERE client_id = $4',
      [plan, amount || null, next_due || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/growth — crecimiento mes a mes últimos 6 meses
router.get('/growth', checkAdmin, async (req, res) => {
  try {
    const [clientGrowth, revenueGrowth] = await Promise.all([
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
          COUNT(*) as new_clients
        FROM clients
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY month
        ORDER BY month ASC
      `),
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', last_payment), 'YYYY-MM') as month,
          COALESCE(SUM(amount), 0) as revenue,
          COUNT(*) as paying_clients
        FROM billing
        WHERE last_payment IS NOT NULL AND last_payment >= NOW() - INTERVAL '6 months'
        GROUP BY month
        ORDER BY month ASC
      `),
    ]);
    res.json({
      client_growth: clientGrowth.rows,
      revenue_by_month: revenueGrowth.rows,
    });
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
