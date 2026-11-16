const express = require('express');
const router = express.Router();
const axios = require('axios');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

/*
 * Líneas de WhatsApp por QR de la cuenta: la principal (id "principal", la de siempre) y
 * las extra (Ventas, Soporte...). Cada una con su QR, su estado, su bot opcional y su equipo.
 * Solo el dueño.
 */

const QR = () => process.env.QR_SERVICE_URL;
const SECRET = () => process.env.QR_SERVICE_SECRET || 'whabot_qr_secret_2024';
const qrH = () => ({ 'x-service-secret': SECRET(), 'Content-Type': 'application/json' });

function soloDueno(req, res, next) {
  if (req.client.role === 'employee') return res.status(403).json({ error: 'Sin acceso' });
  next();
}

async function lineaDe(req) {
  if (req.params.id === 'principal') return { id: 'principal', sesion: req.client.id, principal: true };
  const r = await pool.query('SELECT * FROM wa_lines WHERE id = $1 AND client_id = $2', [req.params.id, req.client.id]);
  if (!r.rows[0]) return null;
  return { ...r.rows[0], sesion: r.rows[0].id, principal: false };
}

async function estadoQR(sesion) {
  if (!QR()) return { status: 'service_down', qr: null };
  try {
    const r = await axios.get(`${QR()}/session/${sesion}/status`, { headers: qrH(), timeout: 15000 });
    return r.data;
  } catch (_) {
    return { status: 'service_down', qr: null };
  }
}

router.get('/', authMiddleware, soloDueno, async (req, res) => {
  try {
    const cli = (await pool.query(
      `SELECT c.main_line_name, c.main_brain_id, c.whatsapp_mode, bc.qr_auto_reply, s.phone_number
       FROM clients c LEFT JOIN bot_configs bc ON bc.client_id = c.id LEFT JOIN whatsapp_qr_sessions s ON s.client_id = c.id
       WHERE c.id = $1`, [req.client.id])).rows[0] || {};
    const extras = (await pool.query('SELECT * FROM wa_lines WHERE client_id = $1 ORDER BY created_at', [req.client.id])).rows;
    const chats = (await pool.query(
      `SELECT COALESCE(line_id::text, 'principal') AS linea, COUNT(*)::int AS n,
         COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '24 hours')::int AS hoy
       FROM conversations WHERE client_id = $1 AND channel = 'whatsapp' GROUP BY 1`, [req.client.id])).rows;
    const equipo = (await pool.query(`SELECT id, name, line_ids FROM clients WHERE owner_id = $1 AND role = 'employee'`, [req.client.id])).rows;
    const cuantos = (id) => chats.find((c) => c.linea === id) || { n: 0, hoy: 0 };
    const quienes = (id) => equipo.filter((e) => !e.line_ids || e.line_ids.includes(id)).map((e) => e.name);
    const lineas = [{
      id: 'principal', name: cli.main_line_name || 'Principal', kind: 'ventas', principal: true,
      bot_enabled: !!cli.qr_auto_reply, phone_number: cli.phone_number || null, brain_id: cli.main_brain_id || null
    }, ...extras.map((l) => ({ ...l, principal: false }))];
    const conEstado = await Promise.all(lineas.map(async (l) => {
      const st = await estadoQR(l.principal ? req.client.id : l.id);
      return { ...l, status: st.status, phone_number: st.phone || l.phone_number, chats: cuantos(l.id).n, chats_hoy: cuantos(l.id).hoy, equipo: quienes(l.id) };
    }));
    res.json(conEstado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, soloDueno, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  const kind = req.body.kind === 'soporte' ? 'soporte' : 'ventas';
  if (!name) return res.status(400).json({ error: 'Ponele un nombre a la línea' });
  try {
    const n = (await pool.query('SELECT COUNT(*)::int AS n FROM wa_lines WHERE client_id = $1', [req.client.id])).rows[0].n;
    if (n >= 5) return res.status(400).json({ error: 'Hasta 5 líneas extra' });
    const r = await pool.query('INSERT INTO wa_lines (client_id, name, kind) VALUES ($1,$2,$3) RETURNING *', [req.client.id, name, kind]);
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, soloDueno, async (req, res) => {
  try {
    const l = await lineaDe(req);
    if (!l) return res.status(404).json({ error: 'No existe esa línea' });
    const { name, kind, bot_enabled, bot_prompt, brain_id } = req.body;
    const cerebro = brain_id === undefined ? undefined : (brain_id && brain_id !== 'principal' ? brain_id : null);
    if (cerebro) {
      const ok = await pool.query('SELECT 1 FROM brains WHERE id = $1 AND client_id = $2', [cerebro, req.client.id]);
      if (!ok.rows.length) return res.status(400).json({ error: 'Ese cerebro no es de tu cuenta' });
    }
    if (l.principal) {
      if (name !== undefined) await pool.query('UPDATE clients SET main_line_name = $2 WHERE id = $1', [req.client.id, String(name).trim().slice(0, 60) || null]);
      if (bot_enabled !== undefined) await pool.query('UPDATE bot_configs SET qr_auto_reply = $2, active = true WHERE client_id = $1', [req.client.id, !!bot_enabled]);
      if (cerebro !== undefined) await pool.query('UPDATE clients SET main_brain_id = $2 WHERE id = $1', [req.client.id, cerebro]);
      return res.json({ ok: true });
    }
    const r = await pool.query(
      `UPDATE wa_lines SET name = COALESCE($3, name), kind = COALESCE($4, kind), bot_enabled = COALESCE($5, bot_enabled),
         bot_prompt = CASE WHEN $6::boolean THEN $7 ELSE bot_prompt END
       WHERE id = $1 AND client_id = $2 RETURNING *`,
      [l.id, req.client.id, name ? String(name).trim().slice(0, 60) : null, ['ventas', 'soporte'].includes(kind) ? kind : null,
       bot_enabled === undefined ? null : !!bot_enabled, bot_prompt !== undefined, bot_prompt ? String(bot_prompt).slice(0, 20000) : null]
    );
    if (cerebro !== undefined) await pool.query('UPDATE wa_lines SET brain_id = $2 WHERE id = $1', [l.id, cerebro]);
    if (bot_enabled) await pool.query('UPDATE bot_configs SET active = true WHERE client_id = $1', [req.client.id]);
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Conectar: arranca la sesión en el servicio QR y devuelve el estado (con el QR para escanear)
router.post('/:id/connect', authMiddleware, soloDueno, async (req, res) => {
  try {
    const l = await lineaDe(req);
    if (!l) return res.status(404).json({ error: 'No existe esa línea' });
    if (!QR()) return res.status(503).json({ error: 'El servicio de WhatsApp no está disponible' });
    await axios.post(`${QR()}/session/start`, { clientId: l.sesion, secret: SECRET() }, { headers: qrH(), timeout: 30000 });
    if (l.principal) await pool.query(`UPDATE clients SET whatsapp_mode = 'qr' WHERE id = $1`, [req.client.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error || 'No se pudo iniciar la conexión' });
  }
});

router.get('/:id/status', authMiddleware, soloDueno, async (req, res) => {
  const l = await lineaDe(req);
  if (!l) return res.status(404).json({ error: 'No existe esa línea' });
  res.json(await estadoQR(l.sesion));
});

// Desvincular: corta la sesión pero NO borra chats, mensajes ni archivos
router.post('/:id/disconnect', authMiddleware, soloDueno, async (req, res) => {
  try {
    const l = await lineaDe(req);
    if (!l) return res.status(404).json({ error: 'No existe esa línea' });
    if (QR()) { try { await axios.post(`${QR()}/session/${l.sesion}/disconnect`, { secret: SECRET() }, { headers: qrH(), timeout: 30000 }); } catch (_) {} }
    if (l.principal) await pool.query(`UPDATE clients SET whatsapp_mode = 'api' WHERE id = $1`, [req.client.id]);
    else await pool.query(`UPDATE wa_lines SET status = 'disconnected' WHERE id = $1`, [l.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Qué líneas ve cada empleado (null = todas)
router.put('/team/:employeeId', authMiddleware, soloDueno, async (req, res) => {
  const ids = Array.isArray(req.body.line_ids) ? req.body.line_ids.map(String).slice(0, 10) : null;
  try {
    const r = await pool.query(
      `UPDATE clients SET line_ids = $3 WHERE id = $1 AND owner_id = $2 AND role = 'employee' RETURNING id, line_ids`,
      [req.params.employeeId, req.client.id, ids && ids.length ? ids : null]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No es de tu equipo' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
