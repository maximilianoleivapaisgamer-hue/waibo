const express = require('express');
const router = express.Router();
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

module.exports = router;
