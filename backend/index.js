require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

app.use(cors());
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.' },
  standardHeaders: true,
  legacyHeaders: false
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: 'Demasiadas solicitudes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: { error: 'Demasiadas solicitudes. Esperá un momento.' },
  standardHeaders: true,
  legacyHeaders: false
});

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const webhookRoutes = require('./routes/webhook');
const botRoutes = require('./routes/bot');
const instagramRoutes = require('./routes/instagram');
const facebookRoutes = require('./routes/facebook');
const knowledgeRoutes = require('./routes/knowledge');
const billingRoutes = require('./routes/billing');
const mercadolibreRoutes = require('./routes/mercadolibre');
const tiendanubeRoutes = require('./routes/tiendanube');
const agendaRoutes = require('./routes/agenda');
const tiktokRoutes = require('./routes/tiktok');
const ordersRoutes = require('./routes/orders');
const whatsappQRRoutes = require('./routes/whatsappQR');
const mercadopagoRoutes = require('./routes/mercadopago');
const bankTransferRoutes = require('./routes/bankTransfer');
const privacyRoutes = require('./routes/privacy');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/clients', apiLimiter, clientRoutes);
app.use('/api/bot', apiLimiter, botRoutes);
app.use('/api/instagram', apiLimiter, instagramRoutes);
app.use('/api/facebook', apiLimiter, facebookRoutes);
app.use('/api/knowledge', apiLimiter, knowledgeRoutes);
app.use('/api/billing', apiLimiter, billingRoutes);
app.use('/api/mercadolibre', apiLimiter, mercadolibreRoutes);
app.use('/api/tiendanube', apiLimiter, tiendanubeRoutes);
app.use('/api/agenda', apiLimiter, agendaRoutes);
app.use('/api/tiktok', apiLimiter, tiktokRoutes);
app.use('/api/orders', apiLimiter, ordersRoutes);
app.use('/api/whatsapp-qr', apiLimiter, whatsappQRRoutes);
app.use('/api/mercadopago', apiLimiter, mercadopagoRoutes);
app.use('/api/bank-transfer', apiLimiter, bankTransferRoutes);
app.use('/webhook', webhookLimiter, webhookRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'WhaBot API running', version: '1.0.0' });
});

require('./services/cronjobs');

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ WhaBot backend v1.0.0 corriendo en puerto ${PORT}`);
});
