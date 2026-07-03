const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Si es empleado, el client_id efectivo es el del dueño
    req.client = {
      ...decoded,
      id: decoded.role === 'employee' ? decoded.owner_id : decoded.id,
      own_id: decoded.id,
    };
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
};
