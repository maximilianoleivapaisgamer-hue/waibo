const pool = require('../db');
const { buildInstructions, buildSalesInstructions } = require('./whatsappActions');

/*
 * Recursos, etiquetas, archivado y pasos de venta, iguales para cualquier conexión de
 * WhatsApp. Cada canal solo aporta cómo se hace cada cosa:
 *   sendText(text), sendMedia(rec)  → obligatorios
 *   applyLabel(name), archive()     → opcionales (el QR los refleja en el celular;
 *                                     la API oficial de Meta no tiene etiquetas ni archivado,
 *                                     ahí quedan solo en Waibo)
 *   labels()                        → etiquetas disponibles
 */
function buildSalesExtras({ clientId, to, cfg, channel }) {
  if (cfg.whatsapp_actions_enabled === false) return {};
  const pasos = cfg.sales_steps_enabled && Array.isArray(cfg.sales_steps) ? cfg.sales_steps.filter((p) => p && p.title) : [];

  return {
    buildInstructions: async (conversation) => {
      const recs = await pool.query('SELECT id, name, description, kind FROM bot_resources WHERE client_id = $1 ORDER BY created_at', [clientId]);
      const labels = [...new Set([...(await channel.labels()), ...pasos.map((p) => p.label).filter(Boolean)])];
      const base = buildInstructions({
        resources: recs.rows,
        alreadySent: conversation.sent_resources || [],
        labels,
        labelInstructions: cfg.label_instructions || ''
      });
      if (!pasos.length) return base;
      // El paso 1 es la apertura: solo va al que nunca recibió un mensaje nuestro. Si en el chat
      // ya hay un saliente (del bot, importado o escrito a mano), se arranca desde el paso 2.
      if (!(conversation.sales_step > 0) && pasos.length > 1) {
        const saliente = await pool.query(`SELECT 1 FROM messages WHERE conversation_id = $1 AND role = 'assistant' LIMIT 1`, [conversation.id]);
        if (saliente.rows.length) {
          await pool.query('UPDATE conversations SET sales_step = 1 WHERE id = $1 AND COALESCE(sales_step, 0) = 0', [conversation.id]);
          conversation.sales_step = 1;
        }
      }
      return base + buildSalesInstructions({ steps: pasos, current: conversation.sales_step || 0, resources: recs.rows });
    },

    onActions: async (actions, conversation) => {
      // Marcar el paso como hecho dispara su recurso y su etiqueta; mandar el recurso del
      // paso también cuenta como hecho, por si la IA se olvidó del token.
      const paso = pasos[conversation.sales_step || 0];
      if (paso) {
        const hecho = actions.some((a) => a.type === 'paso' || (a.type === 'enviar' && paso.resource_id && a.id === paso.resource_id));
        if (hecho) {
          const extra = [];
          if (paso.resource_id && !actions.some((a) => a.type === 'enviar' && a.id === paso.resource_id)) extra.push({ type: 'enviar', id: paso.resource_id });
          if (paso.label && !actions.some((a) => a.type === 'etiqueta' && a.name === paso.label)) extra.push({ type: 'etiqueta', name: paso.label });
          const archivar = actions.filter((a) => a.type === 'archivar');
          actions = [...actions.filter((a) => a.type !== 'archivar'), ...extra, ...archivar];
          await pool.query('UPDATE conversations SET sales_step = COALESCE(sales_step, 0) + 1 WHERE id = $1', [conversation.id]);
          console.log(`[pasos] ${clientId} ${to}: paso ${(conversation.sales_step || 0) + 1} "${paso.title}" hecho`);
        }
      }

      for (const a of actions) {
        try {
          if (a.type === 'enviar') {
            if ((conversation.sent_resources || []).includes(a.id)) continue;
            const r = await pool.query('SELECT * FROM bot_resources WHERE id = $1 AND client_id = $2', [a.id, clientId]);
            const rec = r.rows[0];
            if (!rec) continue;
            const delPaso = paso && paso.resource_id === a.id ? paso : null;
            if (rec.kind === 'link') await channel.sendText(rec.url);
            else await channel.sendMedia(rec, delPaso?.caption || '');
            await pool.query(
              `UPDATE conversations SET sent_resources = array_append(COALESCE(sent_resources, '{}'), $2) WHERE id = $1`,
              [conversation.id, a.id]
            );
            await pool.query('INSERT INTO messages (conversation_id, role, content, resource_id, media_type) VALUES ($1,$2,$3,$4,$5)',
              [conversation.id, 'assistant', `${rec.kind === 'audio' ? '🎙️' : '📎'} ${rec.name}`, rec.id, rec.kind]);
            if (delPaso?.after_text) {
              await channel.sendText(delPaso.after_text);
              await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)', [conversation.id, 'assistant', delPaso.after_text]);
            }
          } else if (a.type === 'etiqueta') {
            if (channel.applyLabel) await channel.applyLabel(a.name);
            await pool.query(
              `UPDATE conversations SET tags = array_append(COALESCE(tags, '{}'), $2::text)
               WHERE id = $1 AND NOT (COALESCE(tags, '{}') @> ARRAY[$2::text])`,
              [conversation.id, a.name]
            );
          } else if (a.type === 'derivar') {
            const { createAlert } = require('./alerts');
            await pool.query(`UPDATE conversations SET status = 'human' WHERE id = $1`, [conversation.id]);
            const quien = conversation.customer_name && conversation.customer_name !== to ? `${conversation.customer_name} (${to})` : to;
            await createAlert(clientId, conversation.id, 'human_requested', `${quien} necesita que lo atiendas vos${a.name ? ': ' + a.name : ''}`);
          } else if (a.type === 'archivar') {
            if (channel.archive) await channel.archive();
            await pool.query('UPDATE conversations SET archived = true WHERE id = $1', [conversation.id]);
          } else {
            continue;
          }
          console.log(`[acción] ${clientId} ${to}: ${a.type} ${a.id || a.name || ''}`);
        } catch (e) {
          console.error(`[acción] ${a.type} falló:`, e.response?.data?.error || e.message);
        }
      }
    }
  };
}

// Etiquetas que ya usa el negocio en Waibo (para canales sin etiquetas propias)
async function waiboLabels(clientId) {
  const r = await pool.query(
    `SELECT DISTINCT unnest(tags) AS t FROM conversations WHERE client_id = $1 AND tags IS NOT NULL LIMIT 50`,
    [clientId]
  );
  return r.rows.map((x) => x.t).filter(Boolean);
}

module.exports = { buildSalesExtras, waiboLabels };
