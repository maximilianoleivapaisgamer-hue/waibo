const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const {
  getTikTokOAuthURL,
  exchangeTikTokCode,
  getTikTokToken,
  getTikTokUserInfo,
  sendTikTokDM,
  registerTikTokWebhook
} = require('../services/tiktok');
const { getAIResponse } = require('../services/ai');
const { handleBookingFlow } = require('../services/agenda');
const { encrypt } = require('../services/crypto');
const { isWithinBusinessHours } = require('../services/businessHours');
const { createAlert } = require('../services/alerts');

router.get('/connect', authMiddleware, (req, res) => {
  const url = getTikTokOAuthURL(req.client.id);
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code, state: clientId, error } = req.query;

  if (error || !code || !clientId) {
    return res.redirect(`${process.env.FRONTEND_URL}/channels?tt_error=auth_failed`);
  }

  try {
    const tokenData = await exchangeTikTokCode(code);

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    const refreshExpiresAt = new Date(Date.now() + (tokenData.refresh_expires_in || 30 * 24 * 3600) * 1000);

    const userInfo = await getTikTokUserInfo(tokenData.access_token, tokenData.open_id);

    await pool.query(
      `INSERT INTO tiktok_tokens
         (client_id, tiktok_open_id, tiktok_display_name, tiktok_avatar_url,
          access_token, refresh_token, token_expires_at, refresh_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (client_id) DO UPDATE SET
         tiktok_open_id = $2, tiktok_display_name = $3, tiktok_avatar_url = $4,
         access_token = $5, refresh_token = $6,
         token_expires_at = $7, refresh_expires_at = $8, active = true`,
      [
        clientId,
        tokenData.open_id,
        userInfo.display_name || 'Usuario TikTok',
        userInfo.avatar_url || '',
        encrypt(tokenData.access_token),
        encrypt(tokenData.refresh_token),
        expiresAt,
        refreshExpiresAt
      ]
    );

    const webhookUrl = `${process.env.APP_URL}/webhook/tiktok/${clientId}`;
    await registerTikTokWebhook(tokenData.access_token, tokenData.open_id, webhookUrl);

    const displayName = userInfo.display_name || 'tu cuenta';
    res.redirect(`${process.env.FRONTEND_URL}/channels?tt_connected=true&user=${encodeURIComponent(displayName)}`);
  } catch (err) {
    console.error('Error TikTok callback:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/channels?tt_error=auth_failed`);
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT tiktok_open_id, tiktok_display_name, tiktok_avatar_url,
            active, created_at, token_expires_at, refresh_expires_at
     FROM tiktok_tokens WHERE client_id = $1`,
    [req.client.id]
  );

  if (!result.rows.length || !result.rows[0].active) {
    return res.json({ connected: false });
  }

  const token = result.rows[0];
  const refreshExpired = token.refresh_expires_at && new Date(token.refresh_expires_at) < new Date();

  res.json({
    connected: !refreshExpired,
    needs_reconnect: refreshExpired,
    display_name: token.tiktok_display_name,
    avatar_url: token.tiktok_avatar_url,
    created_at: token.created_at
  });
});

router.delete('/disconnect', authMiddleware, async (req, res) => {
  await pool.query(
    'UPDATE tiktok_tokens SET active = false WHERE client_id = $1',
    [req.client.id]
  );
  res.json({ success: true });
});

router.get('/webhook/:clientId', (req, res) => {
  const challenge = req.query.challenge;
  if (challenge) return res.send(challenge);
  res.sendStatus(200);
});

router.post('/webhook/:clientId', async (req, res) => {
  res.sendStatus(200);

  const clientId = req.params.clientId;
  const body = req.body;

  try {
    if (body.event !== 'direct_message' && body.type !== 'message') return;

    const message = body.data || body.message;
    if (!message) return;

    const senderOpenId = message.sender_open_id || message.from_user_id;
    const messageText = message.content?.text || message.message_text;

    if (!senderOpenId || !messageText) return;

    const tokenResult = await pool.query(
      'SELECT * FROM tiktok_tokens WHERE client_id = $1 AND active = true',
      [clientId]
    );
    if (!tokenResult.rows.length) return;
    const ttToken = tokenResult.rows[0];
    if (senderOpenId === ttToken.tiktok_open_id) return;

    const clientResult = await pool.query(
      `SELECT c.*, bc.system_prompt, bc.business_info, bc.welcome_message,
              bc.human_handoff_keyword, bc.bot_name, bc.bot_tone, bc.ai_model
       FROM clients c JOIN bot_configs bc ON bc.client_id = c.id
       WHERE c.id = $1 AND c.active = true`,
      [clientId]
    );
    if (!clientResult.rows.length) return;
    const cfg = clientResult.rows[0];
    if (!isWithinBusinessHours(cfg)) return;

    const accessToken = await getTikTokToken(clientId);
    if (!accessToken) return;

    if (messageText.toLowerCase().includes(cfg.human_handoff_keyword?.toLowerCase())) {
      await pool.query(
        `UPDATE conversations SET status = 'human'
         WHERE client_id = $1 AND channel_user_id = $2 AND channel = 'tiktok'`,
        [clientId, senderOpenId]
      );
      await sendTikTokDM(
        senderOpenId,
        '¡Entendido! Te conecto con una persona ahora 👤',
        accessToken,
        ttToken.tiktok_open_id
      );

      const convForAlert = await pool.query(
        `SELECT id FROM conversations WHERE client_id = $1 AND channel_user_id = $2 AND channel = 'tiktok' ORDER BY created_at DESC LIMIT 1`,
        [clientId, senderOpenId]
      );
      await createAlert(clientId, convForAlert.rows[0]?.id || null, 'human_requested', `Usuario de TikTok pidió hablar con una persona`);
      return;
    }

    let convResult = await pool.query(
      `SELECT * FROM conversations
       WHERE client_id = $1 AND channel_user_id = $2 AND channel = 'tiktok'
       ORDER BY created_at DESC LIMIT 1`,
      [clientId, senderOpenId]
    );

    let conversation;
    if (!convResult.rows.length) {
      const newConv = await pool.query(
        `INSERT INTO conversations
           (client_id, customer_phone, channel_user_id, customer_name, channel)
         VALUES ($1, $2, $3, 'Usuario TikTok', 'tiktok') RETURNING *`,
        [clientId, senderOpenId, senderOpenId]
      );
      conversation = newConv.rows[0];

      await sendTikTokDM(
        senderOpenId,
        cfg.welcome_message || '¡Hola! ¿En qué puedo ayudarte?',
        accessToken,
        ttToken.tiktok_open_id
      );
    } else {
      conversation = convResult.rows[0];
      if (conversation.status === 'human') return;
    }

    await pool.query('UPDATE conversations SET is_typing = true WHERE id = $1', [conversation.id]);

    try {
      const bookingResult = await handleBookingFlow(
        clientId, senderOpenId, 'Usuario TikTok', messageText, conversation.id
      );

      if (bookingResult.handled) {
        await pool.query(
          'INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)',
          [conversation.id, 'user', messageText]
        );
        await pool.query(
          'INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)',
          [conversation.id, 'assistant', bookingResult.response]
        );
        await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversation.id]);
        await sendTikTokDM(senderOpenId, bookingResult.response, accessToken, ttToken.tiktok_open_id);
        return;
      }

      await pool.query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)',
        [conversation.id, 'user', messageText]
      );

      const historyResult = await pool.query(
        `SELECT role, content FROM messages
         WHERE conversation_id = $1 AND role IN ('user','assistant') AND timestamp > NOW() - INTERVAL '24 hours'
         ORDER BY timestamp DESC LIMIT 10`,
        [conversation.id]
      );
      const history = historyResult.rows.reverse().map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }));

      const kbResult = await pool.query(
        'SELECT title, content FROM knowledge_base WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10',
        [clientId]
      );
      const knowledgeBase = kbResult.rows.map(k => `[${k.title}]: ${k.content}`).join('\n\n');

      const tiktokSystemNote = '\nIMPORTANTE: Estás respondiendo por TikTok. Sé muy conciso (máximo 3 líneas). TikTok tiene ventana de 48hs para responder.';

      let aiResponse;
      try {
        aiResponse = await getAIResponse(
          history,
          cfg.system_prompt + tiktokSystemNote,
          cfg.business_info,
          knowledgeBase,
          cfg.bot_name,
          cfg.bot_tone,
          cfg.ai_model
        );
      } catch (aiErr) {
        await createAlert(clientId, conversation.id, 'ai_failed', `El bot no pudo responder un DM de TikTok: "${messageText.substring(0, 100)}"`);
        aiResponse = 'Disculpá, estoy teniendo un problema técnico. Ya le avisamos al equipo 🙏';
      }

      await pool.query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)',
        [conversation.id, 'assistant', aiResponse]
      );
      await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversation.id]);

      await sendTikTokDM(senderOpenId, aiResponse, accessToken, ttToken.tiktok_open_id);

      console.log(`✅ TikTok DM respondido a ${senderOpenId}`);
    } finally {
      await pool.query('UPDATE conversations SET is_typing = false WHERE id = $1', [conversation.id]);
    }
  } catch (err) {
    console.error('❌ Error webhook TikTok:', err.message);
  }
});

router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
         (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message,
         (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
       FROM conversations c
       WHERE c.client_id = $1 AND c.channel = 'tiktok'
       ORDER BY c.updated_at DESC LIMIT 50`,
      [req.client.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo conversaciones TikTok' });
  }
});

module.exports = router;
