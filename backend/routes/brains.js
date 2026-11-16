const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

/*
 * Cerebros: cada uno es una forma de atender (Ventas, Soporte...) con sus instrucciones, su
 * base de conocimiento y sus archivos. El cerebro "principal" es la configuración de siempre
 * del bot (bot_configs); los demás viven en la tabla brains. Cada línea de WhatsApp elige su
 * cerebro (wa_lines.brain_id; la línea principal usa clients.main_brain_id, NULL = principal).
 */

const PLANTILLA_SOPORTE = `Sos el soporte técnico del negocio. Atendés a clientes que YA compraron y tienen un problema o una consulta de uso.

CÓMO ATENDÉS
- Saludá corto y preguntá en qué lo podés ayudar, si todavía no lo contó.
- Pedí los datos que hagan falta para entender el problema: qué pasa, desde cuándo, con qué equipo o cuenta.
- Si la solución está en tus instrucciones o en la base de conocimiento, explicala paso a paso, corto y claro.
- Confirmá al final si quedó resuelto.

CUÁNDO PASARLO A UNA PERSONA
Escribí solo [[derivar:tema]] (el cliente no recibe nada y el caso queda para el equipo) cuando:
- La solución no está en tus instrucciones.
- Hay que tocar algo de la cuenta del cliente, un pago o una devolución.
- El cliente está enojado o pide hablar con una persona.

[COMPLETAR: problemas frecuentes y cómo se resuelven]`;

function soloDueno(req, res, next) {
  if (req.client.role === 'employee') return res.status(403).json({ error: 'Sin acceso' });
  next();
}

router.get('/', authMiddleware, soloDueno, async (req, res) => {
  try {
    const cli = (await pool.query('SELECT main_brain_name FROM clients WHERE id = $1', [req.client.id])).rows[0] || {};
    const otros = (await pool.query('SELECT * FROM brains WHERE client_id = $1 ORDER BY created_at', [req.client.id])).rows;
    const kb = (await pool.query(
      `SELECT COALESCE(brain_id::text, 'principal') AS b, COUNT(*)::int AS n FROM knowledge_base WHERE client_id = $1 GROUP BY 1`, [req.client.id])).rows;
    const rec = (await pool.query(
      `SELECT COALESCE(brain_id::text, 'principal') AS b, COUNT(*)::int AS n FROM bot_resources WHERE client_id = $1 GROUP BY 1`, [req.client.id])).rows;
    const n = (lista, id) => lista.find((x) => x.b === id)?.n || 0;
    res.json([
      { id: 'principal', name: cli.main_brain_name || 'Ventas', kind: 'ventas', principal: true, knowledge: n(kb, 'principal'), resources: n(rec, 'principal') },
      ...otros.map((b) => ({ ...b, principal: false, knowledge: n(kb, b.id), resources: n(rec, b.id) }))
    ]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, soloDueno, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  const kind = req.body.kind === 'soporte' ? 'soporte' : 'ventas';
  if (!name) return res.status(400).json({ error: 'Ponele un nombre al cerebro' });
  try {
    const cfg = (await pool.query('SELECT bot_name, bot_tone, ai_model FROM bot_configs WHERE client_id = $1', [req.client.id])).rows[0] || {};
    const r = await pool.query(
      `INSERT INTO brains (client_id, name, kind, system_prompt, bot_name, bot_tone, ai_model) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.client.id, name, kind, kind === 'soporte' ? PLANTILLA_SOPORTE : '', cfg.bot_name || null, cfg.bot_tone || 'amigable', cfg.ai_model || null]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authMiddleware, soloDueno, async (req, res) => {
  const r = await pool.query('SELECT * FROM brains WHERE id = $1 AND client_id = $2', [req.params.id, req.client.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'No existe ese cerebro' });
  res.json(r.rows[0]);
});

router.put('/:id', authMiddleware, soloDueno, async (req, res) => {
  try {
    if (req.params.id === 'principal') {
      await pool.query('UPDATE clients SET main_brain_name = $2 WHERE id = $1', [req.client.id, String(req.body.name || '').trim().slice(0, 60) || null]);
      return res.json({ ok: true });
    }
    const c = ['name', 'kind', 'system_prompt', 'business_info', 'bot_name', 'bot_tone', 'bot_tone_custom', 'ai_model', 'label_instructions', 'welcome_message'];
    const sets = [];
    const vals = [req.params.id, req.client.id];
    for (const k of c) {
      if (req.body[k] === undefined) continue;
      vals.push(k === 'kind' ? (req.body[k] === 'soporte' ? 'soporte' : 'ventas') : (req.body[k] === null ? null : String(req.body[k]).slice(0, 30000)));
      sets.push(`${k} = $${vals.length}`);
    }
    if (!sets.length) return res.json({ ok: true });
    const r = await pool.query(`UPDATE brains SET ${sets.join(', ')} WHERE id = $1 AND client_id = $2 RETURNING *`, vals);
    if (!r.rows[0]) return res.status(404).json({ error: 'No existe ese cerebro' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, soloDueno, async (req, res) => {
  try {
    const usado = (await pool.query('SELECT name FROM wa_lines WHERE brain_id = $1 AND client_id = $2', [req.params.id, req.client.id])).rows;
    if (usado.length) return res.status(400).json({ error: `Lo usa la línea "${usado[0].name}". Cambiale el cerebro antes de borrarlo.` });
    await pool.query('UPDATE clients SET main_brain_id = NULL WHERE id = $1 AND main_brain_id = $2', [req.client.id, req.params.id]);
    await pool.query('UPDATE knowledge_base SET brain_id = NULL WHERE client_id = $1 AND brain_id = $2', [req.client.id, req.params.id]);
    await pool.query('UPDATE bot_resources SET brain_id = NULL WHERE client_id = $1 AND brain_id = $2', [req.client.id, req.params.id]);
    await pool.query('DELETE FROM brains WHERE id = $1 AND client_id = $2', [req.params.id, req.client.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
