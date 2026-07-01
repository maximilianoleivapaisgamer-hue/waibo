const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

router.get('/menu', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM menu_items WHERE client_id = $1 ORDER BY category, name',
    [req.client.id]
  );
  res.json(result.rows);
});

router.post('/menu', authMiddleware, async (req, res) => {
  const { name, description, price, category } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Nombre y precio requeridos' });
  const result = await pool.query(
    'INSERT INTO menu_items (client_id, name, description, price, category) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.client.id, name, description || '', price, category || '']
  );
  res.status(201).json(result.rows[0]);
});

router.put('/menu/:id', authMiddleware, async (req, res) => {
  const { name, description, price, category, available } = req.body;
  const result = await pool.query(
    `UPDATE menu_items SET
      name = COALESCE($1, name), description = COALESCE($2, description),
      price = COALESCE($3, price), category = COALESCE($4, category),
      available = COALESCE($5, available)
     WHERE id = $6 AND client_id = $7 RETURNING *`,
    [name, description, price, category, available, req.params.id, req.client.id]
  );
  res.json(result.rows[0]);
});

router.delete('/menu/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM menu_items WHERE id = $1 AND client_id = $2', [req.params.id, req.client.id]);
  res.json({ success: true });
});

router.get('/', authMiddleware, async (req, res) => {
  const { status } = req.query;
  const result = await pool.query(
    `SELECT * FROM orders WHERE client_id = $1 ${status ? 'AND status = $2' : ''} ORDER BY created_at DESC LIMIT 100`,
    status ? [req.client.id, status] : [req.client.id]
  );
  res.json(result.rows);
});

router.put('/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body;
  if (!['pendiente', 'preparando', 'listo', 'entregado', 'cancelado'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  const result = await pool.query(
    'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND client_id = $3 RETURNING *',
    [status, req.params.id, req.client.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Pedido no encontrado' });
  res.json(result.rows[0]);
});

module.exports = router;
