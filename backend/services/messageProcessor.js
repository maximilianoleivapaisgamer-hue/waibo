const pool = require('../db');
const { getAIResponse } = require('./ai');
const { handleBookingFlow } = require('./agenda');
const { handlePurchaseConfirmation, rememberShownProduct } = require('./checkout');
const { processMessageWithOrderDetection, saveConfirmedOrder } = require('./orders');
const { getResponseWithVariableExtraction, saveContactVariables } = require('./contactVariables');
const { getResponseWithScheduling, saveScheduledFollowup } = require('./scheduledFollowups');
const { isWithinBusinessHours } = require('./businessHours');
const { createAlert } = require('./alerts');
const { normalizePhone } = require('./phone');
const { searchProducts, getTNToken } = require('./tiendanube');

async function processIncomingMessage(clientId, customerPhoneRaw, customerName, rawMessage, sendFn) {
  const customerPhone = normalizePhone(customerPhoneRaw);

  const clientResult = await pool.query('SELECT * FROM clients WHERE id = $1 AND active = true', [clientId]);
  if (!clientResult.rows.length) return;
  const client = clientResult.rows[0];

  const configResult = await pool.query('SELECT * FROM bot_configs WHERE client_id = $1 AND active = true', [clientId]);
  if (!configResult.rows.length) return;
  const config = configResult.rows[0];

  if (!isWithinBusinessHours(config)) {
    let convResult = await pool.query(
      `SELECT * FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' ORDER BY created_at DESC LIMIT 1`,
      [clientId, customerPhone]
    );
    let conv = convResult.rows[0];
    if (!conv) {
      const newConv = await pool.query(
        `INSERT INTO conversations (client_id, customer_phone, customer_name, channel) VALUES ($1,$2,$3,'whatsapp') RETURNING *`,
        [clientId, customerPhone, customerName]
      );
      conv = newConv.rows[0];
    }
    if (conv.status !== 'human') {
      await sendFn(customerPhone, config.after_hours_message);
    }
    return;
  }

  const customerMessage = rawMessage;

  if (customerMessage.toLowerCase().includes(config.human_handoff_keyword.toLowerCase())) {
    const convForAlert = await pool.query(
      `SELECT id FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' ORDER BY created_at DESC LIMIT 1`,
      [clientId, customerPhone]
    );
    await pool.query(`UPDATE conversations SET status = 'human' WHERE client_id = $1 AND customer_phone = $2`, [clientId, customerPhone]);
    await sendFn(customerPhone, '¡Entendido! Te estoy conectando con una persona. En breve te atienden 👤');
    await createAlert(clientId, convForAlert.rows[0]?.id || null, 'human_requested', `${customerName} pidió hablar con una persona`);
    return;
  }

  let convResult = await pool.query(
    `SELECT * FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' ORDER BY created_at DESC LIMIT 1`,
    [clientId, customerPhone]
  );

  let conversation;
  if (!convResult.rows.length) {
    const pastHistory = await pool.query(
      `SELECT COUNT(*) FROM appointments WHERE client_id = $1 AND customer_phone = $2 AND status != 'cancelled'`,
      [clientId, customerPhone]
    );
    const isReturningCustomer = parseInt(pastHistory.rows[0].count) > 0;

    const newConv = await pool.query(
      `INSERT INTO conversations (client_id, customer_phone, customer_name, channel) VALUES ($1,$2,$3,'whatsapp') RETURNING *`,
      [clientId, customerPhone, customerName]
    );
    conversation = newConv.rows[0];

    const welcomeMsg = isReturningCustomer
      ? `¡Hola de nuevo, ${customerName}! 😊 Qué bueno verte por acá otra vez. ¿En qué puedo ayudarte hoy?`
      : config.welcome_message;
    await sendFn(customerPhone, welcomeMsg);
  } else {
    conversation = convResult.rows[0];
    if (conversation.status === 'human') return;
  }

  await pool.query('UPDATE conversations SET is_typing = true WHERE id = $1', [conversation.id]);

  try {
    const bookingResult = await handleBookingFlow(clientId, customerPhone, customerName, customerMessage, conversation.id);
    if (bookingResult.handled) {
      await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)', [conversation.id, 'user', customerMessage]);
      await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)', [conversation.id, 'assistant', bookingResult.response]);
      await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversation.id]);
      await sendFn(customerPhone, bookingResult.response);
      return;
    }

    const purchaseResult = await handlePurchaseConfirmation(clientId, customerMessage, conversation.id);
    if (purchaseResult.handled) {
      await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)', [conversation.id, 'user', customerMessage]);
      await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)', [conversation.id, 'assistant', purchaseResult.response]);
      await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversation.id]);
      await sendFn(customerPhone, purchaseResult.response);
      return;
    }

    await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)', [conversation.id, 'user', customerMessage]);

    const historyResult = await pool.query(
      `SELECT role, content FROM messages WHERE conversation_id = $1 AND role IN ('user','assistant') AND timestamp > NOW() - INTERVAL '24 hours' ORDER BY timestamp DESC LIMIT 10`,
      [conversation.id]
    );
    const history = historyResult.rows.reverse().map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    const kbResult = await pool.query('SELECT title, content FROM knowledge_base WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10', [clientId]);
    const knowledgeBase = kbResult.rows.map(k => `[${k.title}]: ${k.content}`).join('\n\n');

    let productContext = '';
    const tnConnected = await getTNToken(clientId);
    if (tnConnected) {
      const keywords = customerMessage.toLowerCase().match(/\\b\\w{4,}\\b/g) || [];
      for (const kw of keywords.slice(0, 3)) {
        const products = await searchProducts(clientId, kw);
        if (products.length) {
          productContext = '\nPRODUCTOS DISPONIBLES EN LA TIENDA:\n' + products.map(p => `- ${p.name}: $${p.price}`).join('\n');
          await rememberShownProduct(conversation.id, products[0]);
          break;
        }
      }
    }

    let aiResponse;
    try {
      if (config.orders_enabled) {
        const menuResult = await pool.query('SELECT name, price, description, category FROM menu_items WHERE client_id = $1 AND available = true ORDER BY category, name', [clientId]);
        const menuText = menuResult.rows.map(m => `- ${m.name}: $${m.price}${m.description ? ` (${m.description})` : ''}`).join('\n');
        const result = await processMessageWithOrderDetection(history, config.system_prompt, menuText, config.ai_model);
        aiResponse = result.textResponse;
        if (result.orderData) {
          await saveConfirmedOrder(clientId, conversation.id, customerName, customerPhone, result.orderData);
          await pool.query(`UPDATE conversations SET tags = array_append(tags, 'Pedido Confirmado') WHERE id = $1 AND NOT ('Pedido Confirmado' = ANY(tags))`, [conversation.id]);
          await createAlert(clientId, conversation.id, 'new_order', `🍕 Nuevo pedido de ${customerName}: ${result.orderData.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}`);
        }
      } else if (config.variables_enabled) {
        const result = await getResponseWithVariableExtraction(
          history, config.system_prompt, config.business_info + productContext,
          knowledgeBase, config.bot_name, config.bot_tone, config.ai_model
        );
        aiResponse = result.textResponse || 'Decime en qué puedo ayudarte 😊';
        if (result.savedVariables.length) {
          await saveContactVariables(clientId, customerPhone, result.savedVariables);
        }
      } else if (config.smart_scheduling_enabled) {
        const result = await getResponseWithScheduling(
          history, config.system_prompt, config.business_info + productContext,
          knowledgeBase, config.bot_name, config.bot_tone, config.ai_model
        );
        aiResponse = result.textResponse || 'Decime en qué puedo ayudarte 😊';
        if (result.scheduledFollowup) {
          await saveScheduledFollowup(clientId, conversation.id, customerPhone, 'whatsapp', null, result.scheduledFollowup);
        }
      } else {
        aiResponse = await getAIResponse(history, config.system_prompt, config.business_info + productContext, knowledgeBase, config.bot_name, config.bot_tone, config.ai_model);
      }
    } catch (aiErr) {
      await createAlert(clientId, conversation.id, 'ai_failed', `El bot no pudo responder a ${customerName}: "${customerMessage.substring(0, 100)}"`);
      aiResponse = 'Disculpá, estoy teniendo un problema técnico en este momento. Ya le avisamos al equipo 🙏';
    }

    await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)', [conversation.id, 'assistant', aiResponse]);
    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversation.id]);
    await sendFn(customerPhone, aiResponse);
  } finally {
    await pool.query('UPDATE conversations SET is_typing = false WHERE id = $1', [conversation.id]);
  }
}

module.exports = { processIncomingMessage };
