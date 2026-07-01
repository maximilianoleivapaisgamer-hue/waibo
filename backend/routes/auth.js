const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

router.post('/register', async (req, res) => {
  const { name, email, password, business_name, phone_number } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }

  try {
    const existing = await pool.query('SELECT id FROM clients WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe una cuenta con ese email' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO clients (name, email, password, business_name, phone_number)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, business_name, plan`,
      [name, email, hashedPassword, business_name || '', phone_number || '']
    );

    const client = result.rows[0];

    await pool.query(
      `INSERT INTO bot_configs (client_id, system_prompt, business_info, welcome_message)
       VALUES ($1, $2, $3, $4)`,
      [
        client.id,
        `Sos el asistente virtual de ${business_name || name}. Respondé de forma amable, clara y concisa. Si no sabés algo, decilo honestamente.`,
        `Negocio: ${business_name || name}`,
        `¡Hola! Soy el asistente de ${business_name || name}. ¿En qué puedo ayudarte hoy?`
      ]
    );

    const token = jwt.sign({ id: client.id, email: client.email }, process.env.JWT_SECRET, {
      expiresIn: '30d'
    });

    res.status(201).json({ token, client });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar cliente' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  try {
    const result = await pool.query('SELECT * FROM clients WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Email o contraseña incorrectos' });
    }

    const client = result.rows[0];
    const validPassword = await bcrypt.compare(password, client.password);

    if (!validPassword) {
      return res.status(400).json({ error: 'Email o contraseña incorrectos' });
    }

    if (!client.active) {
      return res.status(403).json({ error: 'Cuenta desactivada. Contactá al soporte.' });
    }

    const token = jwt.sign({ id: client.id, email: client.email }, process.env.JWT_SECRET, {
      expiresIn: '30d'
    });

    const { password: _, ...clientData } = client;
    res.json({ token, client: clientData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

module.exports = router;
