const express = require('express');
const router = express.Router();
const pool = require('../db');

/*
 * Cola para el runner de IA del VPS (Claude Max). El VPS no recibe conexiones: viene él a
 * buscar trabajo (GET /next espera hasta 25 s si no hay nada) y devuelve la respuesta.
 * services/ai.js encola cuando AI_PROVIDER=max.
 */

function autorizado(req, res, next) {
  if (!process.env.WAIBO_IA_SECRET || req.headers['x-waibo-secret'] !== process.env.WAIBO_IA_SECRET) {
    return res.status(401).json({ error: 'no autorizado' });
  }
  next();
}

async function tomarTrabajo() {
  const r = await pool.query(
    `UPDATE ai_jobs SET status = 'taken', taken_at = NOW()
     WHERE id = (SELECT id FROM ai_jobs WHERE status = 'pending' AND created_at > NOW() - INTERVAL '3 minutes'
                 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING id, payload`
  );
  return r.rows[0] || null;
}

router.get('/next', autorizado, async (req, res) => {
  const hasta = Date.now() + 25000;
  try {
    while (Date.now() < hasta) {
      const job = await tomarTrabajo();
      if (job) return res.json(job);
      await new Promise((r) => setTimeout(r, 700));
    }
    res.json(null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/result', autorizado, async (req, res) => {
  const { text, error } = req.body || {};
  try {
    await pool.query(
      `UPDATE ai_jobs SET status = $2, result = $3, error = $4, done_at = NOW() WHERE id = $1`,
      [req.params.id, text ? 'done' : 'error', text || null, error ? String(error).slice(0, 500) : null]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
