const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const {
  getMLOAuthURL, exchangeMLCode, getMLToken,
  getItemDetails, answerMLQuestion, sendMLOrderMessage, getMLSellerInfo
} = require('../services/mercadolibre');
const { getAIResponse } = require('../services/ai');
const { encrypt } = require('../services/crypto');

router.get('/connect', authMiddleware, (req, res) => {
  const url = getMLOAuthURL(req.client.id);
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code, state: clientId } = req.query;
  if (!code || !clientId) {
    return res.redirect(`${process.env.FRONTEND_URL}/mercadolibre?ml_error=missing`);
  }

  try {
    const tokenData = await exchangeMLCode(code);
    const { access_token, refresh_token, expires_in, user_id } = tokenData;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    const axios = require('axios');
    const userRes = await axios.get('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const nickname = userRes.data.nickname;

    await pool.query(
      `INSERT INTO mercadolibre_tokens (client_id, ml_user_id, seller_nickname, access_token, refresh_token, token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (client_id) DO UPDATE SET
         ml_user_id = $2, seller_nickname = $3, access_token = $4,
         refresh_token = $5, token_expires_at = $6, active = true`,
      [clientId, String(user_id), nickname, encrypt(access_token), encrypt(refresh_token), expiresAt]
    );

    res.redirect(`${process.env.FRONTEND_URL}/mercadolibre?ml_connected=true&seller=${nickname}`);
  } catch (err) {
    console.error('Error ML callback:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/mercadolibre?ml_error=auth_failed`);
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT ml_user_id, seller_nickname, active, created_at FROM mercadolibre_tokens WHERE client_id = $1',
    [req.client.id]
  );
  if (!result.rows.length) return res.json({ connected: false });
  res.json({ connected: true, ...result.rows[0] });
});

router.delete('/disconnect', authMiddleware, async (req, res) => {
  await pool.query(
    'UPDATE mercadolibre_tokens SET active = false WHERE client_id = $1',
    [req.client.id]
  );
  res.json({ success: true });
});

router.get('/log', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM mercadolibre_log WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.client.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo log de Mercado Libre' });
  }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const questionsThisWeek = await pool.query(
      `SELECT COUNT(*) FROM mercadolibre_log WHERE client_id = $1 AND type = 'question' AND created_at > NOW() - INTERVAL '7 days'`,
      [req.client.id]
    );
    const ordersThisWeek = await pool.query(
      `SELECT COUNT(*) FROM mercadolibre_log WHERE client_id = $1 AND type = 'order' AND created_at > NOW() - INTERVAL '7 days'`,
      [req.client.id]
    );
    const avgResponseTime = await pool.query(
      `SELECT AVG(response_time_ms) as avg_ms FROM mercadolibre_log WHERE client_id = $1 AND type = 'question' AND response_time_ms IS NOT NULL`,
      [req.client.id]
    );

    res.json({
      questions_this_week: parseInt(questionsThisWeek.rows[0].count),
      orders_this_week: parseInt(ordersThisWeek.rows[0].count),
      avg_response_seconds: avgResponseTime.rows[0].avg_ms
        ? (avgResponseTime.rows[0].avg_ms / 1000).toFixed(1)
        : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

router.post('/webhook/:clientId', async (req, res) => {
  res.sendStatus(200);

  const clientId = req.params.clientId;
  const { topic, resource } = req.body;

  try {
    const accessToken = await getMLToken(clientId);
    if (!accessToken) return;

    const clientResult = await pool.query(
      `SELECT c.*, bc.system_prompt, bc.business_info, bc.bot_name, bc.bot_tone
       FROM clients c JOIN bot_configs bc ON bc.client_id = c.id
       WHERE c.id = $1 AND c.active = true`,
      [clientId]
    );
    if (!clientResult.rows.length) return;
    const cfg = clientResult.rows[0];

    const axios = require('axios');

    if (topic === 'questions') {
      const startTime = Date.now();
      const questionId = resource.split('/').pop();
      const qRes = await axios.get(
        `https://api.mercadolibre.com/questions/${questionId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const question = qRes.data;

      if (question.status !== 'UNANSWERED') return;

      const itemData = await getItemDetails(question.item_id, accessToken);

      const itemContext = `
PUBLICACIÓN DE MERCADO LIBRE:
Título: ${itemData.title}
Precio: $${itemData.price} ${itemData.currency_id}
Stock disponible: ${itemData.available_quantity} unidades
Condición: ${itemData.condition === 'new' ? 'Nuevo' : 'Usado'}
Descripción: ${itemData.description?.plain_text?.substring(0, 500) || 'Sin descripción'}
Atributos: ${itemData.attributes?.slice(0, 5).map(a => `${a.name}: ${a.value_name}`).join(', ')}
      `;

      const aiMessages = [{ role: 'user', content: question.text }];
      const systemForML = `Sos vendedor en Mercado Libre. Respondé preguntas de compradores de forma precisa, breve y persuasiva.
REGLAS: Máximo 500 caracteres (límite de ML). No uses markdown. Sé directo. Si hay stock, confirmalo. Si el precio es competitivo, mencionalo.`;

      const answer = await getAIResponse(
        aiMessages, systemForML, cfg.business_info + '\n' + itemContext,
        '', cfg.bot_name, cfg.bot_tone
      );

      const trimmedAnswer = answer.substring(0, 1900);
      await answerMLQuestion(parseInt(questionId), trimmedAnswer, accessToken);

      await pool.query(
        `INSERT INTO mercadolibre_log (client_id, type, item_title, question_text, answer_text, response_time_ms)
         VALUES ($1, 'question', $2, $3, $4, $5)`,
        [clientId, itemData.title, question.text, trimmedAnswer, Date.now() - startTime]
      ).catch(err => console.error('Error guardando log ML:', err.message));

      console.log(`✅ ML: Pregunta ${questionId} respondida automáticamente`);
    }

    if (topic === 'orders_v2') {
      const orderId = resource.split('/').pop();
      const orderRes = await axios.get(
        `https://api.mercadolibre.com/orders/${orderId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const order = orderRes.data;

      if (order.status !== 'paid') return;

      const buyerName = order.buyer.first_name || 'cliente';
      const productName = order.order_items?.[0]?.item?.title || 'tu compra';
      const needsInvoice = order.order_items?.some(i => i.sale_fee > 0);

      const postSaleMsg = `¡Hola ${buyerName}! 🎉 Muchas gracias por tu compra de *${productName}*. Ya registramos tu pedido y lo estamos preparando con mucho cuidado.\n\n${needsInvoice ? '¿Necesitás factura A? Dejanos tus datos de facturación por este chat y te la enviamos.\n\n' : ''}Cualquier consulta estamos a disposición. ¡Gracias por elegirnos! 🙌`;

      await sendMLOrderMessage(orderId, order.buyer.id, postSaleMsg, accessToken);

      await pool.query(
        `INSERT INTO mercadolibre_log (client_id, type, item_title, answer_text, buyer_name, order_id)
         VALUES ($1, 'order', $2, $3, $4, $5)`,
        [clientId, productName, postSaleMsg, buyerName, String(orderId)]
      ).catch(err => console.error('Error guardando log ML:', err.message));

      console.log(`✅ ML: Mensaje post-venta enviado para orden ${orderId}`);
    }

  } catch (err) {
    console.error('❌ Error webhook ML:', err.message);
  }
});

module.exports = router;
