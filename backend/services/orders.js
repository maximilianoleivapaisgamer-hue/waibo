const axios = require('axios');
const pool = require('../db');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const CONFIRM_ORDER_TOOL = {
  name: 'confirmar_pedido',
  description: 'Usar SOLO cuando el cliente confirmó explícitamente que quiere cerrar su pedido completo (dijo algo como "eso es todo", "confirmo", "dale así está bien"). No usar si todavía está agregando o consultando ítems, ni si solo preguntó precios sin confirmar.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Lista de productos pedidos, con cantidad exacta',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nombre del producto tal como aparece en el menú' },
            quantity: { type: 'integer', description: 'Cantidad pedida' }
          },
          required: ['name', 'quantity']
        }
      },
      delivery_type: {
        type: 'string',
        enum: ['retiro', 'delivery'],
        description: 'Si el cliente va a retirar en el local o pide envío a domicilio'
      },
      delivery_address: {
        type: 'string',
        description: 'Dirección de entrega, solo si delivery_type es "delivery". Vacío si es retiro.'
      },
      notes: {
        type: 'string',
        description: 'Cualquier aclaración especial del pedido (ej: "sin cebolla", "para las 21hs")'
      }
    },
    required: ['items', 'delivery_type']
  }
};

async function processMessageWithOrderDetection(messages, systemPrompt, menuText, aiModel) {
  const fullSystem = `${systemPrompt}

MENÚ DISPONIBLE:
${menuText}

INSTRUCCIONES PARA PEDIDOS:
- Ayudá al cliente a armar su pedido conversando naturalmente.
- Cuando el cliente CONFIRME que su pedido está completo (no antes), usá la herramienta confirmar_pedido con los datos exactos.
- Si pide delivery, preguntá la dirección antes de confirmar.
- Si algún ítem que pide no está en el menú, avisale y sugerí alternativas — no lo incluyas en confirmar_pedido.`;

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: aiModel || DEFAULT_MODEL,
      max_tokens: 500,
      system: fullSystem,
      messages,
      tools: [CONFIRM_ORDER_TOOL]
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 15000
    }
  );

  const content = response.data.content;
  const textBlock = content.find(b => b.type === 'text');
  const toolBlock = content.find(b => b.type === 'tool_use' && b.name === 'confirmar_pedido');

  return {
    textResponse: textBlock?.text || '¡Listo! Ya registramos tu pedido 🙌',
    orderData: toolBlock ? toolBlock.input : null
  };
}

async function saveConfirmedOrder(clientId, conversationId, customerName, customerPhone, orderData) {
  const menuResult = await pool.query(
    'SELECT name, price FROM menu_items WHERE client_id = $1 AND available = true',
    [clientId]
  );
  const menuByName = new Map(menuResult.rows.map(m => [m.name.toLowerCase(), m]));

  const itemsWithPrice = orderData.items.map(item => {
    const menuItem = menuByName.get(item.name.toLowerCase());
    return {
      name: item.name,
      quantity: item.quantity,
      unit_price: menuItem?.price || null,
      subtotal: menuItem ? menuItem.price * item.quantity : null
    };
  });

  const total = itemsWithPrice.reduce((sum, i) => sum + (i.subtotal || 0), 0);

  const result = await pool.query(
    `INSERT INTO orders (client_id, conversation_id, customer_name, customer_phone, items, total, delivery_type, delivery_address, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      clientId, conversationId, customerName, customerPhone,
      JSON.stringify(itemsWithPrice), total,
      orderData.delivery_type || 'retiro', orderData.delivery_address || null, orderData.notes || null
    ]
  );

  return result.rows[0];
}

module.exports = { processMessageWithOrderDetection, saveConfirmedOrder };
