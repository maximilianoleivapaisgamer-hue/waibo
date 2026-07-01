# 📖 WhaBot v1.0 — Manual completo

## PARTE 1 — Variables de entorno necesarias

Ver backend/.env.example para la lista completa. Las más importantes:
- ENCRYPTION_KEY (generarla antes que nada)
- ANTHROPIC_API_KEY
- WHATSAPP_API_KEY / WHATSAPP_API_URL (360dialog)
- FACEBOOK_APP_ID / SECRET (sirve para Instagram y Facebook)
- ML_APP_ID / SECRET
- TIENDANUBE_CLIENT_ID / SECRET
- GOOGLE_CLIENT_ID / SECRET
- TIKTOK_CLIENT_KEY / SECRET
- MERCADOPAGO_ACCESS_TOKEN

## PARTE 2 — Deploy del backend (Railway)
\`\`\`bash
cd backend
npm install
railway login
railway init
railway up
\`\`\`
Completar las variables de entorno en Railway → Settings → Variables.

## PARTE 3 — Deploy del frontend (Vercel)
\`\`\`bash
cd frontend
npm install -g vercel
vercel
\`\`\`
Configurar NEXT_PUBLIC_API_URL en Vercel → Settings → Environment Variables.
Volver a Railway y completar FRONTEND_URL con la URL de Vercel.

## PARTE 4 — Crear las apps externas (una sola vez, no por cliente)
- Meta for Developers (sirve para Instagram y Facebook)
- Mercado Libre Developers
- Tiendanube Partners
- Google Cloud Console (Calendar API)
- TikTok for Developers (aprobación 3-4 semanas)
- MercadoPago Developers

URLs de callback a configurar en cada una:
\`\`\`
https://tu-backend.railway.app/api/instagram/callback
https://tu-backend.railway.app/api/facebook/callback
https://tu-backend.railway.app/api/mercadolibre/callback
https://tu-backend.railway.app/api/tiendanube/callback
https://tu-backend.railway.app/api/agenda/callback
https://tu-backend.railway.app/api/tiktok/callback
\`\`\`

## PARTE 5 — Cómo se conecta un cliente nuevo
1. Se registra en /register
2. Conecta WhatsApp (360dialog — requiere verificación de Meta Business, 2-7 días hábiles) o usa el modo QR temporal mientras espera
3. Conecta los canales que necesite (OAuth, con su propia cuenta — vos no tocás nada en Railway)
4. Carga su info de negocio, menú (si aplica), base de conocimiento
5. Se suscribe a un plan (MercadoPago automático, pago único, o transferencia)

## PARTE 6 — Administración del SaaS
Pago manual de emergencia (además de MercadoPago/transferencia automáticos):
\`\`\`bash
curl -X POST https://tu-backend.railway.app/api/billing/pay/CLIENT_ID \\
  -H "x-admin-key: TU_ADMIN_SECRET_KEY"
\`\`\`

Revisar comprobantes de transferencia pendientes:
\`\`\`bash
curl https://tu-backend.railway.app/api/bank-transfer/admin/pending \\
  -H "x-admin-key: TU_ADMIN_SECRET_KEY"
\`\`\`

## PARTE 7 — Problemas comunes
**"Cannot connect to database"** → Verificar DATABASE_URL en Railway
**"401 de Anthropic"** → Verificar ANTHROPIC_API_KEY y saldo
**Webhook no recibe mensajes** → Verificar WEBHOOK_VERIFY_TOKEN igual en Railway y en cada plataforma
**Tokens no desencriptan** → Verificar que ENCRYPTION_KEY no haya cambiado desde que se guardaron
