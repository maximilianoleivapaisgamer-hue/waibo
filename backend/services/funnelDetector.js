const axios = require('axios');
const pool = require('../db');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

// Las etapas solo avanzan, nunca retroceden (excepto a perdido)
const STAGE_ORDER = ['nuevo', 'interesado', 'turno_agendado', 'cerrado', 'perdido'];

const DETECT_STAGE_TOOL = {
  name: 'actualizar_etapa_embudo',
  description: 'Clasificá la etapa actual del cliente en el embudo de ventas basándote en la conversación. Solo usá esta herramienta si la etapa cambió respecto a la etapa actual.',
  input_schema: {
    type: 'object',
    properties: {
      stage: {
        type: 'string',
        enum: ['nuevo', 'interesado', 'turno_agendado', 'cerrado', 'perdido'],
        description: 'nuevo=primer contacto sin señal clara, interesado=preguntó precio/detalles/disponibilidad o mostró intención concreta, turno_agendado=agendó turno o confirmó pedido/reserva, cerrado=compró/pagó/confirmó la venta, perdido=dijo que no le interesa o lleva varios mensajes sin responder a seguimientos'
      },
      reason: {
        type: 'string',
        description: 'Una frase corta explicando por qué cambia de etapa (ej: "preguntó el precio del plan mensual")'
      }
    },
    required: ['stage', 'reason']
  }
};

async function detectAndUpdateFunnelStage(conversationId, clientId, messages, currentStage) {
  try {
    // No procesar si ya está cerrado/perdido y no hay señal de reversión
    if (currentStage === 'cerrado') return;

    const systemPrompt = `Sos un analista de ventas. Tu única tarea es clasificar en qué etapa del embudo de ventas está el cliente basándote en la conversación.

ETAPAS (en orden):
- nuevo: primer contacto, saludo, pregunta genérica sin señal de compra
- interesado: preguntó precio, disponibilidad, características específicas, pidió más info concreta, comparó opciones
- turno_agendado: confirmó un turno, reserva o pedido concreto
- cerrado: realizó el pago, confirmó la compra, dejó datos de envío, agradeció por la compra
- perdido: dijo que no le interesa, que lo piensa, o lleva múltiples mensajes de seguimiento sin respuesta

REGLA IMPORTANTE: La etapa actual es "${currentStage}". Solo usá la herramienta si detectás que la etapa CAMBIÓ. Las etapas NO retroceden (excepto a "perdido").`;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: DEFAULT_MODEL,
        max_tokens: 200,
        system: systemPrompt,
        messages,
        tools: [DETECT_STAGE_TOOL],
        tool_choice: { type: 'auto' }
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 8000
      }
    );

    const toolBlock = response.data.content.find(b => b.type === 'tool_use' && b.name === 'actualizar_etapa_embudo');
    if (!toolBlock) return; // No hubo cambio de etapa

    const { stage, reason } = toolBlock.input;

    // Verificar que la nueva etapa no retrocede (excepto perdido)
    const currentIdx = STAGE_ORDER.indexOf(currentStage);
    const newIdx = STAGE_ORDER.indexOf(stage);
    if (stage !== 'perdido' && newIdx <= currentIdx) return;

    await pool.query(
      `UPDATE conversations SET funnel_stage = $1, funnel_updated_at = NOW() WHERE id = $2`,
      [stage, conversationId]
    );
  } catch (err) {
    // No-op: el embudo es best-effort, no debe romper el flujo principal
    console.error('[funnel]', err.message);
  }
}

module.exports = { detectAndUpdateFunnelStage };
