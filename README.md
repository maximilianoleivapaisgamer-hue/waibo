# 💬 WhaBot — Bot de WhatsApp con IA

Plataforma SaaS para vender bots de WhatsApp, Instagram, Facebook, TikTok y Mercado Libre con inteligencia artificial a negocios y locales comerciales.

## Stack
- Backend: Node.js + Express + PostgreSQL
- Frontend: Next.js (React)
- IA: Claude API (Anthropic) — Haiku por defecto, Sonnet opcional
- Pagos: MercadoPago (suscripción automática y pago único) + transferencia bancaria con comprobante
- WhatsApp: 360dialog API oficial, o modo QR temporal (Baileys) mientras se aprueba la cuenta oficial

## Antes de arrancar
1. Generá tu ENCRYPTION_KEY: \`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\`
2. Completá backend/.env con tus credenciales reales (ver .env.example)
3. Completá frontend/.env con NEXT_PUBLIC_API_URL

## Instalación local
\`\`\`bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
\`\`\`

## Estructura
\`\`\`
whabot/
├── backend/    ← API y lógica del bot
├── frontend/   ← Panel web para clientes
├── CONTEXTO.md
├── MANUAL_COMPLETO.md
└── GUIA_INSTALACION.md
\`\`\`
