const express = require('express');
const router = express.Router();
const pool = require('../db');
const { sendWhatsAppMessage } = require('../services/whatsapp');
const { downloadAndTranscribe } = require('../services/voice');
const { sendInstagramDM, replyToComment } = require('../services/instagram');
const { sendMessengerMessage, replyToFacebookComment } = require('../services/facebook');
const { getAIResponse } = require('../services/ai');
const { isWithinBusinessHours } = require('../services/businessHours');
const { createAlert } = require('../services/alerts');
const { decrypt } = require('../services/crypto');
const { processIncomingMessage } = require('../services/messageProcessor');

// ─────────────────────────────────────────
// CLOUD API WEBHOOK (global — rutea por phone_number_id)
// Meta envía todos los eventos a esta URL única configurada en Meta Developer Console.
// ─────────────────────────────────────────

router.get('/whatsapp/cloud', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post('/whatsapp/cloud', async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    const value = body.entry?.[0]?.changes?.[0]?.value;
    const messageData = value?.messages?.[0];
    if (!messageData) return;

    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!phoneNumberId) return;

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE whatsapp_phone_id = $1 AND active = true',
      [phoneNumberId]
    );
    if (!clientResult.rows.length) return;
    const client = clientResult.rows[0];

    const configResult = await pool.query(
      'SELECT * FROM bot_configs WHERE client_id = $1 AND active = true',
      [client.id]
    );
    if (!configResult.rows.length) return;

    const customerPhone = messageData.from;
    const customerName = value?.contacts?.[0]?.profile?.name || 'Cliente';

    let customerMessage = '';
    if (messageData.type === 'text') {
      customerMessage = messageData.text.body;
    } else if (messageData.type === 'audio') {
      const config = configResult.rows[0];
      if (!config.voice_enabled) return;
      const axios = require('axios');
      const audioId = messageData.audio.id;
      const mediaRes = await axios.get(
        `https://graph.facebook.com/v18.0/${audioId}`,
        { headers: { Authorization: `Bearer ${client.whatsapp_api_key}` } }
      );
      const transcript = await downloadAndTranscribe(
        mediaRes.data.url,
        `Bearer ${client.whatsapp_api_key}`
      );
      if (!transcript) {
        await sendWhatsAppMessage(customerPhone, 'No pude entender el audio. ¿Podés escribirme?', client.whatsapp_api_key, { provider: 'cloud_api', phoneNumberId: client.whatsapp_phone_id });
        return;
      }
      customerMessage = `[Audio transcripto]: ${transcript}`;
    } else {
      return;
    }

    const sendFn = (phone, message) => sendWhatsAppMessage(phone, message, client.whatsapp_api_key, { provider: 'cloud_api', phoneNumberId: client.whatsapp_phone_id });
    await processIncomingMessage(client.id, customerPhone, customerName, customerMessage, sendFn);

  } catch (err) {
    console.error('❌ Error webhook Cloud API:', err.message);
  }
});

// ─────────────────────────────────────────
// WHATSAPP WEBHOOK (oficial, 360dialog)
// Usa messageProcessor.js — la misma lógica que también usa el modo QR.
// ─────────────────────────────────────────

router.get('/whatsapp/:clientId', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post('/whatsapp/:clientId', async (req, res) => {
  res.sendStatus(200);
  try {
    const clientId = req.params.clientId;
    const body = req.body;

    const messageData = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const value = body.entry?.[0]?.changes?.[0]?.value;
    if (!messageData) return;

    const customerPhone = messageData.from;
    const customerName = value?.contacts?.[0]?.profile?.name || 'Cliente';

    const clientResult = await pool.query('SELECT * FROM clients WHERE id = $1 AND active = true', [clientId]);
    if (!clientResult.rows.length) return;
    const client = clientResult.rows[0];

    const configResult = await pool.query('SELECT * FROM bot_configs WHERE client_id = $1 AND active = true', [clientId]);
    if (!configResult.rows.length) return;
    const config = configResult.rows[0];

    let customerMessage = '';

    if (messageData.type === 'text') {
      customerMessage = messageData.text.body;
    } else if (messageData.type === 'audio' && config.voice_enabled) {
      const axios = require('axios');
      const audioId = messageData.audio.id;
      const mediaRes = await axios.get(
        `https://graph.facebook.com/v18.0/${audioId}`,
        { headers: { Authorization: `Bearer ${client.whatsapp_api_key}` } }
      );
      const transcript = await downloadAndTranscribe(
        mediaRes.data.url,
        `Bearer ${client.whatsapp_api_key}`
      );
      if (!transcript) {
        await sendWhatsAppMessage(customerPhone, 'No pude entender el audio. ¿Podés escribirme?', client.whatsapp_api_key, { provider: client.whatsapp_provider || '360dialog', phoneNumberId: client.whatsapp_phone_id });
        return;
      }
      customerMessage = `[Audio transcripto]: ${transcript}`;
    } else {
      return;
    }

    const sendFn = (phone, message) => sendWhatsAppMessage(phone, message, client.whatsapp_api_key, { provider: client.whatsapp_provider || '360dialog', phoneNumberId: client.whatsapp_phone_id });
    await processIncomingMessage(clientId, customerPhone, customerName, customerMessage, sendFn);

  } catch (err) {
    console.error('❌ Error webhook WhatsApp:', err.message);
  }
});

// ─────────────────────────────────────────
// INSTAGRAM WEBHOOK
// ─────────────────────────────────────────

router.get('/instagram/:clientId', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post('/instagram/:clientId', async (req, res) => {
  res.sendStatus(200);
  try {
    const clientId = req.params.clientId;
    const body = req.body;

    const clientResult = await pool.query(
      `SELECT c.*, bc.system_prompt, bc.business_info, bc.welcome_message, bc.human_handoff_keyword,
              bc.bot_name, bc.bot_tone, bc.ai_model, bc.instagram_comment_keywords,
              bc.ig_comment_ai_reply, bc.ig_comment_reply_all, bc.ig_comment_public_reply,
              bc.bot_tone_custom,
              it.access_token as ig_token
       FROM clients c JOIN bot_configs bc ON bc.client_id = c.id
       LEFT JOIN instagram_tokens it ON it.client_id = c.id
       WHERE c.id = $1 AND c.active = true`,
      [clientId]
    );
    if (!clientResult.rows.length) return;
    const cfg = clientResult.rows[0];
    if (!cfg.ig_token) return;
    if (!isWithinBusinessHours(cfg)) return;

    const igTokenDecrypted = decrypt(cfg.ig_token);

    for (const entry of body.entry || []) {
      for (const msg of entry.messaging || []) {
        if (!msg.message?.text) continue;
        const senderId = msg.sender.id;
        const messageText = msg.message.text;

        let convResult = await pool.query(
          `SELECT * FROM conversations WHERE client_id = $1 AND channel_user_id = $2 AND channel = 'instagram' ORDER BY created_at DESC LIMIT 1`,
          [clientId, senderId]
        );

        let conversation;
        if (!convResult.rows.length) {
          const newConv = await pool.query(
            `INSERT INTO conversations (client_id, customer_phone, channel_user_id, customer_name, channel)
             VALUES ($1, $2, $3, 'Usuario Instagram', 'instagram') RETURNING *`,
            [clientId, senderId, senderId]
          );
          conversation = newConv.rows[0];
          await sendInstagramDM(senderId, cfg.welcome_message, igTokenDecrypted);
        } else {
          conversation = convResult.rows[0];
          if (conversation.status === 'human') continue;
        }

        if (messageText.toLowerCase().includes(cfg.human_handoff_keyword)) {
          await pool.query('UPDATE conversations SET status = $1 WHERE id = $2', ['human', conversation.id]);
          await sendInstagramDM(senderId, 'Te conecto con una persona ahora 👤', igTokenDecrypted);
          await createAlert(clientId, conversation.id, 'human_requested', `Usuario de Instagram pidió hablar con una persona`);
          continue;
        }

        await pool.query('UPDATE conversations SET is_typing = true WHERE id = $1', [conversation.id]);

        try {
          await pool.query(
            'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
            [conversation.id, 'user', messageText]
          );

          const historyResult = await pool.query(
            `SELECT role, content FROM messages
             WHERE conversation_id = $1 AND role IN ('user', 'assistant') AND timestamp > NOW() - INTERVAL '24 hours'
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

          let aiResponse;
          try {
            aiResponse = await getAIResponse(
              history, cfg.system_prompt, cfg.business_info,
              knowledgeBase, cfg.bot_name, cfg.bot_tone, cfg.ai_model
            );
          } catch (aiErr) {
            await createAlert(clientId, conversation.id, 'ai_failed', `El bot no pudo responder un DM de Instagram: "${messageText.substring(0, 100)}"`);
            aiResponse = 'Disculpá, estoy teniendo un problema técnico. Ya le avisamos al equipo 🙏';
          }

          await pool.query(
            'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
            [conversation.id, 'assistant', aiResponse]
          );
          await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversation.id]);
          await sendInstagramDM(senderId, aiResponse, igTokenDecrypted);
        } finally {
          await pool.query('UPDATE conversations SET is_typing = false WHERE id = $1', [conversation.id]);
        }
      }

      for (const change of entry.changes || []) {
        if (change.field !== 'comments') continue;
        const comment = change.value;
        if (!comment?.text || comment.from?.id === cfg.ig_account_id) continue;

        const commentText = comment.text.toLowerCase();
        const keywords = (cfg.instagram_comment_keywords || 'precio,info,cuanto,quiero,disponible')
          .split(',').map(k => k.trim().toLowerCase());
        const hasKeyword = keywords.some(kw => commentText.includes(kw));

        const replyAll = cfg.ig_comment_reply_all === true;
        if (!hasKeyword && !replyAll) continue;

        const kbResult = await pool.query(
          'SELECT title, content FROM knowledge_base WHERE client_id = $1 ORDER BY created_at DESC LIMIT 5',
          [clientId]
        );
        const knowledgeBase = kbResult.rows.map(k => `[${k.title}]: ${k.content}`).join('\n\n');

        let publicReply;
        let dmMessage;

        if (cfg.ig_comment_ai_reply !== false) {
          const postContext = comment.media?.caption ? `Post: "${comment.media.caption.substring(0, 200)}"` : '';
          try {
            publicReply = await getAIResponse(
              [{ role: 'user', content: `Alguien comentó en Instagram: "${comment.text}". ${postContext} Respondé el comentario de forma muy breve (máximo 2 oraciones), amable, e invitalo a mandarte un mensaje privado para más info.` }],
              cfg.system_prompt, cfg.business_info, knowledgeBase, cfg.bot_name, cfg.bot_tone, cfg.ai_model, cfg.bot_tone_custom
            );
            // Instagram limita respuestas públicas a ~1000 chars, cortamos en 500 por seguridad
            if (publicReply.length > 500) publicReply = publicReply.substring(0, 497) + '...';
          } catch {
            publicReply = cfg.ig_comment_public_reply || `¡Hola! Qué bueno que te interese 😊 Te mandamos toda la info al privado 🚀`;
          }

          try {
            dmMessage = await getAIResponse(
              [{ role: 'user', content: comment.text }],
              cfg.system_prompt, cfg.business_info, knowledgeBase, cfg.bot_name, cfg.bot_tone, cfg.ai_model, cfg.bot_tone_custom
            );
          } catch {
            dmMessage = `¡Hola! Vi tu consulta en nuestro post 👋\n\nSoy ${cfg.bot_name || 'el asistente'} de *${cfg.business_name}*. ¿En qué puedo ayudarte?`;
          }
        } else {
          publicReply = cfg.ig_comment_public_reply || `¡Hola! Qué bueno que te interese 😊 Te mandamos toda la info al privado 🚀`;
          dmMessage = `¡Hola! Vi tu consulta en nuestro post 👋\n\nSoy ${cfg.bot_name || 'el asistente'} de *${cfg.business_name}*. ¿En qué puedo ayudarte?`;
        }

        await replyToComment(comment.id, publicReply, igTokenDecrypted).catch(() => {});
        await sendInstagramDM(comment.from.id, dmMessage, igTokenDecrypted).catch(() => {});

        await pool.query(
          `INSERT INTO instagram_comments_log (client_id, commenter_username, comment_text, post_caption, public_reply, dm_sent)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [clientId, comment.from?.username || comment.from?.id || 'Usuario', comment.text,
           comment.media?.caption?.substring(0, 200) || '', publicReply, dmMessage]
        ).catch(err => console.error('Error guardando log de comentario IG:', err.message));
      }
    }
  } catch (err) {
    console.error('❌ Error webhook Instagram:', err.message);
  }
});

// ─────────────────────────────────────────
// FACEBOOK WEBHOOK (Messenger + comentarios + reseñas)
// ─────────────────────────────────────────

router.get('/facebook/:clientId', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post('/facebook/:clientId', async (req, res) => {
  res.sendStatus(200);
  try {
    const clientId = req.params.clientId;
    const body = req.body;

    const clientResult = await pool.query(
      `SELECT c.*, bc.system_prompt, bc.business_info, bc.welcome_message, bc.human_handoff_keyword,
              bc.bot_name, bc.bot_tone, bc.ai_model, bc.facebook_comment_keywords,
              ft.access_token as fb_token
       FROM clients c JOIN bot_configs bc ON bc.client_id = c.id
       LEFT JOIN facebook_tokens ft ON ft.client_id = c.id
       WHERE c.id = $1 AND c.active = true`,
      [clientId]
    );
    if (!clientResult.rows.length) return;
    const cfg = clientResult.rows[0];
    if (!cfg.fb_token) return;
    if (!isWithinBusinessHours(cfg)) return;

    const fbTokenDecrypted = decrypt(cfg.fb_token);

    for (const entry of body.entry || []) {
      for (const msg of entry.messaging || []) {
        if (!msg.message?.text) continue;
        const senderId = msg.sender.id;
        const messageText = msg.message.text;

        let convResult = await pool.query(
          `SELECT * FROM conversations WHERE client_id = $1 AND channel_user_id = $2 AND channel = 'facebook' ORDER BY created_at DESC LIMIT 1`,
          [clientId, senderId]
        );

        let conversation;
        if (!convResult.rows.length) {
          const newConv = await pool.query(
            `INSERT INTO conversations (client_id, customer_phone, channel_user_id, customer_name, channel)
             VALUES ($1, $2, $3, 'Usuario Facebook', 'facebook') RETURNING *`,
            [clientId, senderId, senderId]
          );
          conversation = newConv.rows[0];
          await sendMessengerMessage(senderId, cfg.welcome_message, fbTokenDecrypted);
        } else {
          conversation = convResult.rows[0];
          if (conversation.status === 'human') continue;
        }

        if (messageText.toLowerCase().includes(cfg.human_handoff_keyword)) {
          await pool.query('UPDATE conversations SET status = $1 WHERE id = $2', ['human', conversation.id]);
          await sendMessengerMessage(senderId, 'Te conecto con una persona ahora 👤', fbTokenDecrypted);
          await createAlert(clientId, conversation.id, 'human_requested', `Usuario de Facebook pidió hablar con una persona`);
          continue;
        }

        await pool.query('UPDATE conversations SET is_typing = true WHERE id = $1', [conversation.id]);

        try {
          await pool.query(
            'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
            [conversation.id, 'user', messageText]
          );

          const historyResult = await pool.query(
            `SELECT role, content FROM messages
             WHERE conversation_id = $1 AND role IN ('user', 'assistant') AND timestamp > NOW() - INTERVAL '24 hours'
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

          let aiResponse;
          try {
            aiResponse = await getAIResponse(
              history, cfg.system_prompt, cfg.business_info,
              knowledgeBase, cfg.bot_name, cfg.bot_tone, cfg.ai_model
            );
          } catch (aiErr) {
            await createAlert(clientId, conversation.id, 'ai_failed', `El bot no pudo responder un mensaje de Facebook: "${messageText.substring(0, 100)}"`);
            aiResponse = 'Disculpá, estoy teniendo un problema técnico. Ya le avisamos al equipo 🙏';
          }

          await pool.query(
            'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
            [conversation.id, 'assistant', aiResponse]
          );
          await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversation.id]);
          await sendMessengerMessage(senderId, aiResponse, fbTokenDecrypted);
        } finally {
          await pool.query('UPDATE conversations SET is_typing = false WHERE id = $1', [conversation.id]);
        }
      }

      for (const change of entry.changes || []) {
        if (change.field !== 'feed' || change.value?.item !== 'comment') continue;
        const comment = change.value;
        if (!comment?.message || comment.from?.id === cfg.fb_page_id) continue;

        const commentText = comment.message.toLowerCase();
        const keywords = (cfg.facebook_comment_keywords || 'precio,info,cuanto,quiero,disponible')
          .split(',').map(k => k.trim().toLowerCase());
        if (!keywords.some(kw => commentText.includes(kw))) continue;

        const publicReply = `¡Hola! Qué bueno que te interese 😊 Te mandamos toda la info al privado 🚀`;
        await replyToFacebookComment(comment.comment_id, publicReply, fbTokenDecrypted).catch(() => {});

        const dmMessage = `¡Hola! Vi tu consulta en nuestra publicación 👋\n\nSoy ${cfg.bot_name || 'el asistente'} de *${cfg.business_name}*. ¿En qué puedo ayudarte?`;
        await sendMessengerMessage(comment.from.id, dmMessage, fbTokenDecrypted).catch(() => {});

        await pool.query(
          `INSERT INTO facebook_comments_log (client_id, commenter_name, comment_text, post_caption, public_reply, dm_sent)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [clientId, comment.from?.name || 'Usuario', comment.message, '', publicReply, dmMessage]
        ).catch(err => console.error('Error guardando log comentario FB:', err.message));
      }

      for (const change of entry.changes || []) {
        if (change.field !== 'ratings') continue;
        const review = change.value;

        let replyMsg = null;
        const isNegative = review.recommendation_type === 'negative' || (review.rating && review.rating <= 3);

        if (isNegative) {
          await createAlert(clientId, null, 'negative_review', `Nueva reseña negativa en Facebook de ${review.reviewer_name || 'un cliente'}: "${review.review_text || ''}"`);
        } else {
          replyMsg = '¡Muchas gracias por tu reseña! 🙌 Nos alegra que hayas tenido una buena experiencia.';
        }

        await pool.query(
          `INSERT INTO facebook_reviews_log (client_id, reviewer_name, rating, review_text, reply_sent)
           VALUES ($1, $2, $3, $4, $5)`,
          [clientId, review.reviewer_name || 'Usuario', review.rating || null, review.review_text || '', replyMsg]
        ).catch(err => console.error('Error guardando log review FB:', err.message));
      }
    }
  } catch (err) {
    console.error('❌ Error webhook Facebook:', err.message);
  }
});

module.exports = router;
