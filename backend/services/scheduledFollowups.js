const axios = require('axios');
const pool = require('../db');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const SCHEDULE_FOLLOWUP_TOOL = {
  name: 'programar_recordatorio',
  description: 'Usar SOLO cuando el cliente pide explícitamente ser contactado en un momento futuro específico (ej: "contactame el lunes", "llamame en 15 días", "escribime la semana que viene"). No usar para charla genérica ni para confirmar turnos de agenda (eso ya lo maneja otro sistema).',
  input_schema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Fecha calculada en formato YYYY-MM-DD, basada en la fecha de hoy que se te indica en el contexto'
      },
      reason: {
        type: 'string',
        description: 'Breve motivo del recordatorio, en base a lo que el cliente pidió (ej: "quería que le confirme precio del paquete de cumpleaños")'
      }
    },
    required: ['date', 'reason']
  }
};

async function getResponseWithScheduling(messages, systemPrompt, businessInfo, knowledgeBase, botName, botTone, aiModel) {
  const today = new Date().toISOString().split('T')[0];
  const toneInstructions = {
    amigable: 'Usá un tono amigable, cálido y cercano. Usá voseo argentino.',
    profesional: 'Usá un tono profesional y formal, pero sin ser frío.',
    vendedor: 'Sos un vendedor experto, persuasivo y enfocado en el cierre. Rebatí objeciones con seguridad.',
    casual: 'Sé muy casual y relajado, como si hablaras con un amigo. Podés usar emojis con frecuencia.',
  };
  const tone = toneInstructions[botTone] || toneInstructions.amigable;

  const fullSystem = `Sos ${botName}, el asistente virtual del negocio.
HOY ES: ${today}

PERSONALIDAD Y TONO:
${tone}

INFORMACIÓN DEL NEGOCIO:
${businessInfo}

${knowledgeBase ? `BASE DE CONOCIMIENTOS:\n${knowledgeBase}\n\n` : ''}INSTRUCCIONES:
- Respondé siempre en el mismo idioma en que te escriben
- Sé conciso, con emojis estratégicos y *negritas* para resaltar info importante
- Si el cliente pide ser contactado en una fecha futura específica, usá programar_recordatorio con la fecha calculada (basándote en HOY ES: ${today}) y confirmale que vas a retomar contacto ese día
- No inventes información sobre el negocio`;

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: aiModel || DEFAULT_MODEL,
      max_tokens: 500,
      system: fullSystem,
      messages,
      tools: [SCHEDULE_FOLLOWUP_TOOL]
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
  const toolBlock = content.find(b => b.type === 'tool_use' && b.name === 'programar_recordatorio');

  return {
    textResponse: textBlock?.text || '',
    scheduledFollowup: toolBlock ? toolBlock.input : null
  };
}

async function saveScheduledFollowup(clientId, conversationId, customerPhone, channel, channelUserId, followupData) {
  await pool.query(
    `INSERT INTO scheduled_followups (client_id, conversation_id, customer_phone, channel, channel_user_id, scheduled_for, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [clientId, conversationId, customerPhone, channel, channelUserId, `${followupData.date} 10:00:00`, followupData.reason]
  );
}

async function getPendingFollowups() {
  const result = await pool.query(
    `SELECT * FROM scheduled_followups WHERE status = 'pending' AND scheduled_for <= NOW()`
  );
  return result.rows;
}

async function markFollowupSent(id) {
  await pool.query(`UPDATE scheduled_followups SET status = 'sent' WHERE id = $1`, [id]);
}

module.exports = { getResponseWithScheduling, saveScheduledFollowup, getPendingFollowups, markFollowupSent };
