const express = require('express');
const router = express.Router();
const { resolverSesion, lineaSql } = require('../services/lines');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const axios = require('axios');
const { processIncomingMessage } = require('../services/messageProcessor');

const QR_SERVICE_URL = process.env.QR_SERVICE_URL; // URL de ngrok
const SERVICE_SECRET = process.env.QR_SERVICE_SECRET || 'whabot_qr_secret_2024';

function qrHeaders() {
  return { 'x-service-secret': SERVICE_SECRET, 'Content-Type': 'application/json' };
}

// El cliente inicia la conexión QR
router.post('/connect', authMiddleware, async (req, res) => {
  if (!QR_SERVICE_URL) {
    return res.status(503).json({ error: 'El servicio de QR no está configurado en este momento.' });
  }
  try {
    await axios.post(`${QR_SERVICE_URL}/session/start`, { clientId: req.client.id, secret: SERVICE_SECRET }, { headers: qrHeaders() });
    await pool.query(`UPDATE clients SET whatsapp_mode = 'qr' WHERE id = $1`, [req.client.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error iniciando QR:', err.message);
    res.status(500).json({ error: 'No se pudo iniciar la conexión QR. Intentá de nuevo.' });
  }
});

// Estado + QR image (+ si el bot está respondiendo)
router.get('/status', authMiddleware, async (req, res) => {
  const cfg = await pool.query('SELECT qr_auto_reply FROM bot_configs WHERE client_id = $1', [req.client.id]);
  const auto_reply = !!cfg.rows[0]?.qr_auto_reply;
  // mode: el panel muestra el cartel de "WhatsApp desconectado" solo si el negocio usa el QR
  const cm = await pool.query('SELECT whatsapp_mode FROM clients WHERE id = $1', [req.client.id]);
  const mode = cm.rows[0]?.whatsapp_mode || null;
  if (!QR_SERVICE_URL) {
    return res.json({ status: 'unavailable', qr: null, auto_reply, mode });
  }
  try {
    const r = await axios.get(`${QR_SERVICE_URL}/session/${req.client.id}/status`, { headers: qrHeaders(), timeout: 15000 });
    res.json({ ...r.data, auto_reply, mode });
  } catch {
    res.json({ status: 'service_down', qr: null, auto_reply, mode });
  }
});

// Prender/apagar el bot en el canal QR
router.post('/auto-reply', authMiddleware, async (req, res) => {
  const enabled = !!req.body.enabled;
  await pool.query('UPDATE bot_configs SET qr_auto_reply = $1, active = true WHERE client_id = $2', [enabled, req.client.id]);
  res.json({ ok: true, auto_reply: enabled });
});

// Importar los chats existentes de WhatsApp (corre en segundo plano en el servicio QR)
router.post('/import-history', authMiddleware, async (req, res) => {
  if (!QR_SERVICE_URL) return res.status(503).json({ error: 'El servicio de QR no está configurado.' });
  try {
    const r = await axios.post(`${QR_SERVICE_URL}/session/${req.client.id}/import-history`, { secret: SERVICE_SECRET }, { headers: qrHeaders(), timeout: 30000 });
    res.json(r.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error || 'No se pudo iniciar la importación.' });
  }
});

router.get('/import-status', authMiddleware, async (req, res) => {
  if (!QR_SERVICE_URL) return res.json({ estado: 'nunca' });
  try {
    const r = await axios.get(`${QR_SERVICE_URL}/session/${req.client.id}/import-status`, { headers: qrHeaders(), timeout: 15000 });
    res.json(r.data);
  } catch {
    res.json({ estado: 'desconocido' });
  }
});

// Desconectar — además limpia todo lo importado por QR
router.post('/disconnect', authMiddleware, async (req, res) => {
  if (QR_SERVICE_URL) {
    try {
      await axios.post(`${QR_SERVICE_URL}/session/${req.client.id}/disconnect`, { secret: SERVICE_SECRET }, { headers: qrHeaders() });
    } catch {}
  }
  // Desvincular NO borra nada: el historial (mensajes, fotos, audios, etiquetas) queda en
  // Waibo y al volver a vincular se completa con lo nuevo.
  console.log(`[QR disconnect] clientId=${req.client.id} — historial conservado`);
  await pool.query(`UPDATE clients SET whatsapp_mode = 'api' WHERE id = $1`, [req.client.id]);
  res.json({ success: true, deleted_conversations: 0 });
});

// Enviar mensaje desde Railway al microservicio (usado por sendWhatsAppQRMessage)
router.post('/send', authMiddleware, async (req, res) => {
  const { to, message } = req.body;
  if (!QR_SERVICE_URL) return res.status(503).json({ error: 'QR service no disponible' });
  try {
    await axios.post(`${QR_SERVICE_URL}/session/${req.client.id}/send`, { to, message, secret: SERVICE_SECRET }, { headers: qrHeaders() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Callbacks desde el microservicio QR hacia Railway ──────────────

function checkServiceSecret(req, res, next) {
  const secret = req.body?.secret || req.headers['x-service-secret'];
  if (secret !== SERVICE_SECRET) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// El microservicio avisa que el cliente conectó
// Mensaje que el dueño mandó desde el celular: se guarda en el momento (origin 'phone').
// El bot y el seguimiento lo usan para saber que esa charla la está llevando una persona.
router.post('/outgoing', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  req.body.clientId = _lin.clientId;
  const lineId = _lin.lineId;
  const L = lineaSql(lineId);
  const { clientId, to, text, waId, mediaType } = req.body;
  if (!clientId || !to || !text) return res.status(400).json({ error: 'faltan datos' });
  try {
    let conv = await pool.query(
      `SELECT id FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L} ORDER BY created_at DESC LIMIT 1`,
      [clientId, to]
    );
    let convId = conv.rows[0]?.id;
    if (!convId) {
      const nc = await pool.query(
        `INSERT INTO conversations (line_id, client_id, customer_phone, customer_name, channel, status) VALUES (${L}, $1,$2,$2,'whatsapp','bot') RETURNING id`,
        [clientId, to]
      );
      convId = nc.rows[0].id;
    }
    const ins = await pool.query(
      `INSERT INTO messages (conversation_id, role, content, origin, wa_id, media_type)
       SELECT $1, 'assistant', $2, 'phone', $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = $1 AND wa_id = $3)`,
      [convId, text, waId || null, mediaType || null]
    );
    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [convId]);
    res.json({ ok: true, guardado: ins.rowCount > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// La línea llegó al tope diario de envíos: el mensaje quedó esperando en la cola del
// servicio QR. Se deja una alerta en el panel por cada número demorado (sin aviso por
// WhatsApp, que saldría por la misma línea trabada).
router.post('/line-limit', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  req.body.clientId = _lin.clientId;
  const lineId = _lin.lineId;
  const L = lineaSql(lineId);
  const { clientId, to, limite, sale, manual, enviados } = req.body;
  try {
    // WhatsApp restringe por el ritmo de la línea, sin importar el canal: se suma lo del celular
    const celu = (await pool.query(
      `SELECT COUNT(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE c.client_id = $1 AND m.origin = 'phone' AND m.timestamp > NOW() - INTERVAL '24 hours'`, [clientId])).rows[0].n;
    if (manual) {
      await pool.query(
        `INSERT INTO alerts (client_id, type, message) VALUES ($1, 'line_limit', $2)`,
        [clientId, `Ojo: por la línea ya salieron ${enviados || limite} mensajes en 24 h por Waibo${celu ? ` + ${celu} desde el celular` : ''} (el tope es ${limite}) y siguen saliendo mensajes escritos a mano. WhatsApp puede restringir el número por este ritmo: conviene bajar el volumen hasta mañana.`]
      );
      return res.json({ ok: true });
    }
    const conv = to ? (await pool.query(
      `SELECT id, customer_name FROM conversations WHERE client_id = $1 AND customer_phone = $2 ORDER BY created_at DESC LIMIT 1`,
      [clientId, to])).rows[0] : null;
    const hora = sale ? new Date(sale).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' }) : 'más tarde';
    const quien = conv?.customer_name && conv.customer_name !== to ? `${conv.customer_name} (${to})` : (to || 'un cliente');
    await pool.query(
      `INSERT INTO alerts (client_id, conversation_id, type, message) VALUES ($1, $2, 'line_limit', $3)`,
      [clientId, conv?.id || null, `La línea llegó al tope de ${limite} mensajes en 24 h. El mensaje a ${quien} quedó en espera y sale cerca de las ${hora}.`]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// El servicio QR sube la foto / audio / video de un mensaje apenas llega
router.post('/media', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  req.body.clientId = _lin.clientId;
  const lineId = _lin.lineId;
  const L = lineaSql(lineId);
  const { clientId, waId, mimetype, data, filename } = req.body;
  if (!clientId || !waId || !data) return res.status(400).json({ error: 'faltan datos' });
  try {
    await pool.query(
      `INSERT INTO wa_media (client_id, wa_id, mimetype, filename, data) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (client_id, wa_id) DO NOTHING`,
      [clientId, waId, mimetype || null, filename || null, Buffer.from(data, 'base64')]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tildes de los mensajes que mandamos
router.post('/ack', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  const { waId, ack } = req.body;
  try {
    await pool.query(
      `UPDATE messages m SET ack = GREATEST(COALESCE(m.ack, 0), $3)
       FROM conversations c WHERE c.id = m.conversation_id AND c.client_id = $1 AND m.wa_id = $2`,
      [_lin.clientId, waId, Number(ack) || 0]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Llega la transcripción de un audio que ya se guardó: se completa el mensaje y, si el bot
// está prendido, contesta recién ahora (con el texto del audio)
router.post('/transcript', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  const clientId = _lin.clientId;
  const lineId = _lin.lineId;
  const L = lineaSql(lineId);
  const { from, name, waId, audio } = req.body;
  let { text } = req.body;
  res.json({ ok: true });
  try {
    if (!text && audio && audio.data) {
      const { transcribeAudio } = require('../services/voice');
      const dicho = await transcribeAudio(Buffer.from(audio.data, 'base64'), audio.mimetype || 'audio/ogg');
      if (dicho) text = `[Audio del cliente]: ${dicho}`;
    }
    if (text) {
      await pool.query(
        `UPDATE messages m SET content = $3 FROM conversations c
         WHERE c.id = m.conversation_id AND c.client_id = $1 AND m.wa_id = $2`, [clientId, waId, text]);
    }
    const cfg = (await pool.query('SELECT label_instructions, whatsapp_actions_enabled, qr_auto_reply, sales_steps, sales_steps_enabled FROM bot_configs WHERE client_id = $1', [clientId])).rows[0] || {};
    const botPrendido = lineId ? !!_lin.line.bot_enabled : !!cfg.qr_auto_reply;
    if (!botPrendido) return;
    const brain = await require('../services/lines').cerebroDe(clientId, lineId);
    if (brain && brain.label_instructions) cfg.label_instructions = brain.label_instructions;
    if ((brain && brain.kind === 'soporte') || (_lin.line && _lin.line.kind === 'soporte')) cfg.sales_steps_enabled = false;
    const { buildSalesExtras } = require('../services/salesActions');
    const extras = buildSalesExtras({
      clientId, to: from, cfg, brainId: brain ? brain.id : null,
      channel: {
        sendText: (t) => qrPost(sesion, 'send', { to: from, message: t }),
        sendMedia: (rec, caption) => qrPost(sesion, 'send-media', { to: from, mimetype: rec.mimetype, data: rec.data.toString('base64'), filename: rec.filename, caption: caption || '', asVoice: rec.kind === 'audio' }),
        applyLabel: (n) => qrPost(sesion, 'label', { to: from, label: n }),
        archive: () => qrPost(sesion, 'archive', { to: from }),
        labels: () => labelsDeLinea(sesion)
      }
    });
    const sendFn = (phone, message) => qrPost(sesion, 'send', { to: phone, message });
    await processIncomingMessage(clientId, from, name || 'Cliente', text || '[El cliente mandó un audio]', sendFn,
      { ...extras, messageMeta: { waId, mediaType: 'ptt' }, lineId, line: _lin.line, brain, skipInsert: true });
  } catch (err) {
    console.error('Error con la transcripción:', err.message);
  }
});

// Etiquetas de WhatsApp que cambiaron en el celular u otro WhatsApp Web: se reemplazan las
// etiquetas de WhatsApp del chat y se conservan las propias de Waibo
router.post('/labels-sync', checkServiceSecret, async (req, res) => {
  const _lin = await resolverSesion(req.body.clientId);
  const L = lineaSql(_lin.lineId);
  const todas = Array.isArray(req.body.all) ? req.body.all.map(String) : [];
  let n = 0;
  try {
    for (const c of req.body.chats || []) {
      const r = await pool.query(
        `UPDATE conversations SET tags = ARRAY(
           SELECT DISTINCT x FROM (
             SELECT unnest(COALESCE(tags, '{}')) AS x EXCEPT SELECT unnest($3::text[])
             UNION SELECT unnest($4::text[])
           ) t)
         WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L}`,
        [_lin.clientId, String(c.phone), todas, Array.isArray(c.labels) ? c.labels.map(String) : []]
      );
      n += r.rowCount;
    }
    res.json({ ok: true, actualizados: n });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// El servicio QR avisa que WhatsApp cerró la sesión
router.post('/disconnected', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  req.body.clientId = _lin.clientId;
  const lineId = _lin.lineId;
  const L = lineaSql(lineId);
  try {
    if (lineId) {
      const prev = (await pool.query('SELECT status, name FROM wa_lines WHERE id = $1', [lineId])).rows[0];
      await pool.query(`UPDATE wa_lines SET status = 'disconnected' WHERE id = $1`, [lineId]);
      if (prev?.status === 'connected') {
        await pool.query(`INSERT INTO alerts (client_id, type, message) VALUES ($1, 'whatsapp_disconnected', $2)`,
          [req.body.clientId, `La línea "${prev.name}" se desconectó. Entrá a Líneas y escaneá el QR de nuevo.`]);
      }
      return res.json({ ok: true });
    }
    await require('../services/qrHealth').marcarDesconectado(req.body.clientId, req.body.reason || 'LOGOUT');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/connected', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  req.body.clientId = _lin.clientId;
  const lineId = _lin.lineId;
  const L = lineaSql(lineId);
  const { clientId, phone } = req.body;
  try {
    // Línea extra: su estado vive en wa_lines (la principal sigue en whatsapp_qr_sessions)
    if (lineId) {
      await pool.query(`UPDATE wa_lines SET status = 'connected', phone_number = $2, connected_at = NOW() WHERE id = $1`, [lineId, phone]);
      return res.json({ ok: true });
    }
    await pool.query(
      `INSERT INTO whatsapp_qr_sessions (client_id, status, phone_number, connected_at)
       VALUES ($1, 'connected', $2, NOW())
       ON CONFLICT (client_id) DO UPDATE SET status = 'connected', phone_number = $2, connected_at = NOW()`,
      [clientId, phone]
    );
    await pool.query(`UPDATE clients SET whatsapp_mode = 'qr' WHERE id = $1`, [clientId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// El microservicio envía historial de mensajes al conectar
// Etiquetas de WhatsApp Business → tags de la conversación
router.post('/labels', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  req.body.clientId = _lin.clientId;
  const lineId = _lin.lineId;
  const L = lineaSql(lineId);
  const { clientId, items } = req.body;
  res.json({ ok: true });
  if (!Array.isArray(items) || !items.length) return;
  try {
    for (const { phone, label } of items) {
      if (!phone || !label) continue;
      await pool.query(
        `UPDATE conversations
         SET tags = array_append(COALESCE(tags, '{}'), $3::text)
         WHERE client_id = $1 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L} AND customer_phone = $2
           AND NOT (COALESCE(tags, '{}') @> ARRAY[$3::text])`,
        [clientId, phone, label]
      );
    }
    console.log(`[QR labels] clientId=${clientId} — ${items.length} etiquetas aplicadas`);
  } catch (err) {
    console.error('[QR labels] error:', err.message);
  }
});

// Chats existentes importados desde WhatsApp Web (lotes de ~40 chats).
// Son conversaciones normales del canal: se ven en el panel. created_at toma la fecha
// del primer mensaje para no inflar "conversaciones de hoy".
router.post('/history-chats', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  req.body.clientId = _lin.clientId;
  const lineId = _lin.lineId;
  const L = lineaSql(lineId);
  const { clientId, chats } = req.body;
  if (!clientId || !Array.isArray(chats)) return res.status(400).json({ error: 'faltan datos' });
  let convs = 0, guardados = 0;
  for (const c of chats) {
    try {
      const phone = String(c.phone || '').replace(/\D/g, '');
      const msgs = (c.messages || []).filter((m) => m.text && m.timestamp);
      if (!phone || !msgs.length) continue;
      const primero = msgs.reduce((a, m) => (m.timestamp < a ? m.timestamp : a), msgs[0].timestamp);

      let conv = await pool.query(
        `SELECT id, customer_name FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L} ORDER BY created_at DESC LIMIT 1`,
        [clientId, phone]
      );
      let convId = conv.rows[0]?.id;
      if (!convId) {
        const nc = await pool.query(
          `INSERT INTO conversations (line_id, client_id, customer_phone, customer_name, channel, status, created_at)
           VALUES (${L}, $1,$2,$3,'whatsapp','bot',$4::timestamp) RETURNING id`,
          [clientId, phone, c.name || phone, primero]
        );
        convId = nc.rows[0].id;
      } else if (c.savedName && conv.rows[0].customer_name !== c.savedName) {
        // Guardado en los contactos del celular: ese nombre manda
        await pool.query('UPDATE conversations SET customer_name = $1 WHERE id = $2', [c.savedName, convId]);
      } else if (c.name && (!conv.rows[0].customer_name || conv.rows[0].customer_name === phone || conv.rows[0].customer_name === 'Cliente')) {
        await pool.query('UPDATE conversations SET customer_name = $1 WHERE id = $2', [c.name, convId]);
      }
      convs++;

      for (const m of msgs) {
        const rol = m.role === 'assistant' ? 'assistant' : 'user';
        const ins = await pool.query(
          `INSERT INTO messages (conversation_id, role, content, timestamp, origin, wa_id, media_type)
           SELECT $1::uuid, $2::varchar, $3::text, $4::timestamp, 'import', $5::text, $6::varchar
           WHERE NOT EXISTS (
             SELECT 1 FROM messages
             WHERE conversation_id = $1::uuid AND ($5::text IS NOT NULL AND wa_id = $5::text
               OR role = $2::varchar AND content = $3::text AND ABS(EXTRACT(EPOCH FROM (timestamp - $4::timestamp))) < 5)
           )`,
          [convId, rol, m.text, m.timestamp, m.waId || null, m.mediaType || null]
        );
        guardados += ins.rowCount;
        // Mensajes guardados antes sin el id de WhatsApp: se completa para poder ver la foto o el audio
        if (!ins.rowCount && m.waId) {
          await pool.query(
            `UPDATE messages SET wa_id = $5::text, media_type = COALESCE(media_type, $6::varchar)
             WHERE id = (SELECT id FROM messages WHERE conversation_id = $1::uuid AND wa_id IS NULL AND role = $2::varchar
                         AND (content = $3::text OR $6::varchar IS NOT NULL)
                         AND ABS(EXTRACT(EPOCH FROM (timestamp - $4::timestamp))) < 5 LIMIT 1)`,
            [convId, rol, m.text, m.timestamp, m.waId, m.mediaType || null]
          );
        }
      }

      await pool.query(
        `UPDATE conversations SET
           updated_at = COALESCE((SELECT MAX(timestamp) FROM messages WHERE conversation_id = $1::uuid), updated_at),
           last_read_at = COALESCE(last_read_at, NOW()),
           archived = $2,
           tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags, '{}') || $3::text[]))
         WHERE id = $1::uuid`,
        [convId, !!c.archived, Array.isArray(c.labels) ? c.labels : []]
      );
    } catch (e) {
      console.error(`[QR history-chats] ${c.phone}:`, e.message);
    }
  }
  console.log(`[QR history-chats] clientId=${clientId} — ${convs} chats, ${guardados} mensajes nuevos`);
  res.json({ ok: true, chats: convs, guardados });
});

router.post('/history', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  req.body.clientId = _lin.clientId;
  const lineId = _lin.lineId;
  const L = lineaSql(lineId);
  const { clientId, messages, archived_phones } = req.body;
  res.json({ ok: true }); // Responder rápido

  // Marcar como archivadas las conversaciones que están archivadas en WhatsApp
  if (Array.isArray(archived_phones) && archived_phones.length) {
    pool.query(
      `UPDATE conversations SET archived = true
       WHERE client_id = $1 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L} AND customer_phone = ANY($2::text[])`,
      [clientId, archived_phones]
    ).catch(err => console.error('[QR history] error marcando archivados:', err.message));
  }

  if (!Array.isArray(messages) || !messages.length) return;

  try {
    // Agrupar mensajes por teléfono
    const byPhone = {};
    for (const m of messages) {
      if (!byPhone[m.phone]) byPhone[m.phone] = [];
      byPhone[m.phone].push(m);
    }

    let saved = 0;
    for (const [phone, msgs] of Object.entries(byPhone)) {
      try {
      // Buscar o crear conversación
      let convResult = await pool.query(
        `SELECT id FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L} ORDER BY created_at DESC LIMIT 1`,
        [clientId, phone]
      );
      let convId;
      if (convResult.rows.length) {
        convId = convResult.rows[0].id;
      } else {
        const newConv = await pool.query(
          `INSERT INTO conversations (line_id, client_id, customer_phone, customer_name, channel, status, source) VALUES (${L}, $1,$2,$3,'whatsapp','bot','qr') RETURNING id`,
          [clientId, phone, phone]
        );
        convId = newConv.rows[0].id;
      }

      // Insertar mensajes que no existan ya (evitar duplicados por timestamp+role+content)
      for (const m of msgs) {
        const ins = await pool.query(
          `INSERT INTO messages (conversation_id, role, content, timestamp, origin)
           SELECT $1::uuid, $2::varchar, $3::text, $4::timestamp, 'import'
           WHERE NOT EXISTS (
             SELECT 1 FROM messages
             WHERE conversation_id = $1::uuid AND role = $2::varchar AND content = $3::text
               AND ABS(EXTRACT(EPOCH FROM (timestamp - $4::timestamp))) < 5
           )`,
          [convId, m.role, m.text, m.timestamp]
        );
        saved += ins.rowCount;
      }
      // Reflejar la fecha del último mensaje real en la conversación (para ordenar bien)
      await pool.query(
        `UPDATE conversations SET updated_at = (SELECT MAX(timestamp) FROM messages WHERE conversation_id = $1::uuid) WHERE id = $1::uuid`,
        [convId]
      );
      } catch (convErr) {
        console.error(`[QR history] error en conversación ${phone}:`, convErr.message);
      }
    }

    // Re-aplicar archivados (por si las conversaciones se crearon en este mismo lote)
    if (Array.isArray(archived_phones) && archived_phones.length) {
      await pool.query(
        `UPDATE conversations SET archived = true
         WHERE client_id = $1 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L} AND customer_phone = ANY($2::text[])`,
        [clientId, archived_phones]
      ).catch(err => console.error('[QR history] error marcando archivados:', err.message));
    }

    console.log(`[QR history v2] clientId=${clientId} — recibidos: ${messages.length}, guardados: ${saved}`);
  } catch (err) {
    console.error('Error procesando historial QR:', err.message);
  }
});

// El microservicio reenvía mensajes entrantes para que la IA los procese
// Limpieza de soporte: borra conversaciones de WhatsApp importadas sin marca
// (anteriores a la columna source). Protegido por el secret del servicio.
router.post('/purge-legacy', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  req.body.clientId = _lin.clientId;
  const lineId = _lin.lineId;
  const L = lineaSql(lineId);
  const { clientId } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
  try {
    const del = await pool.query(
      `DELETE FROM conversations WHERE client_id = $1 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L}`,
      [clientId]
    );
    console.log(`[QR purge-legacy] clientId=${clientId} — ${del.rowCount} conversaciones eliminadas`);
    res.json({ ok: true, deleted: del.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contactos: reemplazar JIDs @lid por el número real y guardar nombres
router.post('/contacts', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  req.body.clientId = _lin.clientId;
  const lineId = _lin.lineId;
  const L = lineaSql(lineId);
  const { clientId, items } = req.body;
  res.json({ ok: true });
  if (!Array.isArray(items) || !items.length) return;
  try {
    let renamed = 0;
    for (const { phone, lid, name } of items) {
      try {
        if (lid && phone) {
          const lidConv = await pool.query(
            `SELECT id FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L} LIMIT 1`,
            [clientId, lid]
          );
          if (lidConv.rows.length) {
            const phoneConv = await pool.query(
              `SELECT id FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L} LIMIT 1`,
              [clientId, phone]
            );
            if (phoneConv.rows.length) {
              // Ya existe una conversación con el número real: fusionar
              await pool.query('UPDATE messages SET conversation_id = $1 WHERE conversation_id = $2', [phoneConv.rows[0].id, lidConv.rows[0].id]);
              await pool.query('DELETE FROM conversations WHERE id = $1', [lidConv.rows[0].id]);
            } else {
              await pool.query('UPDATE conversations SET customer_phone = $1 WHERE id = $2', [phone, lidConv.rows[0].id]);
            }
            renamed++;
          }
        }
        if (name && phone) {
          await pool.query(
            `UPDATE conversations SET customer_name = $1
             WHERE client_id = $2 AND customer_phone = $3 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L}
               AND (customer_name IS NULL OR customer_name = customer_phone OR customer_name IN ('Cliente', 'Usuario'))`,
            [name, clientId, phone]
          );
        }
      } catch (itemErr) {
        console.error('[QR contacts] error item:', itemErr.message);
      }
    }
    console.log(`[QR contacts] clientId=${clientId} — ${items.length} contactos, ${renamed} lid→número`);
  } catch (err) {
    console.error('[QR contacts] error:', err.message);
  }
});

async function qrPost(clientId, accion, body) {
  return axios.post(`${QR_SERVICE_URL}/session/${clientId}/${accion}`, { ...body, secret: SERVICE_SECRET }, { headers: qrHeaders(), timeout: 300000 });
}

// Etiquetas de WhatsApp Business de la línea, cacheadas 5 minutos por cliente.
const labelsCache = {};
async function labelsDeLinea(clientId) {
  const c = labelsCache[clientId];
  if (c && Date.now() - c.at < 5 * 60 * 1000) return c.list;
  try {
    const r = await axios.get(`${QR_SERVICE_URL}/session/${clientId}/labels`, { headers: qrHeaders(), timeout: 20000 });
    const list = (r.data.labels || []).map((l) => l.name);
    labelsCache[clientId] = { at: Date.now(), list };
    return list;
  } catch (_) {
    return c ? c.list : [];
  }
}

// Etiquetas disponibles de la línea (para el panel de configuración)
router.get('/labels', authMiddleware, async (req, res) => {
  if (!QR_SERVICE_URL) return res.json({ labels: [], connected: false });
  delete labelsCache[req.client.id];
  const list = await labelsDeLinea(req.client.id);
  res.json({ labels: list, connected: list.length > 0 });
});

// Mensaje entrante por QR → la IA responde y ejecuta lo que pida (recursos, etiquetas, archivar)
router.post('/message', checkServiceSecret, async (req, res) => {
  const sesion = req.body.clientId;
  const _lin = await resolverSesion(sesion);
  req.body.clientId = _lin.clientId;
  const lineId = _lin.lineId;
  const L = lineaSql(lineId);
  const { clientId, from, name, labels, audio, waId, mediaType, savedName, pendingTranscription } = req.body;
  if (savedName) {
    await pool.query(
      `UPDATE conversations SET customer_name = $3 WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L}`,
      [req.body.clientId, from, savedName]
    ).catch(() => {});
  }
  let { text } = req.body;
  if (!clientId || !from || !text) return res.status(400).json({ error: 'faltan datos' });

  try {
    // Nota de voz que el servicio QR no pudo transcribir en la PC: la transcribimos en la nube
    if (audio && audio.data) {
      const { transcribeAudio } = require('../services/voice');
      const dicho = await transcribeAudio(Buffer.from(audio.data, 'base64'), audio.mimetype || 'audio/ogg');
      if (dicho) text = `[Audio del cliente]: ${dicho}`;
    }

    const cr = await pool.query('SELECT whatsapp_mode FROM clients WHERE id = $1', [clientId]);
    if (!lineId && (!cr.rows.length || cr.rows[0].whatsapp_mode !== 'qr')) {
      return res.json({ ok: true, skipped: 'el cliente no tiene el QR como canal activo' });
    }

    const cfgRes = await pool.query('SELECT label_instructions, whatsapp_actions_enabled, qr_auto_reply, sales_steps, sales_steps_enabled FROM bot_configs WHERE client_id = $1', [clientId]);
    const cfg = cfgRes.rows[0] || {};
    // Línea de soporte: sin pasos de venta (el bot de soporte usa su propio prompt)
    if (_lin.line && _lin.line.kind === 'soporte') cfg.sales_steps_enabled = false;

    // Si el cliente vuelve a escribir, el chat deja de estar archivado en Waibo
    // (WhatsApp también lo desarchiva solo al recibir un mensaje).
    await pool.query(
      `UPDATE conversations SET archived = false WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L} AND archived = true`,
      [clientId, from]
    );

    // Bot apagado: solo guardamos el mensaje para verlo en el panel, nadie responde.
    const botPrendido = lineId ? !!_lin.line.bot_enabled : !!cfg.qr_auto_reply;
    // Audio que se está transcribiendo: se guarda ya y el bot contesta cuando llega el texto (/transcript)
    if (!botPrendido || pendingTranscription) {
      let conv = await pool.query(
        `SELECT id FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L} ORDER BY created_at DESC LIMIT 1`,
        [clientId, from]
      );
      let convId = conv.rows[0]?.id;
      if (!convId) {
        const nc = await pool.query(
          `INSERT INTO conversations (line_id, client_id, customer_phone, customer_name, channel, status) VALUES (${L}, $1,$2,$3,'whatsapp','bot') RETURNING id`,
          [clientId, from, name || from]
        );
        convId = nc.rows[0].id;
      }
      await pool.query(`INSERT INTO messages (conversation_id, role, content, wa_id, media_type) VALUES ($1, 'user', $2, $3, $4)`, [convId, text, waId || null, mediaType || null]);
      await pool.query('UPDATE conversations SET updated_at = NOW(), recontact_count = 0, recontact_hold_until = NULL WHERE id = $1', [convId]);
      if (Array.isArray(labels) && labels.length) {
        await pool.query(`UPDATE conversations SET tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags, '{}') || $2::text[])) WHERE id = $1`, [convId, labels]);
      }
      require('../services/heat').clasificarTemperatura(convId).catch(() => {});
      return res.json({ ok: true, stored: true });
    }

    // Las etiquetas que el chat ya tiene en WhatsApp se reflejan como tags en Waibo
    if (Array.isArray(labels) && labels.length) {
      await pool.query(
        `UPDATE conversations SET tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags, '{}') || $3::text[]))
         WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L}`,
        [clientId, from, labels]
      );
    }

    const sendFn = (phone, message) => qrPost(sesion, 'send', { to: phone, message });

    const brain = await require('../services/lines').cerebroDe(clientId, lineId);
    if (brain && brain.label_instructions) cfg.label_instructions = brain.label_instructions;
    if (brain && brain.kind === 'soporte') cfg.sales_steps_enabled = false;
    const { buildSalesExtras } = require('../services/salesActions');
    const extras = buildSalesExtras({
      clientId, to: from, cfg, brainId: brain ? brain.id : null,
      channel: {
        sendText: (t) => qrPost(sesion, 'send', { to: from, message: t }),
        sendMedia: (rec, caption) => qrPost(sesion, 'send-media', {
          to: from, mimetype: rec.mimetype, data: rec.data.toString('base64'),
          filename: rec.filename, caption: caption || '', asVoice: rec.kind === 'audio'
        }),
        applyLabel: (name) => qrPost(sesion, 'label', { to: from, label: name }),
        archive: () => qrPost(sesion, 'archive', { to: from }),
        labels: () => labelsDeLinea(sesion)
      }
    });

    // Se contesta al servicio QR enseguida: la respuesta puede tardar minutos por la demora configurada.
    res.json({ ok: true });
    await processIncomingMessage(clientId, from, name || 'Cliente', text, sendFn, { ...extras, messageMeta: { waId, mediaType }, lineId, line: _lin.line, brain });
    const cv = await pool.query(`SELECT id FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' AND line_id IS NOT DISTINCT FROM ${L} ORDER BY created_at DESC LIMIT 1`, [clientId, from]);
    if (cv.rows[0]) require('../services/heat').clasificarTemperatura(cv.rows[0].id).catch(() => {});
  } catch (err) {
    console.error('Error procesando mensaje QR:', err.stack || err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
