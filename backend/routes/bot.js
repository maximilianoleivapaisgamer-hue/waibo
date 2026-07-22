const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { sendWhatsAppMessage } = require('../services/whatsapp');
const { sendInstagramDM } = require('../services/instagram');
const { sendMessengerMessage } = require('../services/facebook');
const { sendTikTokDM, getTikTokToken } = require('../services/tiktok');
const { decrypt } = require('../services/crypto');
const { getActiveAlerts, resolveAlert } = require('../services/alerts');
const { getContactVariables } = require('../services/contactVariables');
const { getAIResponse } = require('../services/ai');

router.get('/config', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM bot_configs WHERE client_id = $1',
      [req.client.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

router.put('/config', authMiddleware, async (req, res) => {
  const {
    system_prompt, business_info, welcome_message, human_handoff_keyword, language, ai_model,
    business_hours_enabled, business_hours_start, business_hours_end, business_hours_days, after_hours_message,
    followup_enabled, followup_wait_minutes, followup_max_attempts, followup_message,
    owner_notifications_enabled, owner_notification_phone,
    variables_enabled, smart_scheduling_enabled,
    bot_tone, bot_tone_custom,
    instagram_comment_keywords, ig_comment_ai_reply, ig_comment_reply_all, ig_comment_public_reply,
    payment_enabled, payment_alias, payment_cbu, payment_mp_link, payment_holder
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE bot_configs SET
        system_prompt = COALESCE($1, system_prompt),
        business_info = COALESCE($2, business_info),
        welcome_message = COALESCE($3, welcome_message),
        human_handoff_keyword = COALESCE($4, human_handoff_keyword),
        language = COALESCE($5, language),
        ai_model = COALESCE($6, ai_model),
        business_hours_enabled = COALESCE($7, business_hours_enabled),
        business_hours_start = COALESCE($8, business_hours_start),
        business_hours_end = COALESCE($9, business_hours_end),
        business_hours_days = COALESCE($10, business_hours_days),
        after_hours_message = COALESCE($11, after_hours_message),
        followup_enabled = COALESCE($12, followup_enabled),
        followup_wait_minutes = COALESCE($13, followup_wait_minutes),
        followup_max_attempts = COALESCE($14, followup_max_attempts),
        followup_message = COALESCE($15, followup_message),
        owner_notifications_enabled = COALESCE($16, owner_notifications_enabled),
        owner_notification_phone = COALESCE($17, owner_notification_phone),
        variables_enabled = COALESCE($18, variables_enabled),
        smart_scheduling_enabled = COALESCE($19, smart_scheduling_enabled),
        bot_tone = COALESCE($20, bot_tone),
        bot_tone_custom = $21,
        instagram_comment_keywords = COALESCE($23, instagram_comment_keywords),
        ig_comment_ai_reply = COALESCE($24, ig_comment_ai_reply),
        ig_comment_reply_all = COALESCE($25, ig_comment_reply_all),
        ig_comment_public_reply = $26,
        payment_enabled = COALESCE($27, payment_enabled),
        payment_alias = $28,
        payment_cbu = $29,
        payment_mp_link = $30,
        payment_holder = $31,
        updated_at = NOW()
       WHERE client_id = $22
       RETURNING *`,
      [
        system_prompt, business_info, welcome_message, human_handoff_keyword, language, ai_model,
        business_hours_enabled, business_hours_start, business_hours_end, business_hours_days, after_hours_message,
        followup_enabled, followup_wait_minutes, followup_max_attempts, followup_message,
        owner_notifications_enabled, owner_notification_phone,
        variables_enabled, smart_scheduling_enabled,
        bot_tone, bot_tone_custom ?? null,
        req.client.id,
        instagram_comment_keywords, ig_comment_ai_reply, ig_comment_reply_all, ig_comment_public_reply ?? null,
        payment_enabled, payment_alias ?? null, payment_cbu ?? null, payment_mp_link ?? null, payment_holder ?? null
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const totalConversations = await pool.query(
      'SELECT COUNT(*) FROM conversations WHERE client_id = $1',
      [req.client.id]
    );

    const todayConversations = await pool.query(
      `SELECT COUNT(*) FROM conversations
       WHERE client_id = $1 AND DATE(created_at) = CURRENT_DATE`,
      [req.client.id]
    );

    const totalMessages = await pool.query(
      `SELECT COUNT(*) FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.client_id = $1`,
      [req.client.id]
    );

    const activeConversations = await pool.query(
      `SELECT COUNT(*) FROM conversations
       WHERE client_id = $1 AND status = 'bot'`,
      [req.client.id]
    );

    const activeAlerts = await pool.query(
      'SELECT COUNT(*) FROM alerts WHERE client_id = $1 AND resolved = false',
      [req.client.id]
    );

    res.json({
      total_conversations: parseInt(totalConversations.rows[0].count),
      today_conversations: parseInt(todayConversations.rows[0].count),
      total_messages: parseInt(totalMessages.rows[0].count),
      active_conversations: parseInt(activeConversations.rows[0].count),
      active_alerts: parseInt(activeAlerts.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
       FROM conversations c
       WHERE c.client_id = $1
       ORDER BY c.updated_at DESC
       LIMIT 300`,
      [req.client.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener conversaciones' });
  }
});

router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  try {
    const conv = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND client_id = $2',
      [req.params.id, req.client.id]
    );
    if (conv.rows.length === 0) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    const messages = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY timestamp ASC',
      [req.params.id]
    );
    res.json(messages.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

router.put('/conversations/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body;

  if (!['bot', 'human'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido. Debe ser "bot" o "human"' });
  }

  try {
    const result = await pool.query(
      `UPDATE conversations SET status = $1, updated_at = NOW()
       WHERE id = $2 AND client_id = $3
       RETURNING *`,
      [status, req.params.id, req.client.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando estado de la conversación' });
  }
});

router.put('/conversations/:id/funnel', authMiddleware, async (req, res) => {
  const VALID_STAGES = ['nuevo', 'interesado', 'turno_agendado', 'cerrado', 'perdido'];
  const { stage } = req.body;
  if (!VALID_STAGES.includes(stage)) return res.status(400).json({ error: 'Etapa inválida' });
  try {
    const result = await pool.query(
      `UPDATE conversations SET funnel_stage = $1, funnel_updated_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND client_id = $3 RETURNING *`,
      [stage, req.params.id, req.client.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Conversación no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando etapa' });
  }
});

router.put('/conversations/:id/tags', authMiddleware, async (req, res) => {
  const { tags } = req.body;

  if (!Array.isArray(tags)) {
    return res.status(400).json({ error: 'tags debe ser un array de strings' });
  }

  const cleanTags = [...new Set(tags.map(t => String(t).trim()).filter(Boolean))].slice(0, 10);

  try {
    const result = await pool.query(
      `UPDATE conversations SET tags = $1, updated_at = NOW()
       WHERE id = $2 AND client_id = $3
       RETURNING *`,
      [cleanTags, req.params.id, req.client.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando tags' });
  }
});

router.get('/conversations/:id/variables', authMiddleware, async (req, res) => {
  try {
    const convResult = await pool.query(
      'SELECT customer_phone FROM conversations WHERE id = $1 AND client_id = $2',
      [req.params.id, req.client.id]
    );
    if (!convResult.rows.length) return res.status(404).json({ error: 'Conversación no encontrada' });

    const variables = await getContactVariables(req.client.id, convResult.rows[0].customer_phone);
    res.json(variables);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo datos del contacto' });
  }
});

router.post('/conversations/:id/send', authMiddleware, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  }

  try {
    const convResult = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND client_id = $2',
      [req.params.id, req.client.id]
    );
    if (!convResult.rows.length) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    const conversation = convResult.rows[0];

    if (conversation.channel === 'whatsapp') {
      const clientResult = await pool.query('SELECT whatsapp_api_key, whatsapp_provider, whatsapp_phone_id, whatsapp_mode FROM clients WHERE id = $1', [req.client.id]);
      const cr = clientResult.rows[0] || {};
      if (cr.whatsapp_mode === 'qr') {
        const QR_SERVICE_URL = process.env.QR_SERVICE_URL;
        const SERVICE_SECRET = process.env.QR_SERVICE_SECRET || 'whabot_qr_secret_2024';
        if (!QR_SERVICE_URL) return res.status(400).json({ error: 'Servicio QR no disponible' });
        const axios = require('axios');
        await axios.post(`${QR_SERVICE_URL}/session/${req.client.id}/send`,
          { to: conversation.customer_phone, message, secret: SERVICE_SECRET },
          { headers: { 'x-service-secret': SERVICE_SECRET, 'Content-Type': 'application/json' } }
        );
      } else {
        if (!cr.whatsapp_api_key) return res.status(400).json({ error: 'WhatsApp no está configurado para este negocio' });
        await sendWhatsAppMessage(conversation.customer_phone, message, cr.whatsapp_api_key, { provider: cr.whatsapp_provider || '360dialog', phoneNumberId: cr.whatsapp_phone_id });
      }

    } else if (conversation.channel === 'instagram') {
      const igResult = await pool.query('SELECT access_token FROM instagram_tokens WHERE client_id = $1 AND active = true', [req.client.id]);
      if (!igResult.rows.length) return res.status(400).json({ error: 'Instagram no está conectado' });
      const igToken = decrypt(igResult.rows[0].access_token);
      await sendInstagramDM(conversation.channel_user_id, message, igToken);

    } else if (conversation.channel === 'facebook') {
      const fbResult = await pool.query('SELECT access_token FROM facebook_tokens WHERE client_id = $1 AND active = true', [req.client.id]);
      if (!fbResult.rows.length) return res.status(400).json({ error: 'Facebook no está conectado' });
      const fbToken = decrypt(fbResult.rows[0].access_token);
      await sendMessengerMessage(conversation.channel_user_id, message, fbToken);

    } else if (conversation.channel === 'tiktok') {
      const ttTokenRow = await pool.query('SELECT tiktok_open_id FROM tiktok_tokens WHERE client_id = $1 AND active = true', [req.client.id]);
      if (!ttTokenRow.rows.length) return res.status(400).json({ error: 'TikTok no está conectado' });
      const accessToken = await getTikTokToken(req.client.id);
      if (!accessToken) return res.status(400).json({ error: 'TikTok necesita reconexión' });
      await sendTikTokDM(conversation.channel_user_id, message, accessToken, ttTokenRow.rows[0].tiktok_open_id);

    } else {
      return res.status(400).json({ error: `Envío manual no soportado para el canal "${conversation.channel}"` });
    }

    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversation.id, 'assistant', message]
    );

    const updated = await pool.query(
      `UPDATE conversations SET status = 'human', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [conversation.id]
    );

    res.json({ success: true, conversation: updated.rows[0] });
  } catch (err) {
    console.error('Error enviando mensaje manual:', err.message);
    res.status(500).json({ error: 'Error enviando el mensaje. Verificá que el canal esté bien conectado.' });
  }
});

router.get('/alerts', authMiddleware, async (req, res) => {
  try {
    const alerts = await getActiveAlerts(req.client.id);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo alertas' });
  }
});

router.put('/alerts/:id/resolve', authMiddleware, async (req, res) => {
  try {
    await resolveAlert(req.params.id, req.client.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error resolviendo alerta' });
  }
});

router.get('/onboarding', authMiddleware, async (req, res) => {
  try {
    const clientId = req.client.id;

    const [clientRow, configRow, kbCount, hasAnyConversation] = await Promise.all([
      pool.query('SELECT whatsapp_api_key FROM clients WHERE id = $1', [clientId]),
      pool.query('SELECT business_info, welcome_message, has_tested_bot FROM bot_configs WHERE client_id = $1', [clientId]),
      pool.query('SELECT COUNT(*) FROM knowledge_base WHERE client_id = $1', [clientId]),
      pool.query('SELECT COUNT(*) FROM conversations WHERE client_id = $1', [clientId]),
    ]);

    const steps = [
      {
        key: 'whatsapp',
        label: 'Conectá tu WhatsApp',
        done: !!clientRow.rows[0]?.whatsapp_api_key,
        href: '/channels'
      },
      {
        key: 'business_info',
        label: 'Contale a tu bot sobre tu negocio',
        done: !!(configRow.rows[0]?.business_info && configRow.rows[0].business_info.trim().length > 20),
        href: '/config'
      },
      {
        key: 'knowledge',
        label: 'Agregá información a la base de conocimiento',
        done: parseInt(kbCount.rows[0].count) > 0,
        href: '/knowledge'
      },
      {
        key: 'test',
        label: 'Probá tu bot en el Modo prueba',
        done: !!configRow.rows[0]?.has_tested_bot,
        href: '/test-chat'
      },
      {
        key: 'first_conversation',
        label: 'Recibí tu primera conversación real',
        done: parseInt(hasAnyConversation.rows[0].count) > 0,
        href: '/conversations'
      },
    ];

    const completedCount = steps.filter(s => s.done).length;

    res.json({
      steps,
      completed_count: completedCount,
      total_count: steps.length,
      all_done: completedCount === steps.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Error calculando el estado de onboarding' });
  }
});

// ─── Onboarding IA ────────────────────────────────────────────────────────────
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ONBOARDING_AI_SYSTEM = `Sos el asistente de configuración de Waibo, una plataforma de chatbots de IA para negocios argentinos (PyMEs).

Tu objetivo es configurar el bot del cliente haciéndole preguntas conversacionales, de a una por vez. El cliente te va a presentar con su nombre en el primer mensaje — usá ese nombre para saludarlo personalmente. Seguí este orden natural:

1. Saludá al cliente por su nombre y preguntá el nombre del negocio y a qué se dedica
2. Preguntá si tiene página web, redes sociales o algún link con más info del negocio (si tiene, usá esa info para enriquecer el perfil)
3. Preguntá qué productos o servicios ofrece y cuáles son los más consultados o vendidos
4. Preguntá qué querés que haga el bot: responder consultas, agendar turnos, tomar pedidos, ayudar a vender (puede ser varias)
5. Preguntá en qué plataformas le escriben sus clientes: WhatsApp, Instagram, TikTok, Mercado Libre, Tiendanube, Google Calendar
6. Preguntá cómo quiere que hable el bot: formal, amigable o como vendedor activo
7. Preguntá si atiende en horarios específicos y cuáles son
8. Preguntá si tiene alguna instrucción especial para el bot (preguntas frecuentes, cosas que no debe decir, promociones vigentes, etc.)

Cuando tengas toda esa información, generá la configuración con este bloque exacto al final de tu mensaje:

<CONFIG>
{"business_name":"nombre","rubro":"gastronomia|salud|comercio|servicios|educacion|inmobiliaria|otro","business_description":"3-4 oraciones sobre el negocio incluyendo productos/servicios clave","website":"url o vacio","bot_tasks":["consultas","turnos","pedidos","ventas"],"platforms":["whatsapp","instagram","tiktok","mercadolibre","tiendanube","google"],"bot_tone":"formal|amigable|vendedor","business_hours_enabled":true,"business_hours_start":"09:00","business_hours_end":"18:00","business_hours_days":["lunes","martes","miercoles","jueves","viernes"],"system_prompt":"Sos el asistente virtual de [nombre]. [descripción detallada con productos/servicios]. Respondés consultas de manera [tono]. [instrucciones específicas para el rubro, tareas e instrucciones especiales del dueño]."}
</CONFIG>

Antes del bloque CONFIG escribí un mensaje amigable de 2-3 líneas resumiendo lo que configuraste.

Reglas importantes:
- Español rioplatense, una sola pregunta a la vez, conciso y cercano
- NO uses markdown: nada de asteriscos, negritas, guiones como listas, ni ningún símbolo de formato. Solo texto plano.
- Si el cliente comparte una URL, imaginá que ya la revisaste y pedile que te cuente los puntos clave del negocio igual.
- El system_prompt final debe ser rico y detallado, incluyendo toda la info recopilada.`;

router.post('/onboarding-ai', authMiddleware, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages requerido' });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: ONBOARDING_AI_SYSTEM,
      messages,
    });

    const text = response.content[0].text;
    const configMatch = text.match(/<CONFIG>([\s\S]*?)<\/CONFIG>/);
    let config = null;
    let message = text.replace(/<CONFIG>[\s\S]*?<\/CONFIG>/, '').trim();

    if (configMatch) {
      try { config = JSON.parse(configMatch[1].trim()); } catch(e) {}
    }

    res.json({ message, config });
  } catch (err) {
    console.error('[onboarding-ai]', err.message);
    res.status(500).json({ error: 'Error generando configuración' });
  }
});

router.post('/onboarding-save', authMiddleware, async (req, res) => {
  try {
    const {
      business_name, business_description, bot_tasks = [], platforms = [],
      bot_tone, business_hours_enabled, business_hours_start, business_hours_end,
      business_hours_days = [], system_prompt
    } = req.body;
    const clientId = req.client.id;

    await pool.query('UPDATE clients SET business_name = $1, onboarding_completed = true, onboarding_platforms = $2 WHERE id = $3',
      [business_name, platforms, clientId]);

    const toHour = (val, def) => {
      if (!val) return def;
      if (typeof val === 'number') return val;
      const parts = String(val).split(':');
      return parseInt(parts[0], 10) || def;
    };

    await pool.query(`UPDATE bot_configs SET
        business_info = $1, system_prompt = $2, bot_tone = $3,
        agenda_enabled = $4, orders_enabled = $5,
        business_hours_enabled = $6, business_hours_start = $7,
        business_hours_end = $8, business_hours_days = $9
      WHERE client_id = $10`,
      [
        business_description, system_prompt, bot_tone || 'amigable',
        bot_tasks.includes('turnos'), bot_tasks.includes('pedidos'),
        business_hours_enabled || false,
        toHour(business_hours_start, 9), toHour(business_hours_end, 18),
        business_hours_days, clientId
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[onboarding-save]', err.message);
    res.status(500).json({ error: 'Error guardando configuración' });
  }
});

router.get('/trial', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT trial_ends_at, plan, created_at FROM clients WHERE id = $1',
      [req.client.id]
    );
    const { trial_ends_at, plan, created_at } = result.rows[0] || {};

    const hasPaidPlan = plan && !['trial', 'basico', null].includes(plan) &&
      (await pool.query("SELECT status FROM billing WHERE client_id = $1 AND status = 'active'", [req.client.id])).rows.length > 0;

    if (hasPaidPlan) return res.json({ in_trial: false });

    const now = new Date();
    // Si no tiene trial_ends_at, calculamos 14 días desde created_at
    const ends = trial_ends_at
      ? new Date(trial_ends_at)
      : new Date(new Date(created_at).getTime() + 14 * 24 * 60 * 60 * 1000);

    const daysLeft = Math.ceil((ends - now) / (1000 * 60 * 60 * 24));

    res.json({
      in_trial: true,
      trial_ends_at: ends.toISOString(),
      days_left: Math.max(0, daysLeft),
      expired: daysLeft <= 0,
      ending_soon: daysLeft > 0 && daysLeft <= 5,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo estado de prueba' });
  }
});

router.get('/export/messages', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         m.role, m.content, m.timestamp,
         c.customer_name, c.customer_phone, c.channel, c.status as conversation_status
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.client_id = $1 AND m.role IN ('user', 'assistant')
       ORDER BY m.timestamp DESC
       LIMIT 5000`,
      [req.client.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error exportando mensajes' });
  }
});

router.post('/test-chat', authMiddleware, async (req, res) => {
  const { message, history } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  }

  try {
    const configResult = await pool.query('SELECT * FROM bot_configs WHERE client_id = $1', [req.client.id]);
    if (!configResult.rows.length) {
      return res.status(404).json({ error: 'Configuración del bot no encontrada' });
    }
    const config = configResult.rows[0];

    const kbResult = await pool.query(
      'SELECT title, content FROM knowledge_base WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10',
      [req.client.id]
    );
    const knowledgeBase = kbResult.rows.map(k => `[${k.title}]: ${k.content}`).join('\n\n');

    const conversationHistory = [...(history || []), { role: 'user', content: message }].slice(-10);

    let aiResponse;
    try {
      aiResponse = await getAIResponse(
        conversationHistory, config.system_prompt, config.business_info,
        knowledgeBase, config.bot_name, config.bot_tone, config.ai_model
      );
    } catch (aiErr) {
      return res.status(502).json({ error: 'El bot no pudo responder (error de la IA). Probá de nuevo en unos segundos.' });
    }

    if (!config.has_tested_bot) {
      await pool.query('UPDATE bot_configs SET has_tested_bot = true WHERE client_id = $1', [req.client.id]);
    }

    res.json({ response: aiResponse });
  } catch (err) {
    console.error('Error en test-chat:', err.message);
    res.status(500).json({ error: 'Error procesando el mensaje de prueba' });
  }
});

// ─────────────────────────────────────────
// APRENDER DEL HISTORIAL DE CHATS
// El cliente sube sus chats exportados de WhatsApp; la IA extrae el
// estilo de conversación (→ bot_tone_custom) y la información concreta
// como precios y respuestas frecuentes (→ knowledge_base).
// ─────────────────────────────────────────

const LEARN_SYSTEM = `Sos un analista experto en conversaciones de negocios. Vas a recibir chats reales exportados de WhatsApp entre un negocio y sus clientes.

Tu tarea es analizar cómo responde EL NEGOCIO (no los clientes) y devolver SOLO un JSON válido con esta estructura exacta, sin texto adicional:

{
  "style": "Descripción detallada del estilo de comunicación del negocio para que un bot lo imite: tono (formal/informal, voseo), saludos y despedidas típicas, uso de emojis, largo de las respuestas, muletillas o frases características, cómo presentan los precios, cómo manejan objeciones y cómo cierran ventas. Incluí 3-5 frases de ejemplo textuales que usa el negocio.",
  "knowledge": [
    { "title": "Título corto del tema (ej: Precios de cursos)", "content": "La información concreta extraída: precios, horarios, formas de pago, políticas, respuestas a preguntas frecuentes, etc. Solo información que el negocio afirmó explícitamente en los chats." }
  ]
}

Reglas:
- En "knowledge" creá entre 1 y 8 entradas, agrupadas por tema.
- NO inventes información: solo lo que aparece en los chats.
- Si un precio aparece varias veces con valores distintos, usá el más reciente y aclaralo.
- Escribí todo en español rioplatense.`;

router.post('/learn-from-chats', authMiddleware, async (req, res) => {
  try {
    const { chats, from_history } = req.body;

    let source = chats;

    if (from_history) {
      // Analizar las conversaciones ya guardadas en Waibo (ej: importadas por QR)
      const msgsRes = await pool.query(
        `SELECT c.customer_name, c.customer_phone, m.role, m.content, m.timestamp
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE c.client_id = $1
         ORDER BY c.id, m.timestamp
         LIMIT 5000`,
        [req.client.id]
      );
      if (msgsRes.rows.length < 10) {
        return res.status(400).json({ error: 'Todavía no hay suficientes conversaciones guardadas en Waibo. Conectá WhatsApp Lite (QR) para importar tu historial, o subí chats exportados.' });
      }
      let lastConv = null;
      const lines = [];
      for (const m of msgsRes.rows) {
        const convKey = m.customer_phone;
        if (convKey !== lastConv) {
          lines.push(`\n=== Chat con ${m.customer_name || m.customer_phone} ===`);
          lastConv = convKey;
        }
        lines.push(`${m.role === 'user' ? 'Cliente' : 'Negocio'}: ${m.content}`);
      }
      source = lines.join('\n');
    }

    if (!source || typeof source !== 'string' || source.trim().length < 100) {
      return res.status(400).json({ error: 'Subí al menos un chat exportado con contenido.' });
    }

    // Limitar tamaño: nos quedamos con lo más reciente (final del archivo)
    const MAX_CHARS = 150000;
    const text = source.length > MAX_CHARS ? source.slice(-MAX_CHARS) : source;

    const { callClaudeAPI } = require('../services/ai');
    const raw = await callClaudeAPI({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      system: LEARN_SYSTEM,
      messages: [{ role: 'user', content: `Chats exportados:\n\n${text}` }]
    });

    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      return res.status(502).json({ error: 'La IA no pudo analizar los chats. Probá con menos archivos o intentá de nuevo.' });
    }

    let knowledgeSaved = 0;
    if (parsed.style) {
      await pool.query(
        'UPDATE bot_configs SET bot_tone_custom = $1 WHERE client_id = $2',
        [parsed.style, req.client.id]
      );
    }
    for (const item of parsed.knowledge || []) {
      if (!item.title || !item.content) continue;
      await pool.query(
        `INSERT INTO knowledge_base (client_id, type, title, content) VALUES ($1, 'text', $2, $3)`,
        [req.client.id, `📚 ${item.title} (aprendido de tus chats)`, item.content]
      );
      knowledgeSaved++;
    }

    res.json({
      ok: true,
      style_saved: !!parsed.style,
      style_preview: parsed.style ? parsed.style.slice(0, 300) : null,
      knowledge_saved: knowledgeSaved
    });
  } catch (err) {
    console.error('[learn-from-chats]', err.response?.data || err.message);
    res.status(500).json({ error: 'Error analizando los chats. Intentá de nuevo.' });
  }
});

module.exports = router;
