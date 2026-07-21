const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { getInstagramOAuthURL, exchangeCodeForToken, getInstagramAccount } = require('../services/instagram');
const { encrypt } = require('../services/crypto');

router.get('/connect', authMiddleware, (req, res) => {
  const url = getInstagramOAuthURL(req.client.id);
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code, state: clientId } = req.query;

  if (!code || !clientId) {
    return res.redirect(`${process.env.FRONTEND_URL}/config?ig_error=missing_params`);
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const account = await getInstagramAccount(accessToken);
    const encryptedToken = encrypt(account.pageToken);

    // Suscribir la página a la app para que Meta mande los webhooks de IG
    const axios = require('axios');
    await axios.post(
      `https://graph.facebook.com/v21.0/${account.pageId}/subscribed_apps`,
      {},
      { params: { access_token: account.pageToken, subscribed_fields: 'messages,feed' } }
    ).catch(err => console.error('Error suscribiendo página IG:', err.response?.data || err.message));

    await pool.query(
      `INSERT INTO instagram_tokens (client_id, page_id, page_name, access_token, instagram_account_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_id) DO UPDATE SET
         page_id = $2, page_name = $3, access_token = $4,
         instagram_account_id = $5, active = true`,
      [clientId, account.pageId, account.pageName, encryptedToken, account.instagramAccountId]
    );

    res.redirect(`${process.env.FRONTEND_URL}/instagram?ig_connected=true&page=${account.pageName}`);
  } catch (err) {
    console.error('Error en callback Instagram:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/instagram?ig_error=auth_failed`);
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT page_id, page_name, instagram_account_id, active, created_at FROM instagram_tokens WHERE client_id = $1',
      [req.client.id]
    );
    if (!result.rows.length) {
      return res.json({ connected: false });
    }
    res.json({ connected: true, ...result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error verificando Instagram' });
  }
});

router.delete('/disconnect', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'UPDATE instagram_tokens SET active = false WHERE client_id = $1',
      [req.client.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error desconectando Instagram' });
  }
});

router.get('/comments', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM instagram_comments_log WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.client.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo comentarios' });
  }
});

router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
         (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message,
         (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
       FROM conversations c
       WHERE c.client_id = $1 AND c.channel = 'instagram'
       ORDER BY c.updated_at DESC LIMIT 50`,
      [req.client.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo conversaciones de Instagram' });
  }
});

module.exports = router;
