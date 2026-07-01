# 🚀 WhaBot — Guía rápida de instalación

## Paso 0 — Generar la clave de encriptación
\`\`\`bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
\`\`\`
Guardala — la necesitás como ENCRYPTION_KEY en Railway.

## Paso 1 — Base de datos
Railway → New Project → PostgreSQL → copiar DATABASE_URL

## Paso 2 — Backend
\`\`\`bash
cd backend
npm install
railway up
\`\`\`
Completar todas las variables de entorno (ver .env.example)

## Paso 3 — Frontend
\`\`\`bash
cd frontend
npm install
vercel --prod
\`\`\`

## Paso 4 — Conectar todo
Crear las apps en Meta, Mercado Libre, Tiendanube, Google, TikTok, MercadoPago (una sola vez). Configurar las URLs de callback con tu dominio de Railway.

## Paso 5 — Probar con un cliente de prueba
Antes de dar de alta clientes reales, registrate vos mismo como una cuenta de prueba y probá el flujo completo: conectar WhatsApp (o modo QR), cargar info/menú, mandarte un mensaje de prueba.

## Paso 6 — Dominio propio (opcional, después de probar)
Vercel/Railway → Settings → Domains → agregar tu dominio. Actualizar APP_URL y FRONTEND_URL, y las URLs de callback en cada app externa.
