const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

// WhatsApp acepta hasta 16 MB en imágenes/videos por mensaje.
const MAX_BYTES = 16 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

function kindDe(mimetype) {
  if (/^image\//.test(mimetype)) return 'image';
  if (/^video\//.test(mimetype)) return 'video';
  return 'document';
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, description, kind, mimetype, filename, url, size_bytes, created_at
       FROM bot_resources WHERE client_id = $1 ORDER BY created_at DESC`,
      [req.client.id]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error cargando los recursos' });
  }
});

router.post('/file', authMiddleware, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera los 16 MB que permite WhatsApp.' : 'Error subiendo el archivo';
      return res.status(400).json({ error: msg });
    }
    const { name, description } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
    if (!name || !name.trim()) return res.status(400).json({ error: 'Poné un nombre para el recurso' });
    try {
      const r = await pool.query(
        `INSERT INTO bot_resources (client_id, name, description, kind, mimetype, filename, data, size_bytes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, name, description, kind, mimetype, filename, size_bytes, created_at`,
        [req.client.id, name.trim(), description || '', kindDe(req.file.mimetype), req.file.mimetype,
         req.file.originalname, req.file.buffer, req.file.size]
      );
      res.json(r.rows[0]);
    } catch (e) {
      console.error('[resources] error guardando:', e.message);
      res.status(500).json({ error: 'Error guardando el recurso' });
    }
  });
});

router.post('/link', authMiddleware, async (req, res) => {
  const { name, description, url } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Faltan el nombre o el link' });
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'El link tiene que empezar con http:// o https://' });
  try {
    const r = await pool.query(
      `INSERT INTO bot_resources (client_id, name, description, kind, url)
       VALUES ($1,$2,$3,'link',$4)
       RETURNING id, name, description, kind, url, created_at`,
      [req.client.id, name.trim(), description || '', url.trim()]
    );
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Error guardando el link' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM bot_resources WHERE id = $1 AND client_id = $2', [req.params.id, req.client.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error eliminando el recurso' });
  }
});

module.exports = router;
