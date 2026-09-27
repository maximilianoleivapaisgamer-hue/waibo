const axios = require('axios');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 800;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(err) {
  if (!err.response) return true;
  const status = err.response.status;
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 529;
}

// options.timeout: las respuestas del bot tienen que ser rápidas (15 s), pero tareas
// largas como analizar el historial de chats necesitan minutos.
async function callClaudeAPI(payload, options = {}) {
  const timeout = options.timeout || 15000;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        payload,
        {
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          timeout
        }
      );
      return response.data.content[0].text;
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === maxRetries) break;
      console.warn(`⚠️ Claude API falló (intento ${attempt + 1}/${maxRetries + 1}), reintentando...`, err.response?.status || err.message);
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  console.error('Error con Claude API tras reintentos:', lastError.response?.data || lastError.message);
  throw lastError;
}

const DEFAULT_TONE_INSTRUCTIONS = {
  'amigable': 'Usá un tono amigable, cálido y cercano. Usá voseo argentino.',
  'profesional': 'Usá un tono profesional y formal, pero sin ser frío.',
  'vendedor': 'Sos un vendedor experto, persuasivo y enfocado en el cierre. Rebatí objeciones con seguridad.',
  'casual': 'Sé muy casual y relajado, como si hablaras con un amigo. Podés usar emojis con frecuencia.',
};

async function getAIResponse(messages, systemPrompt, businessInfo, knowledgeBase = '', botName = 'Asistente', botTone = 'amigable', aiModel = null, botToneCustom = null) {
  const tone = botToneCustom || DEFAULT_TONE_INSTRUCTIONS[botTone] || DEFAULT_TONE_INSTRUCTIONS['amigable'];

  const fullSystem = `Tu nombre es ${botName}. Atendés los mensajes de los clientes del negocio. Si te presentás, decí tu nombre tal cual (ej: "Soy ${botName}").

PERSONALIDAD Y TONO:
${tone}

${systemPrompt ? `INSTRUCCIONES DEL NEGOCIO (seguilas siempre):
${systemPrompt}

` : ''}INFORMACIÓN DEL NEGOCIO:
${businessInfo}

${knowledgeBase ? `BASE DE CONOCIMIENTOS (usá esta info para responder):
${knowledgeBase}

` : ''}INSTRUCCIONES IMPORTANTES:
- Respondé siempre en el mismo idioma en que te escriben
- Sé conciso pero completo (máximo 3 párrafos)
- Usá emojis estratégicamente para hacer el texto más legible
- Resaltá la info importante (precio, horarios, etc) con negrita: usá *un solo asterisco* para las negritas (formato de WhatsApp), nunca **doble**
- Si te preguntan algo que no sabés, decilo claramente y ofrecé ayuda alternativa
- No inventes información sobre el negocio
- Si el cliente parece enojado o tiene un problema grave, empatizá y ofrecé derivarlo a una persona real`;

  const modelToUse = aiModel || DEFAULT_MODEL;

  const text = await callClaudeAPI({
    model: modelToUse,
    max_tokens: 500,
    system: fullSystem,
    messages: messages
  });
  return toWhatsAppFormat(text);
}

// WhatsApp marca la negrita con un asterisco; el modelo a veces escribe **doble** (markdown)
// y el cliente vería los asteriscos.
function toWhatsAppFormat(text) {
  return String(text || '').replace(/\*\*([^*\n]+?)\*\*/g, '*$1*');
}

module.exports = { getAIResponse, callClaudeAPI, toWhatsAppFormat };
