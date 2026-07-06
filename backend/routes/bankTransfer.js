const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { createAlert } = require('../services/alerts');
const { reactivateClient } = require('../services/cronjobs');
const { sendConversionEmail } = require('../services/mailer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.get('/settings', authMiddleware, async (req, res) => {
  const result = await pool.query('SELECT * FROM payment_settings ORDER BY updated_at DESC LIMIT 1');
  res.json(result.rows[0] || null);
});

router.post('/upload-receipt', authMiddleware, upload.single('receipt'), async (req, res) => {
  const { plan_id, amount } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Subí el comprobante de la transferencia' });
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Solo se aceptan imágenes (JPG/PNG) o PDF' });
  }

  try {
    const receiptBase64 = req.file.buffer.toString('base64');

    const result = await pool.query(
      `INSERT INTO bank_transfer_payments (client_id, plan_id, amount, receipt_filename, receipt_data, receipt_mimetype)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, status, created_at`,
      [req.client.id, plan_id || null, amount || null, req.file.originalname, receiptBase64, req.file.mimetype]
    );

    const clientResult = await pool.query('SELECT name, business_name FROM clients WHERE id = $1', [req.client.id]);
    const clientInfo = clientResult.rows[0];

    await createAlert(
      req.client.id, null, 'transfer_pending_review',
      `💰 ${clientInfo.business_name || clientInfo.name} subió un comprobante de transferencia${amount ? ` por $${amount}` : ''} — pendiente de revisión`
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error subiendo comprobante:', err.message);
    res.status(500).json({ error: 'Error guardando el comprobante. Intentá de nuevo.' });
  }
});

router.get('/my-receipts', authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT id, amount, receipt_filename, status, notes, created_at, reviewed_at
     FROM bank_transfer_payments WHERE client_id = $1 ORDER BY created_at DESC LIMIT 24`,
    [req.client.id]
  );
  res.json(result.rows);
});

function requireAdmin(req, res, next) {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  next();
}

router.get('/admin/pending', requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT bt.*, c.name, c.business_name, c.email
     FROM bank_transfer_payments bt JOIN clients c ON c.id = bt.client_id
     WHERE bt.status = 'pending' ORDER BY bt.created_at ASC`
  );
  res.json(result.rows);
});

router.get('/admin/receipt/:id', requireAdmin, async (req, res) => {
  const result = await pool.query('SELECT receipt_data, receipt_mimetype, receipt_filename FROM bank_transfer_payments WHERE id = $1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'No encontrado' });
  const { receipt_data, receipt_mimetype, receipt_filename } = result.rows[0];
  res.set('Content-Type', receipt_mimetype);
  res.set('Content-Disposition', `inline; filename="${receipt_filename}"`);
  res.send(Buffer.from(receipt_data, 'base64'));
});

router.post('/admin/:id/approve', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bank_transfer_payments SET status = 'approved', reviewed_at = NOW(), reviewed_by = 'admin' WHERE id = $1 RETURNING client_id, plan_id`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No encontrado' });

    const { client_id, plan_id } = result.rows[0];
    await reactivateClient(client_id);
    res.json({ success: true });

    const clientData = await pool.query(
      `SELECT c.name, c.email, c.business_name, p.name as plan_name
       FROM clients c
       LEFT JOIN plans p ON p.id = $2
       WHERE c.id = $1`, [client_id, plan_id]
    );
    if (clientData.rows.length) {
      sendConversionEmail(clientData.rows[0], clientData.rows[0].plan_name || 'Estándar').catch(e => console.error('[conversion-email]', e.message));
    }
  } catch (err) {
    res.status(500).json({ error: 'Error aprobando el pago' });
  }
});

router.post('/admin/:id/reject', requireAdmin, async (req, res) => {
  const { notes } = req.body;
  await pool.query(
    `UPDATE bank_transfer_payments SET status = 'rejected', reviewed_at = NOW(), reviewed_by = 'admin', notes = $1 WHERE id = $2`,
    [notes || '', req.params.id]
  );
  res.json({ success: true });
});

router.put('/admin/settings', requireAdmin, async (req, res) => {
  const { bank_alias, bank_cbu, bank_account_holder, bank_cuit, instructions } = req.body;
  await pool.query(
    `INSERT INTO payment_settings (bank_alias, bank_cbu, bank_account_holder, bank_cuit, instructions, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())`,
    [bank_alias, bank_cbu, bank_account_holder, bank_cuit, instructions]
  );
  res.json({ success: true });
});

module.exports = router;
