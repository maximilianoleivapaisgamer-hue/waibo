const pool = require('../db');
const { callClaudeAPI } = require('./ai');

/*
 * Temperatura del chat: la IA lee la charla y dice qué tan interesado está el cliente
 * (caliente / tibio / frío) con un motivo corto. Corre sola cuando el cliente escribe,
 * aunque el bot esté apagado, así los vendedores ven en la Bandeja a quién atender primero.
 * Como mucho una vez cada 5 minutos por chat.
 */

const enCurso = new Set();

async function clasificarTemperatura(conversationId) {
  if (enCurso.has(conversationId)) return;
  enCurso.add(conversationId);
  try {
    const conv = (await pool.query(
      `SELECT c.id, c.client_id, c.heat_at, bc.system_prompt, bc.business_info
       FROM conversations c LEFT JOIN bot_configs bc ON bc.client_id = c.client_id WHERE c.id = $1`,
      [conversationId])).rows[0];
    if (!conv) return;
    if (conv.heat_at && Date.now() - new Date(conv.heat_at).getTime() < 5 * 60 * 1000) return;

    const msgs = (await pool.query(
      `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY timestamp DESC LIMIT 20`, [conversationId])).rows.reverse();
    if (!msgs.some((m) => m.role === 'user')) return;
    const charla = msgs.map((m) => `${m.role === 'user' ? 'CLIENTE' : 'NEGOCIO'}: ${String(m.content).slice(0, 400)}`).join('\n');
    const negocio = String(conv.business_info || conv.system_prompt || '').slice(0, 1500);

    const raw = await callClaudeAPI({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: `Clasificás qué tan cerca de comprar está un cliente que escribe por WhatsApp a un negocio.
${negocio ? `Sobre el negocio: ${negocio}\n` : ''}Respondé SOLO un JSON: {"nivel": "caliente" | "tibio" | "frio", "motivo": "máximo 6 palabras"}
- caliente: quiere comprar ya, pregunta cómo pagar, dice cantidades o fechas concretas, pide datos para avanzar.
- tibio: pregunta precios o cómo funciona, muestra interés pero sin decidir.
- frio: solo saluda, dice que no le interesa, se despidió, o no es cliente.`,
      messages: [{ role: 'user', content: charla }]
    }, { timeout: 60000, maxRetries: 1 });
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    if (!['caliente', 'tibio', 'frio'].includes(j.nivel)) return;
    await pool.query(
      `UPDATE conversations SET heat = $2, heat_reason = $3, heat_at = NOW() WHERE id = $1`,
      [conversationId, j.nivel, String(j.motivo || '').slice(0, 80)]
    );
  } catch (e) {
    console.error('[temperatura]', e.message);
  } finally {
    enCurso.delete(conversationId);
  }
}

module.exports = { clasificarTemperatura };
