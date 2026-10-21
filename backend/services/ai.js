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
// AI_PROVIDER=max: la respuesta la escribe el runner del VPS con Claude Max (cola ai_jobs,
// ver routes/aiRunner.js). Si el runner no contesta a tiempo se cae a la API paga.
async function viaRunner(payload, esperaMs) {
  const pool = require('../db');
  const r = await pool.query(`INSERT INTO ai_jobs (payload) VALUES ($1) RETURNING id`, [JSON.stringify(payload)]);
  const id = r.rows[0].id;
  const hasta = Date.now() + esperaMs;
  while (Date.now() < hasta) {
    await sleep(600);
    const j = (await pool.query('SELECT status, result, error FROM ai_jobs WHERE id = $1', [id])).rows[0];
    if (j?.status === 'done') return j.result;
    if (j?.status === 'error') throw new Error('runner: ' + j.error);
  }
  await pool.query(`UPDATE ai_jobs SET status = 'expired' WHERE id = $1 AND status IN ('pending', 'taken')`, [id]);
  throw new Error('runner: no contestó a tiempo');
}

async function callClaudeAPI(payload, options = {}) {
  if (process.env.AI_PROVIDER === 'max') {
    try {
      return await viaRunner(payload, Math.max(options.timeout || 0, 150000));
    } catch (err) {
      console.error('⚠️ Runner Claude Max falló, pruebo la API:', err.message);
    }
  }
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

  const ahora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const fullSystem = `Tu nombre es ${botName}. Atendés los mensajes de los clientes del negocio. Si te presentás, decí tu nombre tal cual (ej: "Soy ${botName}").
Ahora en Argentina es ${ahora}. Usalo para el saludo (buen día, buenas tardes, buenas noches) y para el día de la semana; nunca lo supongas.
Escribís por WhatsApp como una persona: sin signos de apertura (nada de ¿ ni ¡, va "Todo bien?"), frases cortas separadas con punto, sin la raya larga (—) y sin emojis en cada mensaje.
Saludás una sola vez por conversación. Si en el historial ya hay un mensaje tuyo, no vuelvas a saludar (nada de "Hola", "Buen día", "Buenas tardes"): seguí la charla directo con lo que te preguntan.
Nunca inventes datos, funciones ni detalles que no estén en tus instrucciones o en la información del negocio.
Escribí únicamente el mensaje para el cliente, en español. Nunca escribas razonamientos, dudas, correcciones ni notas para vos (nada de "Wait", "Let me", "Looking at", "Espera, debo..."): si te diste cuenta de algo, simplemente escribí el mensaje correcto.

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
// Por WhatsApp una persona no abre signos: "Todo bien?" y no "¿Todo bien?".
// ", ¿cómo estás?" pasa a ". Cómo estás?" para que no quede la coma pegada a la pregunta.
function toWhatsAppFormat(text) {
  return String(text || '')
    .replace(/\*\*([^*\n]+?)\*\*/g, '*$1*')
    .replace(/,\s*[¿¡]\s*(\S)/g, (_, c) => '. ' + c.toUpperCase())
    .replace(/[¿¡]/g, '')
    // A veces el modelo "piensa en voz alta" en inglés ("Wait, I need to reconsider..."): esos
    // párrafos nunca le llegan al cliente.
    .split(/\n{2,}/)
    .filter((p) => !/^\s*(wait|actually|let me|looking at|hmm|note:|i need|i should|i will|i'll|okay,? so|so,? i)\b/i.test(p))
    .join('\n\n')
    .trim();
}

module.exports = { getAIResponse, callClaudeAPI, toWhatsAppFormat };
