const express = require('express');
const router = express.Router();
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
  if (!QR_SERVICE_URL) {
    return res.json({ status: 'unavailable', qr: null, auto_reply });
  }
  try {
    const r = await axios.get(`${QR_SERVICE_URL}/session/${req.client.id}/status`, { headers: qrHeaders() });
    res.json({ ...r.data, auto_reply });
  } catch {
    res.json({ status: 'disconnected', qr: null, auto_reply });
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
  const del = await pool.query(
    `DELETE FROM conversations WHERE client_id = $1 AND source = 'qr'`,
    [req.client.id]
  );
  console.log(`[QR disconnect] clientId=${req.client.id} — ${del.rowCount} conversaciones importadas eliminadas`);
  await pool.query(`UPDATE clients SET whatsapp_mode = 'api' WHERE id = $1`, [req.client.id]);
  res.json({ success: true, deleted_conversations: del.rowCount });
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
router.post('/connected', checkServiceSecret, async (req, res) => {
  const { clientId, phone } = req.body;
  try {
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
  const { clientId, items } = req.body;
  res.json({ ok: true });
  if (!Array.isArray(items) || !items.length) return;
  try {
    for (const { phone, label } of items) {
      if (!phone || !label) continue;
      await pool.query(
        `UPDATE conversations
         SET tags = array_append(COALESCE(tags, '{}'), $3::text)
         WHERE client_id = $1 AND channel = 'whatsapp' AND customer_phone = $2
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
        `SELECT id, customer_name FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' ORDER BY created_at DESC LIMIT 1`,
        [clientId, phone]
      );
      let convId = conv.rows[0]?.id;
      if (!convId) {
        const nc = await pool.query(
          `INSERT INTO conversations (client_id, customer_phone, customer_name, channel, status, created_at)
           VALUES ($1,$2,$3,'whatsapp','bot',$4::timestamp) RETURNING id`,
          [clientId, phone, c.name || phone, primero]
        );
        convId = nc.rows[0].id;
      } else if (c.name && (!conv.rows[0].customer_name || conv.rows[0].customer_name === phone || conv.rows[0].customer_name === 'Cliente')) {
        await pool.query('UPDATE conversations SET customer_name = $1 WHERE id = $2', [c.name, convId]);
      }
      convs++;

      for (const m of msgs) {
        const ins = await pool.query(
          `INSERT INTO messages (conversation_id, role, content, timestamp, origin)
           SELECT $1::uuid, $2::varchar, $3::text, $4::timestamp, 'import'
           WHERE NOT EXISTS (
             SELECT 1 FROM messages
             WHERE conversation_id = $1::uuid AND role = $2::varchar AND content = $3::text
               AND ABS(EXTRACT(EPOCH FROM (timestamp - $4::timestamp))) < 5
           )`,
          [convId, m.role === 'assistant' ? 'assistant' : 'user', m.text, m.timestamp]
        );
        guardados += ins.rowCount;
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
  const { clientId, messages, archived_phones } = req.body;
  res.json({ ok: true }); // Responder rápido

  // Marcar como archivadas las conversaciones que están archivadas en WhatsApp
  if (Array.isArray(archived_phones) && archived_phones.length) {
    pool.query(
      `UPDATE conversations SET archived = true
       WHERE client_id = $1 AND channel = 'whatsapp' AND customer_phone = ANY($2::text[])`,
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
        `SELECT id FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' ORDER BY created_at DESC LIMIT 1`,
        [clientId, phone]
      );
      let convId;
      if (convResult.rows.length) {
        convId = convResult.rows[0].id;
      } else {
        const newConv = await pool.query(
          `INSERT INTO conversations (client_id, customer_phone, customer_name, channel, status, source) VALUES ($1,$2,$3,'whatsapp','bot','qr') RETURNING id`,
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
         WHERE client_id = $1 AND channel = 'whatsapp' AND customer_phone = ANY($2::text[])`,
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
  const { clientId } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
  try {
    const del = await pool.query(
      `DELETE FROM conversations WHERE client_id = $1 AND channel = 'whatsapp'`,
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
  const { clientId, items } = req.body;
  res.json({ ok: true });
  if (!Array.isArray(items) || !items.length) return;
  try {
    let renamed = 0;
    for (const { phone, lid, name } of items) {
      try {
        if (lid && phone) {
          const lidConv = await pool.query(
            `SELECT id FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' LIMIT 1`,
            [clientId, lid]
          );
          if (lidConv.rows.length) {
            const phoneConv = await pool.query(
              `SELECT id FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' LIMIT 1`,
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
             WHERE client_id = $2 AND customer_phone = $3 AND channel = 'whatsapp'
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
  return axios.post(`${QR_SERVICE_URL}/session/${clientId}/${accion}`, { ...body, secret: SERVICE_SECRET }, { headers: qrHeaders(), timeout: 90000 });
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
  const { clientId, from, name, text, labels } = req.body;
  if (!clientId || !from || !text) return res.status(400).json({ error: 'faltan datos' });

  try {
    const cr = await pool.query('SELECT whatsapp_mode FROM clients WHERE id = $1', [clientId]);
    if (!cr.rows.length || cr.rows[0].whatsapp_mode !== 'qr') {
      return res.json({ ok: true, skipped: 'el cliente no tiene el QR como canal activo' });
    }

    const cfgRes = await pool.query('SELECT label_instructions, whatsapp_actions_enabled, qr_auto_reply FROM bot_configs WHERE client_id = $1', [clientId]);
    const cfg = cfgRes.rows[0] || {};

    // Si el cliente vuelve a escribir, el chat deja de estar archivado en Waibo
    // (WhatsApp también lo desarchiva solo al recibir un mensaje).
    await pool.query(
      `UPDATE conversations SET archived = false WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' AND archived = true`,
      [clientId, from]
    );

    // Bot apagado: solo guardamos el mensaje para verlo en el panel, nadie responde.
    if (!cfg.qr_auto_reply) {
      let conv = await pool.query(
        `SELECT id FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp' ORDER BY created_at DESC LIMIT 1`,
        [clientId, from]
      );
      let convId = conv.rows[0]?.id;
      if (!convId) {
        const nc = await pool.query(
          `INSERT INTO conversations (client_id, customer_phone, customer_name, channel, status) VALUES ($1,$2,$3,'whatsapp','bot') RETURNING id`,
          [clientId, from, name || from]
        );
        convId = nc.rows[0].id;
      }
      await pool.query(`INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`, [convId, text]);
      await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [convId]);
      if (Array.isArray(labels) && labels.length) {
        await pool.query(`UPDATE conversations SET tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags, '{}') || $2::text[])) WHERE id = $1`, [convId, labels]);
      }
      return res.json({ ok: true, stored: true });
    }

    // Las etiquetas que el chat ya tiene en WhatsApp se reflejan como tags en Waibo
    if (Array.isArray(labels) && labels.length) {
      await pool.query(
        `UPDATE conversations SET tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags, '{}') || $3::text[]))
         WHERE client_id = $1 AND customer_phone = $2 AND channel = 'whatsapp'`,
        [clientId, from, labels]
      );
    }

    const sendFn = (phone, message) => qrPost(clientId, 'send', { to: phone, message });

    const extras = cfg.whatsapp_actions_enabled === false ? {} : {
      buildInstructions: async (conversation) => {
        const { buildInstructions } = require('../services/whatsappActions');
        const recs = await pool.query('SELECT id, name, description, kind FROM bot_resources WHERE client_id = $1 ORDER BY created_at', [clientId]);
        return buildInstructions({
          resources: recs.rows,
          alreadySent: conversation.sent_resources || [],
          labels: await labelsDeLinea(clientId),
          labelInstructions: cfg.label_instructions || ''
        });
      },
      onActions: async (actions, conversation) => {
        for (const a of actions) {
          try {
            if (a.type === 'enviar') {
              if ((conversation.sent_resources || []).includes(a.id)) continue;
              const r = await pool.query('SELECT * FROM bot_resources WHERE id = $1 AND client_id = $2', [a.id, clientId]);
              const rec = r.rows[0];
              if (!rec) continue;
              if (rec.kind === 'link') {
                await qrPost(clientId, 'send', { to: from, message: rec.url });
              } else {
                await qrPost(clientId, 'send-media', {
                  to: from, mimetype: rec.mimetype, data: rec.data.toString('base64'),
                  filename: rec.filename, caption: ''
                });
              }
              await pool.query(
                `UPDATE conversations SET sent_resources = array_append(COALESCE(sent_resources, '{}'), $2) WHERE id = $1`,
                [conversation.id, a.id]
              );
              await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)',
                [conversation.id, 'assistant', `📎 ${rec.name}`]);
            } else if (a.type === 'etiqueta') {
              await qrPost(clientId, 'label', { to: from, label: a.name });
              await pool.query(
                `UPDATE conversations SET tags = array_append(COALESCE(tags, '{}'), $2::text)
                 WHERE id = $1 AND NOT (COALESCE(tags, '{}') @> ARRAY[$2::text])`,
                [conversation.id, a.name]
              );
            } else if (a.type === 'archivar') {
              await qrPost(clientId, 'archive', { to: from });
              await pool.query('UPDATE conversations SET archived = true WHERE id = $1', [conversation.id]);
            }
            console.log(`[QR acción] ${clientId} ${from}: ${a.type} ${a.id || a.name || ''}`);
          } catch (e) {
            console.error(`[QR acción] ${a.type} falló:`, e.response?.data?.error || e.message);
          }
        }
      }
    };

    await processIncomingMessage(clientId, from, name || 'Cliente', text, sendFn, extras);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error procesando mensaje QR:', err.stack || err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
