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

module.exports = { resolverSesion, sesionDe, lineaSql };
