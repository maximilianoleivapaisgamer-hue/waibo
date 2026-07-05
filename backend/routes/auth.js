const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

function getMailer() {
  return nodemailer.createTransport({
    host: '172.65.255.143',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    tls: { servername: 'smtp.hostinger.com' },
  });
}

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
      `INSERT INTO clients (name, email, password, business_name, phone_number, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '14 days') RETURNING id, name, email, business_name, plan, trial_ends_at`,
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

    const token = jwt.sign({
      id: client.id,
      email: client.email,
      role: client.role || 'owner',
      owner_id: client.owner_id || null,
    }, process.env.JWT_SECRET, { expiresIn: '30d' });

    const { password: _, ...clientData } = client;
    res.json({ token, client: clientData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// GET /api/auth/employees — lista empleados del dueño
router.get('/employees', authMiddleware, async (req, res) => {
  if (req.client.role === 'employee') return res.status(403).json({ error: 'Sin acceso' });
  const ownerId = req.client.own_id || req.client.id;
  try {
    const result = await pool.query(
      `SELECT id, name, email, created_at FROM clients WHERE owner_id = $1 AND role = 'employee' ORDER BY created_at DESC`,
      [ownerId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo empleados' });
  }
});

// POST /api/auth/employees — crear empleado
router.post('/employees', authMiddleware, async (req, res) => {
  if (req.client.role === 'employee') return res.status(403).json({ error: 'Sin acceso' });
  const ownerId = req.client.own_id || req.client.id;
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña requeridos' });
  try {
    const existing = await pool.query('SELECT id FROM clients WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Ya existe una cuenta con ese email' });

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO clients (name, email, password, role, owner_id, active)
       VALUES ($1, $2, $3, 'employee', $4, true) RETURNING id, name, email, role, created_at`,
      [name, email, hashed, ownerId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[create-employee]', err.message);
    res.status(500).json({ error: 'Error creando empleado' });
  }
});

// DELETE /api/auth/employees/:id — eliminar empleado
router.delete('/employees/:id', authMiddleware, async (req, res) => {
  if (req.client.role === 'employee') return res.status(403).json({ error: 'Sin acceso' });
  const ownerId = req.client.own_id || req.client.id;
  try {
    const result = await pool.query(
      `DELETE FROM clients WHERE id = $1 AND owner_id = $2 AND role = 'employee' RETURNING id`,
      [req.params.id, ownerId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Empleado no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error eliminando empleado' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });

  // Siempre responder OK para no revelar si el email existe
  res.json({ ok: true, message: 'Si ese email está registrado, vas a recibir un link para resetear tu contraseña.' });

  try {
    const result = await pool.query('SELECT id, name, business_name FROM clients WHERE email = $1 AND active = true', [email]);
    if (!result.rows.length) return;

    const client = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await pool.query(
      'INSERT INTO password_reset_tokens (client_id, token, expires_at) VALUES ($1, $2, $3)',
      [client.id, token, expiresAt]
    );

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    const nombre = client.business_name || client.name;

    const mailer = getMailer();
    await mailer.sendMail({
      from: `"Waibo" <${process.env.MAIL_USER}>`,
      to: email,
      subject: 'Resetear tu contraseña — Waibo',
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#1A1A2E">
          <img src="https://frontend-lac-nine-16.vercel.app/waibo-logo.png" width="48" style="border-radius:12px;margin-bottom:16px"/>
          <h2 style="margin:0 0 8px">Resetear contraseña</h2>
          <p>Hola <strong>${nombre}</strong>,</p>
          <p>Recibimos una solicitud para resetear la contraseña de tu cuenta en Waibo.</p>
          <p>Hacé clic en el botón para crear una nueva contraseña. El link es válido por <strong>1 hora</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#7C3AED;color:white;border-radius:10px;text-decoration:none;font-weight:600">Resetear contraseña</a>
          <p style="color:#6B7280;font-size:13px;margin-top:16px">Si no pediste este reset, ignorá este email. Tu contraseña no va a cambiar.</p>
          <p style="color:#6B7280;font-size:13px">Si el botón no funciona, copiá este link:<br/><a href="${resetUrl}" style="color:#7C3AED">${resetUrl}</a></p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[forgot-password]', err.message);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token y contraseña requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  try {
    const result = await pool.query(
      `SELECT prt.*, c.email FROM password_reset_tokens prt
       JOIN clients c ON c.id = prt.client_id
       WHERE prt.token = $1 AND prt.used = false AND prt.expires_at > NOW()`,
      [token]
    );

    if (!result.rows.length) {
      return res.status(400).json({ error: 'El link expiró o ya fue usado. Solicitá uno nuevo.' });
    }

    const { client_id, id: tokenId } = result.rows[0];
    const hashed = await bcrypt.hash(password, 10);

    await pool.query('UPDATE clients SET password = $1 WHERE id = $2', [hashed, client_id]);
    await pool.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [tokenId]);

    res.json({ ok: true, message: 'Contraseña actualizada correctamente. Ya podés iniciar sesión.' });
  } catch (err) {
    console.error('[reset-password]', err.message);
    res.status(500).json({ error: 'Error actualizando contraseña' });
  }
});

// GET /api/auth/reset-password/validate — verifica si un token es válido
router.get('/reset-password/validate', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ valid: false });
  try {
    const result = await pool.query(
      'SELECT id FROM password_reset_tokens WHERE token = $1 AND used = false AND expires_at > NOW()',
      [token]
    );
    res.json({ valid: result.rows.length > 0 });
  } catch {
    res.json({ valid: false });
  }
});

module.exports = router;
