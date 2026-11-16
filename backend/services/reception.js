const pool = require('../db');
const { callClaudeAPI, toWhatsAppFormat } = require('./ai');

/*
 * Modo recepción: el bot no vende. Le hace al cliente nuevo la pregunta de entrada, la IA
 * ubica la respuesta en uno de los segmentos que configuró el negocio, le pone la etiqueta
 * y lo deriva según el segmento (a un vendedor, repartido entre varios, al dueño, o un
 * mensaje de cierre y archivar). Después el bot se calla en ese chat.
 *
 * bot_configs.reception_segments: [{ name, description, label, route, seller_ids, close_message }]
 *   route = 'sellers' (uno o varios vendedores, por turno) | 'owner' | 'close'
 * conversations.reception_state: null → 'asked' → 'done'
 */

async function guardarSaliente(conversationId, texto) {
  await pool.query(`INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`, [conversationId, texto]);
}

async function clasificar(config, charla) {
  const segs = config.reception_segments.map((s, i) => `${i + 1}. "${s.name}": ${s.description || s.name}`).join('\n');
  const raw = await callClaudeAPI({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: `Sos la recepción de un negocio por WhatsApp. Le preguntaste al cliente: "${config.reception_question}".
Ubicá al cliente en UNO de estos segmentos según lo que contestó (lee la intención, no palabras exactas):
${segs}

Respondé SOLO un JSON: {"segmento": "nombre exacto del segmento o null si no queda claro", "repregunta": "si no queda claro, una repregunta corta y amable, sin signos de apertura; si queda claro, null"}`,
    messages: [{ role: 'user', content: charla }]
  }, { timeout: 60000, maxRetries: 1 });
  return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
}

async function asignar(clientId, conversationId, ids) {
  const lista = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (!lista.length) return null;
  const v = (await pool.query(
    `SELECT e.id, e.name,
       (SELECT COUNT(*) FROM conversations c WHERE c.assigned_to = e.id AND COALESCE(c.archived, false) = false
          AND c.updated_at > NOW() - INTERVAL '7 days') AS abiertos,
       (SELECT MAX(assigned_at) FROM conversations c WHERE c.assigned_to = e.id) AS ultimo
     FROM clients e WHERE e.owner_id = $1 AND e.role = 'employee' AND e.id = ANY($2::uuid[])
     ORDER BY abiertos ASC, ultimo ASC NULLS FIRST LIMIT 1`, [clientId, lista])).rows[0];
  if (!v) return null;
  await pool.query('UPDATE conversations SET assigned_to = $2, assigned_at = NOW() WHERE id = $1', [conversationId, v.id]);
  return v;
}

async function derivar({ config, conversation, phone, segmento, sendFn, extras }) {
  const { createAlert } = require('./alerts');
  const seg = config.reception_segments.find((s) => s.name === segmento) || null;
  const nombre = seg ? seg.name : 'Sin segmento';
  const quien = conversation.customer_name && conversation.customer_name !== phone ? `${conversation.customer_name} (${phone})` : phone;
  await pool.query(
    `UPDATE conversations SET segment = $2, reception_state = 'done', status = 'human' WHERE id = $1`,
    [conversation.id, nombre]
  );
  const acciones = [];
  if (seg?.label) acciones.push({ type: 'etiqueta', name: seg.label });

  if (seg && seg.route === 'close') {
    if (seg.close_message) {
      const t = toWhatsAppFormat(seg.close_message);
      await sendFn(phone, t);
      await guardarSaliente(conversation.id, t);
    }
    acciones.push({ type: 'archivar' });
  } else if (seg && seg.route === 'sellers') {
    const v = await asignar(conversation.client_id, conversation.id, seg.seller_ids);
    await createAlert(conversation.client_id, conversation.id, 'sale_ready',
      v ? `${quien} (${nombre}) quedó asignado a ${v.name}` : `${quien} (${nombre}) entró y no hay vendedor para asignarle`);
  } else {
    await createAlert(conversation.client_id, conversation.id, 'human_requested',
      `${quien} entró por recepción (${nombre}) y lo atendés vos`, `recepción: ${nombre}`.toLowerCase());
  }
  if (acciones.length && extras.onActions) {
    try { await extras.onActions(acciones, { ...conversation, sales_step: 0 }); } catch (e) { console.error('[recepción] acciones:', e.message); }
  }
  console.log(`[recepción] ${conversation.client_id} ${phone}: ${nombre} (${seg ? seg.route : 'owner'})`);
}

async function atender({ config, conversation, phone, customerMessage, sendFn, extras, esNuevo }) {
  const c = (await pool.query('SELECT * FROM conversations WHERE id = $1', [conversation.id])).rows[0] || conversation;
  if (c.reception_state === 'done') return;

  // Cliente nuevo: va la pregunta de entrada. Un chat viejo que escribe se clasifica directo.
  if (!c.reception_state && esNuevo) {
    const t = toWhatsAppFormat(config.reception_question);
    await sendFn(phone, t);
    await guardarSaliente(c.id, t);
    await pool.query(`UPDATE conversations SET reception_state = 'asked', reception_tries = 0 WHERE id = $1`, [c.id]);
    return;
  }

  const msgs = (await pool.query(
    `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY timestamp DESC LIMIT 12`, [c.id])).rows.reverse();
  const charla = msgs.map((m) => `${m.role === 'user' ? 'CLIENTE' : 'NEGOCIO'}: ${String(m.content).slice(0, 500)}`).join('\n');
  let r;
  try {
    r = await clasificar(config, charla);
  } catch (e) {
    console.error('[recepción] no se pudo clasificar:', e.message);
    return derivar({ config, conversation: c, phone, segmento: null, sendFn, extras });
  }
  const valido = r.segmento && config.reception_segments.some((s) => s.name === r.segmento);
  if (valido) return derivar({ config, conversation: c, phone, segmento: r.segmento, sendFn, extras });

  // No quedó claro: una repregunta y, si tampoco, al dueño
  if ((c.reception_tries || 0) < 1 && r.repregunta) {
    const t = toWhatsAppFormat(r.repregunta);
    await sendFn(phone, t);
    await guardarSaliente(c.id, t);
    await pool.query(`UPDATE conversations SET reception_state = 'asked', reception_tries = COALESCE(reception_tries, 0) + 1 WHERE id = $1`, [c.id]);
    return;
  }
  return derivar({ config, conversation: c, phone, segmento: null, sendFn, extras });
}

module.exports = { atender, clasificar };
