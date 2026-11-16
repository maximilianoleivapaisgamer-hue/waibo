const jwt = require('jsonwebtoken');

/*
 * Los vendedores (rol employee) trabajan solo desde la Bandeja. Acá se les cierra todo lo
 * demás en el servidor, no solo en la pantalla: configuración del bot, IA, canales,
 * facturación, equipo. Si el token no es de un vendedor, no hace nada.
 */
const PERMITIDO = [
  /^\/api\/bot\/conversations(\/|$)/,
  /^\/api\/bot\/messages\/[^/]+\/media$/,
  /^\/api\/bot\/sellers$/,
  /^\/api\/bot\/quick-replies(\/|$)/,
  /^\/api\/whatsapp-qr\/status$/,
  /^\/api\/billing\/status$/,
  /^\/api\/auth\//,
  /^\/api\/clients\/me$/
];
// Dentro de los chats, lo que es del dueño
const SOLO_DUENO = [/\/assign$/];

module.exports = (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next();
  let datos;
  try { datos = jwt.verify(token, process.env.JWT_SECRET); } catch (_) { return next(); }
  if (datos.role !== 'employee') return next();
  const ruta = req.originalUrl.split('?')[0];
  if (ruta.startsWith('/api/clients/me') && req.method !== 'GET') return res.status(403).json({ error: 'Sin acceso' });
  if (!PERMITIDO.some((r) => r.test(ruta)) || SOLO_DUENO.some((r) => r.test(ruta))) {
    return res.status(403).json({ error: 'Los vendedores trabajan solo desde la Bandeja' });
  }
  next();
};
