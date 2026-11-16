// Notificaciones al celular (Web Push) cuando escribe un cliente
const webpush = require('web-push');
const pool = require('../db');

const listo = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (listo) webpush.setVapidDetails('mailto:hola@waibochat.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

// A quién le llega: si el chat tiene vendedor, solo a él; si no, al dueño y a los
// vendedores que atienden esa línea
async function avisarMensaje({ clientId, conversationId, lineId, nombre, texto }) {
  if (!listo) return;
  try {
    const conv = (await pool.query('SELECT assigned_to FROM conversations WHERE id = $1', [conversationId])).rows[0];
    if (!conv) return;
    const linea = lineId || 'principal';
    const subs = (await pool.query(
      `SELECT id, endpoint, keys FROM push_subs WHERE client_id = $1 AND (
         ($2::uuid IS NOT NULL AND user_id = $2::uuid) OR
         ($2::uuid IS NULL AND (user_id = $1 OR user_id IN (
            SELECT id FROM clients WHERE owner_id = $1 AND (line_ids IS NULL OR $3 = ANY(line_ids))))))`,
      [clientId, conv.assigned_to || null, linea])).rows;
    const cuerpo = JSON.stringify({
      title: nombre || 'Cliente',
      body: String(texto || '').replace(/^\[Audio del cliente\]:\s*/, '🎤 ').slice(0, 140) || 'Mensaje nuevo',
      tag: conversationId,
      url: `/inbox?chat=${conversationId}`
    });
    await Promise.all(subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, cuerpo, { TTL: 3600 })
      .catch((e) => {
        if (e.statusCode === 404 || e.statusCode === 410) return pool.query('DELETE FROM push_subs WHERE id = $1', [s.id]);
      })));
  } catch (e) {
    console.error('[push]', e.message);
  }
}

module.exports = { avisarMensaje, listo };
