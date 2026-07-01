const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { getFacebookOAuthURL, exchangeFacebookCode, getFacebookPage } = require('../services/facebook');
const { encrypt } = require('../services/crypto');

router.get('/connect', authMiddleware, (req, res) => {
  const url = getFacebookOAuthURL(req.client.id);
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code, state: clientId } = req.query;
  if (!code || !clientId) {
    return res.redirect(`${process.env.FRONTEND_URL}/facebook?fb_error=missing_params`);
  }

  try {
    const accessToken = await exchangeFacebookCode(code);
    const page = await getFacebookPage(accessToken);

    await pool.query(
      `INSERT INTO facebook_tokens (client_id, page_id, page_name, access_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id) DO UPDATE SET
         page_id = $2, page_name = $3, access_token = $4, active = true`,
      [clientId, page.pageId, page.pageName, encrypt(page.pageToken)]
    );

    res.redirect(`${process.env.FRONTEND_URL}/facebook?fb_connected=true&page=${encodeURIComponent(page.pageName)}`);
  } catch (err) {
    console.error('Error en callback Facebook:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/facebook?fb_error=auth_failed`);
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT page_id, page_name, active, created_at FROM facebook_tokens WHERE client_id = $1',
      [req.client.id]
    );
    if (!result.rows.length) return res.json({ connected: false });
    res.json({ connected: true, ...result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error verificando Facebook' });
  }
});

router.delete('/disconnect', authMiddleware, async (req, res) => {
  await pool.query('UPDATE facebook_tokens SET active = false WHERE client_id = $1', [req.client.id]);
  res.json({ success: true });
});

router.get('/comments', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM facebook_comments_log WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.client.id]
  );
  res.json(result.rows);
});

router.get('/reviews', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM facebook_reviews_log WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.client.id]
  );
  res.json(result.rows);
});

router.get('/conversations', authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT c.*,
       (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message,
       (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
     FROM conversations c
     WHERE c.client_id = $1 AND c.channel = 'facebook'
     ORDER BY c.updated_at DESC LIMIT 50`,
    [req.client.id]
  );
  res.json(result.rows);
});

module.exports = router;
