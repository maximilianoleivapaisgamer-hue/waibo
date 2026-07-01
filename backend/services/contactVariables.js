const axios = require('axios');
const pool = require('../db');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const SAVE_VARIABLE_TOOL = {
  name: 'guardar_dato_cliente',
  description: 'Usar cuando el cliente menciona un dato concreto y reutilizable sobre sí mismo o su consulta — por ejemplo presupuesto, zona/barrio, fecha de interés, cantidad de personas/invitados, talle, color preferido, o cualquier dato similar que sirva para no tener que volver a preguntarlo después. NO usar para charla genérica sin datos concretos.',
  input_schema: {
    type: 'object',
    properties: {
      field_name: {
        type: 'string',
        description: 'Nombre corto del campo en minúsculas y sin espacios, ej: "presupuesto", "zona", "fecha_evento", "cantidad_invitados", "talle"'
      },
      field_value: {
        type: 'string',
        description: 'El valor detectado, tal como lo dijo el cliente (ej: "$50000", "Palermo", "15 personas")'
      }
    },
    required: ['field_name', 'field_value']
  }
};

async function getResponseWithVariableExtraction(messages, systemPrompt, businessInfo, knowledgeBase, botName, botTone, aiModel) {
  const toneInstructions = {
    amigable: 'Usá un tono amigable, cálido y cercano. Usá voseo argentino.',
    profesional: 'Usá un tono profesional y formal, pero sin ser frío.',
    vendedor: 'Sos un vendedor experto, persuasivo y enfocado en el cierre. Rebatí objeciones con seguridad.',
    casual: 'Sé muy casual y relajado, como si hablaras con un amigo. Podés usar emojis con frecuencia.',
  };
  const tone = toneInstructions[botTone] || toneInstructions.amigable;

  const fullSystem = `Sos ${botName}, el asistente virtual del negocio.

PERSONALIDAD Y TONO:
${tone}

INFORMACIÓN DEL NEGOCIO:
${businessInfo}

${knowledgeBase ? `BASE DE CONOCIMIENTOS:\n${knowledgeBase}\n\n` : ''}INSTRUCCIONES:
- Respondé siempre en el mismo idioma en que te escriben
- Sé conciso (máximo 3 párrafos), con emojis estratégicos y *negritas* para resaltar info importante
- Si detectás un dato concreto y reutilizable del cliente (presupuesto, zona, fecha, cantidad, talle, etc.), usá la herramienta guardar_dato_cliente para registrarlo, ADEMÁS de responder normalmente al cliente
- No inventes información sobre el negocio`;

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: aiModel || DEFAULT_MODEL,
      max_tokens: 500,
      system: fullSystem,
      messages,
      tools: [SAVE_VARIABLE_TOOL]
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
  const toolBlocks = content.filter(b => b.type === 'tool_use' && b.name === 'guardar_dato_cliente');

  return {
    textResponse: textBlock?.text || '',
    savedVariables: toolBlocks.map(b => b.input)
  };
}

async function saveContactVariables(clientId, customerPhone, variables) {
  for (const v of variables) {
    await pool.query(
      `INSERT INTO contact_variables (client_id, customer_phone, field_name, field_value, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (client_id, customer_phone, field_name)
       DO UPDATE SET field_value = $4, updated_at = NOW()`,
      [clientId, customerPhone, v.field_name.toLowerCase().trim(), v.field_value]
    );
  }
}

async function getContactVariables(clientId, customerPhone) {
  const result = await pool.query(
    'SELECT field_name, field_value, updated_at FROM contact_variables WHERE client_id = $1 AND customer_phone = $2 ORDER BY updated_at DESC',
    [clientId, customerPhone]
  );
  return result.rows;
}

module.exports = { getResponseWithVariableExtraction, saveContactVariables, getContactVariables };
