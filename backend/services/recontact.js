const axios = require('axios');
const pool = require('../db');
const { callClaudeAPI, toWhatsAppFormat } = require('./ai');
const { sendWhatsAppMessage, sendWhatsAppMedia } = require('./whatsapp');

/*
 * Recontacto de clientes que dejaron de contestar (canal WhatsApp, QR o API de Meta).
 *
 * Un chat entra cuando el último mensaje es nuestro y pasaron las horas del intento que
 * le toca (recontact_schedule, ej. [4, 24, 72]). Para cada uno la IA lee la charla y decide:
 *   enviar   → escribe un mensaje para esa persona (y puede sumar un recurso, ej. el precio)
 *   esperar  → el cliente pidió tiempo ("lo pienso", "el viernes que cobro"): se agenda esa fecha
 *   no       → se despidió o no le interesa: no se le escribe más
 * Si el cliente contesta, el contador vuelve a cero (messageProcessor / whatsappQR).
 *
 * Cuidados: solo en el horario configurado, un tope por día y por línea, un mensaje cada
 * pocos minutos (el QR es WhatsApp común y lo restringen si manda en ráfaga), nunca a chats
 * atendidos a mano, derivados al dueño o archivados.
 */

const QR_URL = () => process.env.QR_SERVICE_URL;
const QR_SECRET = () => process.env.QR_SERVICE_SECRET || 'whabot_qr_secret_2024';
const ULTIMOS_DIAS = 10; // los chats más viejos que esto no entran, para no despertar todo el historial importado

function qrPost(clientId, accion, body) {
  return axios.post(`${QR_URL()}/session/${clientId}/${accion}`, { ...body, secret: QR_SECRET() },
    { headers: { 'x-service-secret': QR_SECRET() }, timeout: 90000 });
}

function horaArgentina() {
  return Number(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false })) % 24;
}

function canalDe(client, to, ultimoDelCliente) {
  if (client.whatsapp_mode === 'qr') {
    return {
      sendText: (t) => qrPost(client.id, 'send', { to, message: t }),
      sendMedia: (rec, caption) => qrPost(client.id, 'send-media', {
        to, mimetype: rec.mimetype, data: rec.data.toString('base64'), filename: rec.filename,
        caption: caption || '', asVoice: rec.kind === 'audio'
      })
    };
  }
  // La API de Meta solo deja escribir texto libre dentro de las 24 h del último mensaje del
  // cliente. Pasado eso hace falta una plantilla aprobada, que todavía no manejamos.
  if (!client.whatsapp_api_key || !ultimoDelCliente || Date.now() - new Date(ultimoDelCliente).getTime() > 23 * 3600 * 1000) return null;
  const opts = { provider: client.whatsapp_provider || '360dialog', phoneNumberId: client.whatsapp_phone_id };
  return {
    sendText: (t) => sendWhatsAppMessage(to, t, client.whatsapp_api_key, opts),
    sendMedia: (rec, caption) => sendWhatsAppMedia(to, rec, client.whatsapp_api_key, { ...opts, caption })
  };
}

async function decidir({ cfg, conv, mensajes, recursos, intento, total }) {
  const ahora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const charla = mensajes.map((m) => `${m.role === 'user' ? 'CLIENTE' : 'NOSOTROS'} (${new Date(m.timestamp).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}): ${m.content}`).join('\n');
  const yaEnviados = conv.sent_resources || [];
  const lista = recursos.map((r) => `- ID "${r.id}" (${r.kind}) ${r.name}${r.description ? ': ' + r.description : ''}${yaEnviados.includes(r.id) ? ' [YA ENVIADO]' : ''}`).join('\n');

  const system = `Sos ${cfg.bot_name || 'el vendedor'} y decidís si recontactar a un cliente que dejó de contestar por WhatsApp. Ahora en Argentina es ${ahora}.

INSTRUCCIONES DEL NEGOCIO:
${cfg.system_prompt || '(sin instrucciones)'}

REGLAS DEL SEGUIMIENTO:
${cfg.recontact_guide || 'Recontactá con un mensaje corto y natural, retomando lo último que se habló.'}

Este sería el intento ${intento} de ${total}.

RECURSOS QUE PODÉS MANDAR:
${lista || '(ninguno)'}

Respondé SOLO con un JSON, sin texto alrededor:
{"accion": "enviar" | "esperar" | "no", "mensaje": "texto para el cliente si accion=enviar", "recurso": "ID o null", "esperar_hasta": "AAAA-MM-DDTHH:MM (hora argentina) si accion=esperar", "motivo": "por qué, en pocas palabras"}

- "esperar" cuando el cliente pidió tiempo o dio una fecha (cobra el viernes, lo charla con el socio, te escribe en unos días). Poné la fecha en que conviene escribirle.
- "no" cuando se despidió del todo, dijo que no le interesa, no es cliente, o el último mensaje nuestro ya era una despedida.
- El mensaje va escrito como persona por WhatsApp: corto, sin signos de apertura, sin volver a presentarte, retomando lo que se habló. Nunca inventes datos.
- Nunca mandes un recurso marcado [YA ENVIADO].`;

  const raw = await callClaudeAPI({
    model: cfg.ai_model || 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system,
    messages: [{ role: 'user', content: `CHARLA (de la más vieja a la más nueva):\n${charla}` }]
  }, { timeout: 60000 });
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

async function procesarCliente(cfg) {
  const client = (await pool.query('SELECT * FROM clients WHERE id = $1 AND active = true', [cfg.client_id])).rows[0];
  if (!client) return;

  const enviadosHoy = (await pool.query(
    `SELECT COUNT(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.client_id = $1 AND m.origin = 'seguimiento' AND m.timestamp > NOW() - INTERVAL '24 hours'`,
    [cfg.client_id]
  )).rows[0].n;
  if (enviadosHoy >= (cfg.recontact_daily_limit || 40)) return;

  const horarios = (Array.isArray(cfg.recontact_schedule) && cfg.recontact_schedule.length ? cfg.recontact_schedule : [4, 24, 72]).map(Number);

  // Un chat por vuelta (cada 5 minutos) y por línea: así nunca sale una ráfaga.
  const cand = (await pool.query(
    `SELECT c.*, lm.role AS last_role, lm.origin AS last_origin, lm.timestamp AS last_at,
            (SELECT MAX(timestamp) FROM messages WHERE conversation_id = c.id AND role = 'user') AS last_user_at
     FROM conversations c
     JOIN LATERAL (SELECT role, origin, timestamp FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) lm ON true
     WHERE c.client_id = $1 AND c.channel = 'whatsapp'
       AND c.status = 'bot' AND COALESCE(c.archived, false) = false
       AND COALESCE(c.recontact_count, 0) < $2
       AND (c.recontact_hold_until IS NULL OR c.recontact_hold_until <= NOW())
       AND lm.role = 'assistant' AND COALESCE(lm.origin, '') NOT IN ('manual', 'phone')
       AND lm.timestamp > NOW() - ($3 || ' days')::interval
       AND EXISTS (SELECT 1 FROM messages WHERE conversation_id = c.id AND role = 'user')
       AND (c.recontact_hold_until IS NOT NULL AND c.recontact_hold_until <= NOW()
            OR lm.timestamp <= NOW() - (($4::float8[])[COALESCE(c.recontact_count, 0) + 1] || ' hours')::interval)
     ORDER BY lm.timestamp ASC
     LIMIT 1`,
    [cfg.client_id, horarios.length, ULTIMOS_DIAS, horarios]
  )).rows;
  if (!cand.length) return;
  const conv = cand[0];

  const canal = canalDe(client, conv.customer_phone, conv.last_user_at);
  if (!canal) {
    await pool.query('UPDATE conversations SET recontact_count = 99 WHERE id = $1', [conv.id]);
    return;
  }

  const mensajes = (await pool.query(
    `SELECT role, content, timestamp FROM messages WHERE conversation_id = $1 ORDER BY timestamp DESC LIMIT 25`, [conv.id]
  )).rows.reverse();
  const recursos = (await pool.query('SELECT id, name, description, kind FROM bot_resources WHERE client_id = $1 ORDER BY created_at', [cfg.client_id])).rows;
  const intento = (conv.recontact_count || 0) + 1;

  let d;
  try {
    d = await decidir({ cfg, conv, mensajes, recursos, intento, total: horarios.length });
  } catch (e) {
    console.error(`[seguimiento] ${conv.customer_phone}: la IA no decidió`, e.message);
    await pool.query(`UPDATE conversations SET recontact_hold_until = NOW() + INTERVAL '2 hours' WHERE id = $1`, [conv.id]);
    return;
  }

  if (d.accion === 'esperar' && d.esperar_hasta) {
    await pool.query(
      `UPDATE conversations SET recontact_hold_until = ($2::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'), recontact_note = $3 WHERE id = $1`,
      [conv.id, d.esperar_hasta, d.motivo || null]
    );
    console.log(`[seguimiento] ${conv.customer_phone}: espera hasta ${d.esperar_hasta} (${d.motivo})`);
    return;
  }
  if (d.accion !== 'enviar' || !d.mensaje) {
    await pool.query('UPDATE conversations SET recontact_count = 99, recontact_hold_until = NULL, recontact_note = $2 WHERE id = $1', [conv.id, d.motivo || 'no corresponde']);
    console.log(`[seguimiento] ${conv.customer_phone}: no se le escribe (${d.motivo})`);
    return;
  }

  const texto = toWhatsAppFormat(d.mensaje).trim();
  await canal.sendText(texto);
  await pool.query(`INSERT INTO messages (conversation_id, role, content, origin) VALUES ($1, 'assistant', $2, 'seguimiento')`, [conv.id, texto]);

  if (d.recurso && !(conv.sent_resources || []).includes(d.recurso)) {
    const rec = (await pool.query('SELECT * FROM bot_resources WHERE id = $1 AND client_id = $2', [d.recurso, cfg.client_id])).rows[0];
    if (rec) {
      if (rec.kind === 'link') await canal.sendText(rec.url);
      else await canal.sendMedia(rec, '');
      await pool.query(`UPDATE conversations SET sent_resources = array_append(COALESCE(sent_resources, '{}'), $2) WHERE id = $1`, [conv.id, rec.id]);
      await pool.query(`INSERT INTO messages (conversation_id, role, content, origin, resource_id, media_type) VALUES ($1, 'assistant', $2, 'seguimiento', $3, $4)`,
        [conv.id, `${rec.kind === 'audio' ? '🎙️' : '📎'} ${rec.name}`, rec.id, rec.kind]);
    }
  }

  const ultimo = intento >= horarios.length;
  await pool.query(
    `UPDATE conversations SET recontact_count = $2, recontact_hold_until = NULL, recontact_note = $3, updated_at = NOW() WHERE id = $1`,
    [conv.id, intento, d.motivo || null]
  );
  console.log(`[seguimiento] ${conv.customer_phone}: intento ${intento}/${horarios.length} enviado${ultimo ? ' (último)' : ''}`);
}

let corriendo = false;
async function runRecontact() {
  if (corriendo) return;
  corriendo = true;
  try {
    const cfgs = (await pool.query('SELECT * FROM bot_configs WHERE recontact_enabled = true AND active = true')).rows;
    const hora = horaArgentina();
    for (const cfg of cfgs) {
      if (hora < (cfg.recontact_start_hour ?? 9) || hora >= (cfg.recontact_end_hour ?? 21)) continue;
      try { await procesarCliente(cfg); } catch (e) { console.error(`[seguimiento] cliente ${cfg.client_id}:`, e.message); }
    }
  } finally {
    corriendo = false;
  }
}

module.exports = { runRecontact, decidir };
