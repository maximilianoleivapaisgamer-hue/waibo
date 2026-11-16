const pool = require('../db');

/*
 * Líneas de WhatsApp por QR. Cada cuenta tiene su línea principal (la de siempre, cuya
 * sesión en el servicio QR se llama como el id de la cuenta y cuyos chats tienen
 * line_id = NULL) y puede sumar líneas extra (Ventas, Soporte...), cuya sesión se llama
 * como el id de la línea.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El servicio QR solo conoce "sesiones": esto dice de qué cuenta y de qué línea es una.
async function resolverSesion(sesion) {
  if (sesion && UUID.test(sesion)) {
    const r = await pool.query('SELECT * FROM wa_lines WHERE id = $1', [sesion]);
    if (r.rows[0]) return { clientId: r.rows[0].client_id, lineId: r.rows[0].id, line: r.rows[0] };
  }
  return { clientId: sesion, lineId: null, line: null };
}

// Sesión del servicio QR para una línea (null = la principal)
function sesionDe(clientId, lineId) {
  return lineId || clientId;
}

// Fragmento SQL para comparar line_id (el id ya viene validado de la base)
function lineaSql(lineId) {
  if (!lineId) return 'NULL::uuid';
  if (!UUID.test(lineId)) throw new Error('línea inválida');
  return `'${lineId}'::uuid`;
}

// Cerebro que atiende una línea (null = el principal, o sea bot_configs)
async function cerebroDe(clientId, lineId) {
  let id = null;
  if (lineId) id = (await pool.query('SELECT brain_id FROM wa_lines WHERE id = $1', [lineId])).rows[0]?.brain_id || null;
  else id = (await pool.query('SELECT main_brain_id FROM clients WHERE id = $1', [clientId])).rows[0]?.main_brain_id || null;
  if (!id) return null;
  return (await pool.query('SELECT * FROM brains WHERE id = $1 AND client_id = $2', [id, clientId])).rows[0] || null;
}

// "?brain=" de un pedido del panel → id de cerebro de la cuenta, o null (principal)
async function cerebroPedido(req) {
  const b = req.query.brain || req.body?.brain;
  if (!b || b === 'principal' || !UUID.test(b)) return null;
  const r = await pool.query('SELECT id FROM brains WHERE id = $1 AND client_id = $2', [b, req.client.id]);
  return r.rows[0]?.id || null;
}

module.exports = { resolverSesion, sesionDe, lineaSql, cerebroDe, cerebroPedido };
