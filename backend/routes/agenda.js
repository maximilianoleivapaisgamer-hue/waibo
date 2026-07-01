const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const {
  getGoogleOAuthURL, exchangeGoogleCode,
  getAvailableSlots, createCalendarEvent, deleteCalendarEvent
} = require('../services/calendar');
const { encrypt } = require('../services/crypto');
const { normalizePhone } = require('../services/phone');

router.get('/connect', authMiddleware, (req, res) => {
  const url = getGoogleOAuthURL(req.client.id);
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code, state: clientId } = req.query;
  if (!code || !clientId) {
    return res.redirect(`${process.env.FRONTEND_URL}/agenda?error=missing`);
  }
  try {
    const tokens = await exchangeGoogleCode(code);

    await pool.query(
      `INSERT INTO google_tokens (client_id, access_token, refresh_token, token_expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id) DO UPDATE SET
         access_token = $2, refresh_token = $3, token_expires_at = $4, active = true`,
      [clientId, encrypt(tokens.access_token), encrypt(tokens.refresh_token),
       tokens.expiry_date ? new Date(tokens.expiry_date) : null]
    );

    await pool.query(
      'UPDATE bot_configs SET agenda_enabled = true WHERE client_id = $1',
      [clientId]
    );

    res.redirect(`${process.env.FRONTEND_URL}/agenda?connected=true`);
  } catch (err) {
    console.error('Error Google callback:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/agenda?error=auth_failed`);
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT active, created_at, calendar_id FROM google_tokens WHERE client_id = $1',
    [req.client.id]
  );
  const config = await pool.query(
    'SELECT agenda_enabled, agenda_days, agenda_start_hour, agenda_end_hour, reminder_hours_before FROM bot_configs WHERE client_id = $1',
    [req.client.id]
  );
  res.json({
    connected: result.rows.length > 0 && result.rows[0].active,
    ...(result.rows[0] || {}),
    ...(config.rows[0] || {})
  });
});

router.delete('/disconnect', authMiddleware, async (req, res) => {
  await pool.query('UPDATE google_tokens SET active = false WHERE client_id = $1', [req.client.id]);
  await pool.query('UPDATE bot_configs SET agenda_enabled = false WHERE client_id = $1', [req.client.id]);
  res.json({ success: true });
});

router.put('/config', authMiddleware, async (req, res) => {
  const { agenda_days, agenda_start_hour, agenda_end_hour, reminder_hours_before } = req.body;
  try {
    await pool.query(
      `UPDATE bot_configs SET
         agenda_days = COALESCE($1, agenda_days),
         agenda_start_hour = COALESCE($2, agenda_start_hour),
         agenda_end_hour = COALESCE($3, agenda_end_hour),
         reminder_hours_before = COALESCE($4, reminder_hours_before)
       WHERE client_id = $5`,
      [agenda_days, agenda_start_hour, agenda_end_hour, reminder_hours_before, req.client.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error guardando configuración' });
  }
});

router.get('/services', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM services WHERE client_id = $1 AND active = true ORDER BY created_at',
    [req.client.id]
  );
  res.json(result.rows);
});

router.post('/services', authMiddleware, async (req, res) => {
  const { name, duration_minutes, price, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const result = await pool.query(
    'INSERT INTO services (client_id, name, duration_minutes, price, description) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.client.id, name, duration_minutes || 60, price || 0, description || '']
  );
  res.status(201).json(result.rows[0]);
});

router.put('/services/:id', authMiddleware, async (req, res) => {
  const { name, duration_minutes, price, description } = req.body;
  const result = await pool.query(
    `UPDATE services SET name=$1, duration_minutes=$2, price=$3, description=$4 WHERE id=$5 AND client_id=$6 RETURNING *`,
    [name, duration_minutes, price, description, req.params.id, req.client.id]
  );
  res.json(result.rows[0]);
});

router.delete('/services/:id', authMiddleware, async (req, res) => {
  await pool.query('UPDATE services SET active=false WHERE id=$1 AND client_id=$2', [req.params.id, req.client.id]);
  res.json({ success: true });
});

router.get('/appointments', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  const result = await pool.query(
    `SELECT * FROM appointments WHERE client_id = $1
       AND start_time >= COALESCE($2::timestamp, NOW())
       AND start_time <= COALESCE($3::timestamp, NOW() + INTERVAL '30 days')
     ORDER BY start_time ASC`,
    [req.client.id, from || null, to || null]
  );
  res.json(result.rows);
});

router.post('/appointments', authMiddleware, async (req, res) => {
  const { customer_phone: rawPhone, customer_name, service_name, start_time, duration_minutes, notes } = req.body;
  const customer_phone = normalizePhone(rawPhone);
  if (!customer_phone || !start_time) {
    return res.status(400).json({ error: 'Teléfono y horario requeridos' });
  }
  try {
    const start = new Date(start_time);
    const end = new Date(start.getTime() + (duration_minutes || 60) * 60000);

    const result = await pool.query(
      `INSERT INTO appointments (client_id, customer_phone, customer_name, service_name, start_time, end_time, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.client.id, customer_phone, customer_name, service_name, start, end, notes || '']
    );
    const appt = result.rows[0];

    const eventId = await createCalendarEvent(req.client.id, appt).catch(() => null);
    if (eventId) {
      await pool.query('UPDATE appointments SET google_event_id=$1 WHERE id=$2', [eventId, appt.id]);
    }

    res.status(201).json({ ...appt, google_event_id: eventId });
  } catch (err) {
    res.status(500).json({ error: 'Error creando turno' });
  }
});

router.delete('/appointments/:id', authMiddleware, async (req, res) => {
  const appt = await pool.query(
    'SELECT * FROM appointments WHERE id=$1 AND client_id=$2', [req.params.id, req.client.id]
  );
  if (!appt.rows.length) return res.status(404).json({ error: 'Turno no encontrado' });

  if (appt.rows[0].google_event_id) {
    await deleteCalendarEvent(req.client.id, appt.rows[0].google_event_id);
  }
  await pool.query('UPDATE appointments SET status=$1 WHERE id=$2', ['cancelled', req.params.id]);
  res.json({ success: true });
});

router.get('/slots', authMiddleware, async (req, res) => {
  const { date, duration } = req.query;
  if (!date) return res.status(400).json({ error: 'Fecha requerida (YYYY-MM-DD)' });
  try {
    const slots = await getAvailableSlots(req.client.id, new Date(date), parseInt(duration) || 60);
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo disponibilidad: ' + err.message });
  }
});

module.exports = router;
