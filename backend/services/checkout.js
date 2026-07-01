const pool = require('../db');
const { buildCheckoutURL, getTNToken } = require('./tiendanube');

const PURCHASE_KEYWORDS = [
  'quiero comprar', 'lo compro', 'la compro', 'me lo llevo', 'me la llevo',
  'comprala', 'compralo', 'dale lo quiero', 'quiero esa', 'quiero ese',
  'quiero comprarla', 'quiero comprarlo', 'lo quiero', 'la quiero',
  'cerrar la compra', 'quiero pagar', 'como pago', 'cómo pago'
];

function hasPurchaseIntent(message) {
  const lower = message.toLowerCase();
  return PURCHASE_KEYWORDS.some(kw => lower.includes(kw));
}

async function getLastShownProduct(conversationId) {
  const result = await pool.query(
    `SELECT content FROM messages WHERE conversation_id = $1 AND role = 'system' AND content LIKE 'SHOWN_PRODUCT:%'
     ORDER BY timestamp DESC LIMIT 1`,
    [conversationId]
  );
  if (!result.rows.length) return null;
  try {
    return JSON.parse(result.rows[0].content.replace('SHOWN_PRODUCT:', ''));
  } catch {
    return null;
  }
}

async function rememberShownProduct(conversationId, product) {
  const variants = typeof product.variants === 'string'
    ? JSON.parse(product.variants || '[]')
    : (product.variants || []);

  await pool.query(
    'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
    [conversationId, 'system', `SHOWN_PRODUCT:${JSON.stringify({
      name: product.name,
      url: product.url,
      variants
    })}`]
  );
}

async function handlePurchaseConfirmation(clientId, message, conversationId) {
  if (!hasPurchaseIntent(message)) return { handled: false };

  const product = await getLastShownProduct(conversationId);
  if (!product) return { handled: false };

  const tnToken = await getTNToken(clientId);
  if (!tnToken) return { handled: false };

  if (product.variants.length > 1) {
    const lower = message.toLowerCase();
    const matchedVariant = product.variants.find(v =>
      v.values?.some(val => lower.includes(String(val).toLowerCase()))
    );

    if (!matchedVariant) {
      const opciones = product.variants
        .map(v => v.values?.join('/'))
        .filter(Boolean)
        .join(', ');
      return {
        handled: true,
        response: `¡Buenísimo! 🙌 *${product.name}* tiene varias opciones: ${opciones}. ¿Cuál preferís?`
      };
    }

    const checkoutUrl = buildCheckoutURL(tnToken.store_url, null, matchedVariant.id);
    return {
      handled: true,
      response: `¡Perfecto! 🛒 Te dejo el link para que completes la compra de *${product.name}* (${matchedVariant.values?.join('/')}):\n\n${checkoutUrl}\n\nCualquier duda durante el pago, escribime 😊`
    };
  }

  const variantId = product.variants[0]?.id;
  if (!variantId) return { handled: false };

  const checkoutUrl = buildCheckoutURL(tnToken.store_url, null, variantId);
  return {
    handled: true,
    response: `¡Perfecto! 🛒 Te dejo el link para que completes la compra de *${product.name}*:\n\n${checkoutUrl}\n\nCualquier duda durante el pago, escribime 😊`
  };
}

module.exports = { hasPurchaseIntent, rememberShownProduct, handlePurchaseConfirmation };
