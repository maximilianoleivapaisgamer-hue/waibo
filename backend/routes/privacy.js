const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const fs = require('fs');
const path = require('path');

// Límite estricto: máximo 5 solicitudes por IP por hora
const bajLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiadas solicitudes. Intentá más tarde.' }
});

// POST /api/privacy/solicitar-baja
// Recibe phone, name, reason — guarda en DB y en log de disco para auditoría
router.post('/solicitar-baja', bajLimiter, async (req, res) => {
  const { phone, name, reason } = req.body;
  if (!phone || !name) {
    return res.status(400).json({ error: 'Teléfono y nombre son requeridos' });
  }

  const timestamp = new Date().toISOString();

  // Guardar en DB para trazabilidad
  try {
    await pool.query(
      `INSERT INTO data_deletion_requests (phone, name, reason, requested_at, status)
       VALUES ($1, $2, $3, NOW(), 'pending')
       ON CONFLICT DO NOTHING`,
      [phone.trim(), name.trim(), reason?.trim() || null]
    );
  } catch (err) {
    // Si la tabla no existe aún, no falla el flujo — se guarda igual en disco
    console.error('data_deletion_requests insert error:', err.message);
  }

  // Guardar log en disco siempre (no depende de la DB)
  try {
    const logsDir = path.join(__dirname, '..', 'logs', 'compliance');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const entry = `[${timestamp}] SOLICITUD DE BAJA | phone=${phone} | name=${name} | reason=${reason || '-'}\n`;
    fs.appendFileSync(path.join(logsDir, 'solicitudes-baja.log'), entry, 'utf8');
  } catch (err) {
    console.error('Error escribiendo log de baja:', err.message);
  }

  console.log(`[privacy] Solicitud de baja recibida — phone=${phone} name=${name}`);
  res.json({ ok: true });
});

module.exports = router;
