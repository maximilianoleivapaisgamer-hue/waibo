const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { scrapeURL } = require('../services/scraper');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const MIN_USEFUL_PDF_CHARS = 30;

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, type, title, LEFT(content, 200) as preview, source_url, created_at FROM knowledge_base WHERE client_id = $1 ORDER BY created_at DESC',
      [req.client.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo base de conocimiento' });
  }
});

router.get('/export', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, type, title, content, source_url, created_at FROM knowledge_base WHERE client_id = $1 ORDER BY created_at DESC',
      [req.client.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error exportando base de conocimiento' });
  }
});

router.post('/text', authMiddleware, async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Título y contenido requeridos' });

  try {
    const result = await pool.query(
      `INSERT INTO knowledge_base (client_id, type, title, content)
       VALUES ($1, 'text', $2, $3) RETURNING *`,
      [req.client.id, title, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error guardando texto' });
  }
});

router.post('/url', authMiddleware, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requerida' });

  try {
    const content = await scrapeURL(url);
    const title = `Web: ${new URL(url).hostname}`;

    const result = await pool.query(
      `INSERT INTO knowledge_base (client_id, type, title, content, source_url)
       VALUES ($1, 'url', $2, $3, $4) RETURNING *`,
      [req.client.id, title, content, url]
    );
    res.status(201).json({ ...result.rows[0], chars: content.length });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error procesando URL' });
  }
});

router.post('/file', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  try {
    const { originalname, buffer, mimetype } = req.file;
    let content = '';

    if (mimetype === 'text/plain') {
      content = buffer.toString('utf-8');

    } else if (mimetype === 'application/pdf') {
      let extractedText = '';
      try {
        const pdfData = await pdfParse(buffer);
        extractedText = (pdfData.text || '').trim();
      } catch (pdfErr) {
        console.error('Error parseando PDF:', pdfErr.message);
        return res.status(400).json({
          error: `No pudimos leer el contenido de "${originalname}". El archivo puede estar dañado o protegido. Probá con otro PDF, o pegá el contenido como texto libre.`
        });
      }

      if (extractedText.length < MIN_USEFUL_PDF_CHARS) {
        return res.status(400).json({
          error: `"${originalname}" parece ser un PDF escaneado (una imagen, no texto). No pudimos extraer información legible. Te recomendamos copiar el contenido manualmente en la pestaña "Texto libre".`
        });
      }

      content = extractedText;

    } else {
      return res.status(400).json({ error: 'Solo se aceptan archivos .txt y .pdf' });
    }

    const result = await pool.query(
      `INSERT INTO knowledge_base (client_id, type, title, content)
       VALUES ($1, 'file', $2, $3) RETURNING *`,
      [req.client.id, originalname, content]
    );
    res.status(201).json({ ...result.rows[0], chars: content.length });
  } catch (err) {
    console.error('Error procesando archivo:', err.message);
    res.status(500).json({ error: 'Error procesando archivo' });
  }
});

router.put('/url/:id', authMiddleware, async (req, res) => {
  try {
    const entry = await pool.query(
      `SELECT * FROM knowledge_base WHERE id = $1 AND client_id = $2 AND type = 'url'`,
      [req.params.id, req.client.id]
    );
    if (!entry.rows.length) return res.status(404).json({ error: 'Entrada no encontrada' });

    const { source_url } = entry.rows[0];
    const content = await scrapeURL(source_url);

    const result = await pool.query(
      `UPDATE knowledge_base SET content = $1, created_at = NOW() WHERE id = $2 RETURNING *`,
      [content, req.params.id]
    );
    res.json({ ...result.rows[0], chars: content.length });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error actualizando URL' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM knowledge_base WHERE id = $1 AND client_id = $2',
      [req.params.id, req.client.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error eliminando entrada' });
  }
});

module.exports = router;
