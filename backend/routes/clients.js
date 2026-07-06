const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, business_name, phone_number, plan, active,
              whatsapp_mode, whatsapp_api_key, whatsapp_phone_id, whatsapp_provider, created_at
       FROM clients WHERE id = $1`,
      [req.client.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

router.put('/me', authMiddleware, async (req, res) => {
  const { name, business_name, phone_number, whatsapp_api_key, whatsapp_phone_id, whatsapp_provider } = req.body;
  try {
    const result = await pool.query(
      `UPDATE clients SET
        name = COALESCE($1, name),
        business_name = COALESCE($2, business_name),
        phone_number = COALESCE($3, phone_number),
        whatsapp_api_key = COALESCE($4, whatsapp_api_key),
        whatsapp_phone_id = COALESCE($5, whatsapp_phone_id),
        whatsapp_provider = COALESCE($6, whatsapp_provider)
       WHERE id = $7
       RETURNING id, name, email, business_name, phone_number, plan,
                 whatsapp_api_key, whatsapp_phone_id, whatsapp_provider`,
      [name, business_name, phone_number, whatsapp_api_key, whatsapp_phone_id, whatsapp_provider, req.client.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

router.put('/me/password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Campos requeridos' });
  if (new_password.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  try {
    const result = await pool.query('SELECT password FROM clients WHERE id = $1', [req.client.id]);
    const valid = await bcrypt.compare(current_password, result.rows[0].password);
    if (!valid) return res.status(400).json({ error: 'La contraseña actual es incorrecta' });
    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE clients SET password = $1 WHERE id = $2', [hashed, req.client.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
});

module.exports = router;
