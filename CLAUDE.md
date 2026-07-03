# CLAUDE.md — Waibo (ex-WhaBot)

> Fuente de verdad del proyecto para sesiones de Claude Code.
> Se actualiza automáticamente en cada avance importante, decisión de arquitectura o resolución de pendiente.
> Última actualización: 2026-07-02

---

## Qué es Waibo

**Waibo** es una plataforma SaaS multi-tenant argentina que provee chatbots de IA para PyMEs y negocios (concesionarias, comercios, profesionales independientes). Cada negocio cliente se registra, conecta sus propios canales de mensajería y el bot responde automáticamente usando IA (Claude de Anthropic).

- **Dominio público:** waibochat.com
- **Panel de clientes:** https://frontend-lac-nine-16.vercel.app
- **Backend API:** https://whabot-backend-production.up.railway.app
- **Modelo de negocio:** SaaS, planes en ARS con facturación mensual vía MercadoPago
- **Planes actuales:** Estándar ($59.999 ARS) y E-Commerce Pro ($129.999 ARS)
- **Público objetivo:** PyMEs argentinas que atienden clientes por WhatsApp, Instagram, Facebook o Mercado Libre

### Canales soportados

| Canal | Estado |
|---|---|
| WhatsApp Cloud API (Meta oficial) | ✅ Funcional |
| WhatsApp Lite — QR vía Baileys (no oficial) | ✅ Funcional, uso transitorio |
| Instagram DM + comentarios | ✅ Funcional |
| Facebook Messenger + comentarios + reseñas | ✅ Funcional |
| Mercado Libre (respuesta a preguntas) | ✅ Funcional |
| Tiendanube (catálogo + checkout) | ✅ Funcional |
| TikTok DMs | 🔜 Fase 4, pendiente |

---

## Historia del nombre

El proyecto se llamó **WhaBot** y se renombró a **Waibo** (dominio waibochat.com).

### Qué se actualizó (visible al usuario)
- `<h1>` en login y registro
- Logo del sidebar
- Instrucciones de Mercado Libre
- Notificaciones de WhatsApp al dueño del negocio (`🔔 *Waibo*`)
- Descripción y título de pagos en MercadoPago
- Nombres de archivos exportados: `waibo-conversaciones-*.csv`, `waibo-base-conocimiento-*.json`

### Qué se dejó intencionalmente sin cambiar (técnico interno)
- Token de verificación de webhook de Meta: `whabot2024` — cambiarlo durante el App Review podría cortar la integración
- Claves de localStorage: `whabot_token`, `whabot_client`
- Secrets internos: `whabot_qr_secret_2024`
- `package.json` name: `whabot-frontend`, `whabot-backend`
- User-Agent HTTP: `WhaBot/1.0`
- Nombre de base de datos en `.env.example`
- Nombres de funciones, variables internas y rutas de API

**Regla:** visible al usuario → Waibo. Técnico interno → se deja como está.

---

## Stack tecnológico

### Backend
- **Runtime:** Node.js + Express
- **Hosting:** Railway (`whabot-backend-production.up.railway.app`)
- **Base de datos:** PostgreSQL en Railway
- **Autenticación:** JWT (`Authorization: Bearer <token>`)
- **Cifrado de tokens OAuth:** AES-256-GCM (`backend/services/crypto.js`)
- **Scheduler:** node-cron
- **Rate limiting:** express-rate-limit (20 req/15min en auth, 120 req/min en API general, 60 req/min en webhooks)
- **Deploy:** `cd backend && railway up --detach`

### Frontend
- **Framework:** Next.js 14 (Pages Router)
- **Hosting:** Vercel
- **HTTP client:** axios
- **Sin estado global:** todo vía localStorage + llamadas a la API
- **Deploy:** `cd frontend && vercel --prod --yes`

### Microservicio QR (corre en la PC del admin, no en Railway)
- **Runtime:** Node.js + Express, puerto 3002
- **Librería WhatsApp:** @whiskeysockets/baileys
- **Exposición pública:** Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:3002`)
- **Ubicación:** `whatsapp-qr-service/index.js`
- **Limitación:** URL del tunnel cambia en cada reinicio → hay que actualizar `QR_SERVICE_URL` en Railway manualmente

### APIs externas usadas

| Servicio | Uso | Variable de entorno |
|---|---|---|
| Anthropic Claude (Haiku por defecto) | Generación de respuestas del bot | `ANTHROPIC_API_KEY` |
| OpenAI Whisper | Transcripción de notas de voz | `OPENAI_API_KEY` |
| Meta WhatsApp Cloud API | Envío/recepción mensajes WA oficial | tokens por cliente en DB |
| Meta Instagram Graph API | DMs + comentarios | tokens por cliente en DB |
| Meta Facebook Graph API | Messenger + comentarios + reseñas | tokens por cliente en DB |
| Mercado Libre API | Respuesta a preguntas de publicaciones | tokens por cliente en DB |
| Tiendanube API | Catálogo y sincronización de productos | tokens por cliente en DB |
| Google Calendar API | Agenda de turnos | tokens por cliente en DB |
| TikTok API | DMs | tokens por cliente en DB |
| MercadoPago API | Cobro de suscripciones y pagos | `MERCADOPAGO_ACCESS_TOKEN` |

---

## Estructura de carpetas

```
whabot/                                   ← raíz del repo git
├── CLAUDE.md                             ← este archivo
│
├── backend/
│   ├── index.js                          ← entry point: configura Express, CORS, rate limiting, monta todas las rutas
│   ├── db.js                             ← Pool de PostgreSQL + initDB() con todas las CREATE TABLE / ALTER TABLE
│   ├── .env.example                      ← plantilla de variables de entorno
│   ├── package.json                      ← dependencias del backend
│   │
│   ├── middleware/
│   │   └── auth.js                       ← valida JWT, carga req.client = { id, email }
│   │
│   ├── routes/
│   │   ├── auth.js                       ← POST /api/auth/register y /login
│   │   ├── clients.js                    ← GET/PUT /api/clients/me (perfil + credenciales WhatsApp)
│   │   ├── bot.js                        ← config, conversaciones, estadísticas, envío manual, exportación
│   │   ├── webhook.js                    ← webhooks de Meta (WhatsApp, Instagram, Facebook)
│   │   ├── whatsappQR.js                 ← proxy al microservicio QR + callbacks desde microservicio
│   │   ├── instagram.js                  ← OAuth + estado + log de comentarios/DMs
│   │   ├── facebook.js                   ← OAuth + estado + log de comentarios/reseñas/DMs
│   │   ├── mercadolibre.js               ← OAuth + estado + log + webhook de ML
│   │   ├── tiendanube.js                 ← OAuth + estado + sync + webhook de TN
│   │   ├── agenda.js                     ← OAuth Google + servicios + turnos + slots
│   │   ├── knowledge.js                  ← CRUD base de conocimiento (texto, URL scrape, archivos)
│   │   ├── billing.js                    ← estado de facturación, reactivación de clientes
│   │   ├── orders.js                     ← menú + pedidos + estados
│   │   ├── tiktok.js                     ← OAuth + estado + webhook de TikTok
│   │   ├── mercadopago.js                ← planes, suscripciones, pagos, webhook de MP
│   │   └── bankTransfer.js               ← subida de comprobantes de transferencia, revisión admin
│   │
│   ├── services/
│   │   ├── ai.js                         ← getAIResponse(): llama a Claude API con reintentos
│   │   ├── messageProcessor.js           ← processIncomingMessage(): lógica central de todos los canales
│   │   ├── crypto.js                     ← encrypt()/decrypt() AES-256-GCM para tokens OAuth
│   │   ├── whatsapp.js                   ← sendWhatsAppMessage() soporta cloud_api y 360dialog
│   │   ├── instagram.js                  ← sendInstagramDM(), replyToComment(), OAuth helpers
│   │   ├── facebook.js                   ← sendMessengerMessage(), replyToFacebookComment(), OAuth
│   │   ├── mercadolibre.js               ← OAuth, responder preguntas, mensaje post-venta, refresh tokens
│   │   ├── tiendanube.js                 ← OAuth, sync de productos, paginación
│   │   ├── tiktok.js                     ← OAuth, enviar DM, refresh tokens
│   │   ├── mercadopago.js                ← createSubscription(), createOneTimePayment(), estado, cancelar
│   │   ├── calendar.js                   ← OAuth Google, crear/borrar eventos en Calendar
│   │   ├── agenda.js                     ← handleBookingFlow(), getAvailableSlots()
│   │   ├── checkout.js                   ← handlePurchaseConfirmation(), rememberShownProduct()
│   │   ├── orders.js                     ← processMessageWithOrderDetection() con tool de Claude
│   │   ├── contactVariables.js           ← extracción de datos del cliente por IA (presupuesto, zona, etc.)
│   │   ├── scheduledFollowups.js         ← programar y enviar recordatorios de conversaciones
│   │   ├── alerts.js                     ← createAlert(), notificación al dueño por WhatsApp
│   │   ├── businessHours.js              ← isWithinBusinessHours() con timezone Argentina UTC-3
│   │   ├── voice.js                      ← downloadAndTranscribe() con OpenAI Whisper
│   │   ├── scraper.js                    ← scrapeURL() con Cheerio para la base de conocimiento
│   │   ├── phone.js                      ← normalizePhone(): normaliza formatos de teléfono
│   │   └── cronjobs.js                   ← crons: recordatorios turnos, morosidad, retención 24 meses, followups
│   │
│   └── scripts/
│       └── eliminar-datos-usuario.js     ← derecho al olvido Ley 25.326: node scripts/eliminar-datos-usuario.js +549...
│
├── frontend/
│   ├── package.json
│   ├── pages/
│   │   ├── _app.js                       ← wrapper Next.js (solo importa globals.css)
│   │   ├── index.js                      ← login (guarda whabot_token en localStorage)
│   │   ├── register.js                   ← registro de nuevo negocio
│   │   ├── dashboard.js                  ← estadísticas + últimas conversaciones + alertas (refresh cada 10s)
│   │   ├── conversations.js              ← panel de conversaciones: lista + chat + envío manual + tags + variables
│   │   ├── config.js                     ← configuración del bot: prompt, tono, horarios, followups, notificaciones
│   │   ├── channels.js                   ← conexión de canales: WA Lite primero, Cloud API segundo, Tiendanube, TikTok
│   │   ├── instagram.js                  ← estado + comentarios + DMs de Instagram
│   │   ├── facebook.js                   ← estado + comentarios + reseñas + DMs de Facebook
│   │   ├── mercadolibre.js               ← estado + estadísticas + log de preguntas/órdenes
│   │   ├── knowledge.js                  ← base de conocimiento: texto, URL, archivos PDF/TXT
│   │   ├── agenda.js                     ← Google Calendar + servicios + turnos + disponibilidad
│   │   ├── orders.js                     ← menú + pedidos con estados
│   │   ├── catalog.js                    ← catálogo de productos (Tiendanube)
│   │   ├── billing.js                    ← planes + suscripción MP + transferencia bancaria
│   │   ├── profile.js                    ← datos del negocio + logout
│   │   └── test-chat.js                  ← prueba del bot sin guardar en DB
│   │
│   ├── components/
│   │   └── Sidebar.js                    ← navegación lateral con todas las secciones y logout
│   │
│   └── styles/
│       └── globals.css                   ← variables CSS, layout dashboard, componentes UI
│
└── whatsapp-qr-service/
    ├── index.js                          ← microservicio Baileys con endpoints REST
    ├── package.json
    └── sessions/                         ← credenciales de sesiones (gitignored)
```

---

## Schema de base de datos

Todas las tablas se crean en `backend/db.js` mediante `initDB()` con `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. No hay migraciones separadas.

### Tablas y campos clave

**`clients`** — Negocios que usan Waibo
- `id` UUID PK, `name`, `email` UNIQUE, `password` (bcrypt), `business_name`, `phone_number`
- `whatsapp_api_key`, `whatsapp_phone_id`, `whatsapp_provider` ('360dialog'|'cloud_api')
- `whatsapp_mode` ('api'|'qr'), `plan`, `active`, `created_at`

**`bot_configs`** — Configuración del bot por cliente
- `client_id` FK, `system_prompt`, `business_info`, `welcome_message`, `human_handoff_keyword`
- `language`, `bot_name`, `bot_tone`, `ai_model`, `voice_enabled`
- `agenda_enabled`, `agenda_days`, `agenda_start/end_hour`, `reminder_hours_before`
- `business_hours_enabled`, `business_hours_start/end`, `business_hours_days`, `after_hours_message`
- `followup_enabled`, `followup_wait_minutes`, `followup_max_attempts`, `followup_message`
- `owner_notification_phone`, `owner_notifications_enabled`
- `variables_enabled`, `smart_scheduling_enabled`, `orders_enabled`
- `instagram_comment_keywords`, `facebook_comment_keywords`, `has_tested_bot`

**`conversations`** — Conversaciones por canal
- `id` UUID, `client_id` FK, `customer_phone`, `customer_name`
- `status` ('bot'|'human'), `channel` ('whatsapp'|'instagram'|'facebook'|'tiktok'|'mercadolibre')
- `channel_user_id`, `tags` TEXT[], `is_typing` BOOLEAN
- `followup_count`, `last_followup_at`, `created_at`, `updated_at`

**`messages`** — Mensajes individuales
- `id` UUID, `conversation_id` FK, `role` ('user'|'assistant'), `content` TEXT, `timestamp`

**`appointments`** — Turnos
- `customer_phone`, `customer_name`, `service_name`, `start_time`, `end_time`
- `status` ('confirmed'|'cancelled'), `reminder_sent` BOOLEAN, `google_event_id`, `notes`

**`orders`** — Pedidos
- `customer_name`, `customer_phone`, `items` JSONB, `total`, `delivery_type`, `delivery_address`
- `status` ('pendiente'|'preparando'|'listo'|'entregado'|'cancelado')

**`contact_variables`** — Datos extraídos por IA
- `client_id`, `customer_phone`, `field_name`, `field_value`
- UNIQUE en (client_id, customer_phone, field_name)

**`scheduled_followups`** — Recordatorios programados
- `customer_phone`, `channel`, `channel_user_id`, `scheduled_for`, `reason`, `message`
- `status` ('pending'|'sent'|'failed')

**`alerts`** — Alertas del sistema
- `type` (human_requested|ai_failed|low_stock|new_order|negative_review|transfer_pending_review)
- `message`, `resolved` BOOLEAN

**Tablas de tokens OAuth** (todos con `access_token` ENCRIPTADO AES-256-GCM)
- `instagram_tokens`: `page_id`, `page_name`, `access_token`, `instagram_account_id`
- `facebook_tokens`: `page_id`, `page_name`, `access_token`
- `mercadolibre_tokens`: `ml_user_id`, `seller_nickname`, `access_token`, `refresh_token`, `token_expires_at`
- `tiendanube_tokens`: `store_id`, `store_name`, `store_url`, `access_token`
- `google_tokens`: `access_token`, `refresh_token`, `token_expires_at`, `calendar_id`
- `tiktok_tokens`: `tiktok_open_id`, `tiktok_display_name`, `access_token`, `refresh_token`, `token_expires_at`, `refresh_expires_at`

**Tablas de facturación**
- `billing`: estado por cliente (`plan`, `status`, `amount`, `last_payment`, `next_due`, `suspended_at`)
- `plans`: planes disponibles con `features` JSONB
- `mp_subscriptions`: suscripciones de MercadoPago (`mp_preapproval_id`, `status`, `last_payment_at`)
- `mp_payments_log`: historial de pagos
- `bank_transfer_payments`: comprobantes de transferencia (`receipt_data` en base64, `status`)
- `payment_settings`: datos bancarios del negocio (alias, CBU, titular, CUIT)

**Tablas de logs**
- `instagram_comments_log`: `commenter_username`, `comment_text`, `public_reply`, `dm_sent`
- `facebook_comments_log`: `commenter_name`, `comment_text`, `public_reply`, `dm_sent`
- `facebook_reviews_log`: `reviewer_name`, `rating`, `review_text`, `reply_sent`
- `mercadolibre_log`: `buyer_name`, `item_title`, `question_text`, `answer_text`, `order_id`, `response_time_ms`

**Otras tablas**
- `knowledge_base`: `type` ('text'|'url'|'file'), `title`, `content` TEXT, `source_url`
- `services`: servicios agendables (`name`, `duration_minutes`, `price`)
- `product_cache`: productos de Tiendanube (`name`, `price`, `stock`, `url`, `variants` JSONB)
- `menu_items`: ítems para pedidos (`name`, `price`, `category`, `available`)
- `whatsapp_qr_sessions`: estado de sesión QR (`status`, `phone_number`, `connected_at`)
- `admins`: usuarios admin para el panel interno

---

## Rutas API completas

### Autenticación (`/api/auth`)
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/register` | ❌ | Crea cliente + bot_configs |
| POST | `/api/auth/login` | ❌ | Retorna JWT + perfil |

### Perfil (`/api/clients`)
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/clients/me` | ✅ | Perfil completo con credenciales WA |
| PUT | `/api/clients/me` | ✅ | Actualiza perfil y credenciales WA |

### Bot (`/api/bot`)
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/bot/config` | ✅ | Configuración del bot |
| PUT | `/api/bot/config` | ✅ | Actualiza configuración |
| GET | `/api/bot/stats` | ✅ | Estadísticas del panel |
| GET | `/api/bot/conversations` | ✅ | Últimas 50 conversaciones |
| GET | `/api/bot/conversations/:id/messages` | ✅ | Mensajes de una conversación |
| PUT | `/api/bot/conversations/:id/status` | ✅ | Cambiar status bot↔human |
| PUT | `/api/bot/conversations/:id/tags` | ✅ | Actualizar tags |
| GET | `/api/bot/conversations/:id/variables` | ✅ | Variables de contacto extraídas |
| POST | `/api/bot/conversations/:id/send` | ✅ | Envío manual por cualquier canal |
| GET | `/api/bot/alerts` | ✅ | Alertas no resueltas |
| PUT | `/api/bot/alerts/:id/resolve` | ✅ | Resolver alerta |
| GET | `/api/bot/export/messages` | ✅ | Exportar mensajes (JSON) |
| POST | `/api/bot/test-chat` | ✅ | Probar bot sin guardar |

### Webhooks (`/webhook`)
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET/POST | `/webhook/whatsapp/:clientId` | ❌ | WhatsApp Cloud API |
| GET/POST | `/webhook/instagram/:clientId` | ❌ | Instagram (DMs + comentarios) |
| GET/POST | `/webhook/facebook/:clientId` | ❌ | Facebook (Messenger + comentarios + reseñas) |

### WhatsApp QR (`/api/whatsapp-qr`)
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/whatsapp-qr/connect` | ✅ | Inicia sesión QR |
| GET | `/api/whatsapp-qr/status` | ✅ | Estado + imagen QR |
| POST | `/api/whatsapp-qr/disconnect` | ✅ | Desconecta sesión |
| POST | `/api/whatsapp-qr/connected` | secret | Callback: microservicio conectado |
| POST | `/api/whatsapp-qr/history` | secret | Callback: historial de mensajes |
| POST | `/api/whatsapp-qr/message` | secret | Callback: mensaje entrante para IA |

### Canales OAuth — todos siguen el mismo patrón
- `GET /api/{instagram|facebook|mercadolibre|tiendanube|tiktok|agenda}/connect` → URL de OAuth
- `GET /api/{canal}/callback` → intercambia código, guarda token cifrado
- `GET /api/{canal}/status` → estado de conexión
- `DELETE /api/{canal}/disconnect` → desconecta

### Otros
- `/api/knowledge` — CRUD base de conocimiento (texto, URL, archivo)
- `/api/agenda/services`, `/api/agenda/appointments`, `/api/agenda/slots` — gestión de agenda
- `/api/orders`, `/api/orders/menu` — pedidos y menú
- `/api/billing/status`, `/api/billing/pay/:clientId` — facturación
- `/api/mercadopago/{plans, subscribe, pay-once, subscription, cancel, payments, webhook}`
- `/api/bank-transfer/{settings, upload-receipt, my-receipts, admin/*}`
- `/api/mercadolibre/log`, `/api/mercadolibre/stats`, `/api/mercadolibre/webhook/:clientId`
- `/api/tiendanube/{sync, products, webhook/:clientId}`

---

## Microservicio QR — Endpoints

Corre en `localhost:3002`, expuesto vía Cloudflare Tunnel. Autenticado con header `x-service-secret`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/session/start` | Inicia sesión Baileys (usa creds guardadas si existen) |
| GET | `/session/:clientId/status` | Estado + QR como Data URL |
| POST | `/session/:clientId/send` | Envía mensaje (maneja @lid y @s.whatsapp.net) |
| POST | `/session/:clientId/disconnect` | Cierra sesión y borra archivos |

**Callbacks que hace el microservicio hacia Railway:**
- `POST /api/whatsapp-qr/connected` — al conectarse
- `POST /api/whatsapp-qr/history` — historial al reconectar (evento `messaging-history.set`)
- `POST /api/whatsapp-qr/message` — cada mensaje entrante

**Manejo de LID:** WhatsApp usa `@lid` para algunos números. El microservicio detecta si `to` contiene `@` y lo usa directo; sino agrega `@s.whatsapp.net`.

---

## Flujos principales

### Mensaje entrante por WhatsApp Cloud API
1. Meta → `POST /webhook/whatsapp/:clientId`
2. Verifica token, extrae mensaje
3. Si es audio → descarga + transcribe con Whisper → usa texto
4. Llama `processIncomingMessage(clientId, phone, name, texto, sendFn)`

### Procesamiento de mensaje (todos los canales)
`messageProcessor.js` — flujo secuencial:
1. Validar horario de atención → si fuera de horario, enviar `after_hours_message` y salir
2. Detectar keyword de humano → cambiar status y salir
3. Buscar/crear conversación en DB
4. `handleBookingFlow()` → intentar reserva de turno automática
5. `handlePurchaseConfirmation()` → detectar confirmación de compra
6. `processMessageWithOrderDetection()` → detectar pedidos via tool de Claude
7. `getResponseWithVariableExtraction()` → extraer y guardar variables del contacto
8. `getResponseWithScheduling()` → detectar y programar followups
9. `getAIResponse()` → respuesta final de Claude
10. Guardar en `messages` + enviar via `sendFn`

### Historial QR al conectar
Al escanear el QR, Baileys dispara `messaging-history.set` con los últimos ~90 días de mensajes. El microservicio los agrupa por teléfono y los envía a `/api/whatsapp-qr/history`. El backend crea conversaciones y mensajes en la DB preservando el timestamp original. Evita duplicados comparando `role + content + timestamp ± 5 segundos`.

### OAuth de un canal (ej: Instagram)
1. Frontend → `GET /api/instagram/connect` → recibe URL de Meta
2. Redirect al usuario a Meta
3. Meta → `GET /api/instagram/callback?code=...&state=clientId`
4. Backend intercambia código por token → cifra con AES-256-GCM → guarda en DB
5. Redirect al frontend con `?ig_connected=true`

### Pago por MercadoPago
1. Cliente elige plan → `POST /api/mercadopago/subscribe` → recibe `checkout_url`
2. Redirect a MercadoPago
3. MP → `POST /api/mercadopago/webhook` con notificación
4. Backend actualiza `mp_subscriptions.status` → reactiva cliente si estaba suspendido

---

## Decisiones de arquitectura

### 1. Tech Provider directo en vez de BSP (360dialog)
**Decisión:** no usar intermediarios de WhatsApp.
**Por qué:** 360dialog cuesta ~$59 USD/mes por número, lo que hace inviable el precio para el mercado PyME argentino. Ser Tech Provider directo de Meta permite que los clientes usen la Cloud API gratis hasta 1.000 conversaciones/mes.
**Costo:** requiere App Review de Meta y aprobación como Tech Provider.

### 2. WhatsApp QR en microservicio local (no en Railway)
**Decisión:** Baileys corre en la PC del admin, no en el servidor.
**Por qué:** Railway y proveedores de cloud tienen IPs de datacenter que WhatsApp bloquea para Baileys. Solo funciona desde IPs residenciales.
**Limitación conocida:** URL del Cloudflare Tunnel cambia en cada reinicio → actualizar `QR_SERVICE_URL` en Railway manualmente.
**Pendiente:** configurar tunnel nombrado con cuenta de Cloudflare para URL permanente.

### 3. Soporte de WhatsApp LID
**Contexto:** WhatsApp usa `@lid` (Linked ID) para algunos números en vez de `@s.whatsapp.net`.
**Fix aplicado:** al recibir, se preserva el JID completo si no termina en `@s.whatsapp.net`. Al enviar: `const jid = to.includes('@') ? to : \`${to}@s.whatsapp.net\``.

### 4. Sin ORM, queries SQL directas
**Decisión:** `pool.query()` con PostgreSQL directamente, sin Sequelize ni Prisma.
**Por qué:** el schema es simple y las queries son pocas. Un ORM agrega complejidad sin beneficio real para este tamaño de proyecto.

### 5. Sin cifrado de columnas de datos de usuarios
**Decisión:** `messages.content`, `customer_phone`, `customer_name` se guardan en texto plano.
**Por qué:** Railway cifra el disco a nivel de infraestructura (AES-256). Cifrar columnas rompería ~15 queries con `WHERE customer_phone = $1`, imposibilitaría JOINs entre tablas y agregaría latencia en cada llamada a Claude.
**Sí está cifrado:** todos los tokens OAuth con AES-256-GCM en `services/crypto.js`.
**Qué activaría el cifrado de columnas:** requerimiento regulatorio explícito o cambio de provider de infraestructura.

### 6. Enfoque híbrido para eliminación de datos (Ley 25.326)
**Decisión:** ni DELETE puro ni anonimización pura según la tabla.

| Tabla | Acción |
|---|---|
| `messages`, `appointments`, `orders`, `contact_variables`, `scheduled_followups`, `alerts` | DELETE real |
| `conversations` | Anonimizar: `customer_phone` y `customer_name` → `"ELIMINADO"` |
| `mercadolibre_log` | Anonimizar `buyer_name` → `"ELIMINADO"` |

**Cómo ejecutar:** `node scripts/eliminar-datos-usuario.js +5491XXXXXXXXX`
Todo corre en una transacción SQL con ROLLBACK automático si algo falla.

### 7. Schema en `db.js` en vez de archivos de migración
**Decisión:** todas las tablas en `initDB()` con `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
**Por qué:** simplicidad. Para un proyecto de una sola instancia en Railway, las migraciones separadas agregan overhead sin ganancia real.

### 8. Dos modos de proveedor WhatsApp en la misma tabla
Cada cliente tiene `whatsapp_provider` ('cloud_api'|'360dialog') y `whatsapp_mode` ('api'|'qr') en `clients`. El envío ramifica según estos valores en `services/whatsapp.js` y `routes/bot.js`.

---

## Estado de Meta / App Review

| Paso | Estado |
|---|---|
| Verificación de negocio en Meta Business Manager | ✅ Aprobada |
| Videos de demo grabados | ✅ Completado |
| Política de privacidad publicada en waibochat.com/privacidad | ✅ Publicada |
| App Review enviado a Meta | ✅ En curso |
| Aprobación como Tech Provider / Embedded Signup | ⏳ Pendiente resolución de Meta |
| OAuth de un clic para clientes (Embedded Signup) | 🔜 Requiere aprobación previa |

**Estado actual de OAuth de canales:** los clientes deben crear su propia app de Meta Developer para conectar WhatsApp Cloud API. Instagram y Facebook sí funcionan con la app propia de Waibo. Mercado Libre y Tiendanube también tienen sus propias apps.

---

## Compliance — Ley 25.326 (Argentina)

### Datos personales recolectados de usuarios finales

| Dato | Tabla | Cifrado |
|---|---|---|
| Teléfono | `conversations`, `appointments`, `orders`, `contact_variables`, `scheduled_followups` | No |
| Nombre | `conversations`, `appointments`, `orders` | No |
| Historial de mensajes | `messages` | No |
| Dirección de entrega | `orders.delivery_address` | No |
| Datos de turno | `appointments` | No |
| Variables extraídas por IA | `contact_variables` | No |
| Username de Instagram | `instagram_comments_log` | No |
| Nombre de Facebook | `facebook_comments_log`, `facebook_reviews_log` | No |
| Pregunta/nombre en ML | `mercadolibre_log` | No |

### Terceros que reciben datos de usuarios finales

| Tercero | País | Qué recibe |
|---|---|---|
| Anthropic (Claude) | USA | Historial de mensajes + system prompt en cada request |
| OpenAI (Whisper) | USA | Audio de notas de voz (no almacenado) |
| Meta (WA/IG/FB) | USA | Mensajes de respuesta del bot |
| Google Calendar | USA | Nombre, teléfono, servicio y horario de turnos |
| Railway | USA | Todo (infraestructura) |

### Estado de compliance

| Ítem | Estado |
|---|---|
| Política de privacidad pública | ✅ waibochat.com/privacidad |
| Derecho al olvido por solicitud | ✅ `node scripts/eliminar-datos-usuario.js +549...` |
| Retención automática 24 meses | ✅ Cron dominical 3am en `services/cronjobs.js` |
| Cifrado de tokens OAuth | ✅ AES-256-GCM en `services/crypto.js` |
| Cifrado de datos de usuarios | ⏳ Cubierto por cifrado en disco de Railway |
| Formulario web de solicitud de baja | ✅ `/solicitar-baja` en el frontend — guarda en DB + log |
| Logs de cumplimiento de solicitudes | ✅ `backend/logs/compliance/` — automático en script y endpoint |

### Emails de contacto
- Soporte: hola@waibochat.com
- Privacidad / baja de datos: privacidad@waibochat.com

---

## Crons activos

| Frecuencia | Qué hace |
|---|---|
| `*/30 * * * *` | Recordatorios anti-plantón de turnos (2h antes, configurable) |
| `0 9 * * *` | Suspende clientes con facturación vencida |
| Scheduling dinámico | Envía followups programados (vencidos en el minuto) |
| `0 3 * * 0` | Retención: anonimiza/borra datos con más de 24 meses |

---

## Workflow de Git

### Estado del repo
Git inicializado, sin remote configurado. Deploy directo con CLIs de Railway y Vercel.

### Comandos de deploy
```bash
# Backend
cd "C:\Proyecto APP\Whabot\Desarrollo\whabot\backend"
railway up --detach

# Frontend
cd "C:\Proyecto APP\Whabot\Desarrollo\whabot\frontend"
vercel --prod --yes
```

### Historial de commits hasta hoy
```
952d298  docs: agrega workflow de Git al CLAUDE.md
4a51cae  docs: agregar CLAUDE.md con estado completo del proyecto Waibo
d159796  rebrand: WhaBot → Waibo en textos visibles al usuario
fac716f  feat: compliance Ley 25.326 — derecho al olvido + retención 24 meses
9f44621  feat: WhatsApp Lite (QR) como canal primario + historial al conectar
5548b03  feat: dual WhatsApp provider support (Cloud API + 360dialog)
```

### Reglas de commit (Claude las aplica sin preguntar)
- Commit después de cada paso funcional completado
- Idioma: español
- Tipos: `feat:`, `fix:`, `rebrand:`, `docs:`, `compliance:`, `refactor:`
- CLAUDE.md y commits siempre en sintonía

### ⚠️ Cambios que requieren confirmación PREVIA antes de ejecutar
- Cambiar `WEBHOOK_VERIFY_TOKEN` (`whabot2024`) — puede cortar el App Review de Meta
- Migrar cifrado de columnas en la DB — rompe todas las queries existentes
- Modificar autenticación de Meta Cloud API
- `ALTER TABLE` con DROP o renombre de columnas con datos existentes
- Forzar logout de sesiones QR activas

---

## Variables de entorno (backend Railway)

```
DATABASE_URL=postgresql://...
JWT_SECRET=<string aleatorio largo>
ENCRYPTION_KEY=<64 caracteres hex — 32 bytes para AES-256>
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
WEBHOOK_VERIFY_TOKEN=whabot2024         ← NO CAMBIAR durante App Review
FACEBOOK_APP_ID=<meta-app-id>
FACEBOOK_APP_SECRET=<meta-app-secret>
ML_APP_ID=<mercadolibre-app-id>
ML_APP_SECRET=<mercadolibre-app-secret>
TIENDANUBE_CLIENT_ID=<id>
TIENDANUBE_CLIENT_SECRET=<secret>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
TIKTOK_CLIENT_KEY=<key>
TIKTOK_CLIENT_SECRET=<secret>
MERCADOPAGO_ACCESS_TOKEN=<token>
QR_SERVICE_URL=<url-del-cloudflare-tunnel>   ← actualizar si cambia al reiniciar cloudflared
QR_SERVICE_SECRET=whabot_qr_secret_2024
APP_URL=https://whabot-backend-production.up.railway.app
FRONTEND_URL=https://frontend-lac-nine-16.vercel.app
ADMIN_SECRET_KEY=<clave para endpoints admin>
NODE_ENV=production
PORT=3001
```

**Frontend (Vercel):**
```
NEXT_PUBLIC_API_URL=https://whabot-backend-production.up.railway.app
```

**Microservicio QR (local):**
```
PORT=3002
RAILWAY_BACKEND_URL=https://whabot-backend-production.up.railway.app
SERVICE_SECRET=whabot_qr_secret_2024
```

---

## Convenciones de código

- **Sin comentarios** salvo que el WHY sea no obvio (constraint oculta, workaround de bug específico)
- **Sin manejo de errores defensivo** para escenarios imposibles — validar solo en boundaries del sistema
- **Sin abstracciones prematuras** — tres líneas similares son mejores que una abstracción apresurada
- **Queries SQL directas** con `pool.query()` — sin ORM
- **Cifrado:** siempre usar `services/crypto.js` para tokens de terceros, nunca texto plano
- **Teléfonos:** siempre pasar por `normalizePhone()` antes de guardar o buscar en DB
- **Modelo de IA:** default `claude-haiku-4-5-20251001`, configurable por cliente en `bot_configs.ai_model`
- **`whabot2024`:** token de verificación de webhook de Meta — NO cambiar mientras el App Review esté activo

---

## Pendientes

### Alta prioridad
- [ ] **Tunnel nombrado permanente de Cloudflare** — hoy la URL del tunnel QR cambia en cada reinicio y hay que actualizar `QR_SERVICE_URL` en Railway a mano
- [x] ~~Auto-restauración de sesiones QR al reiniciar~~ — resuelto: el microservicio restaura las sesiones guardadas en `/sessions/` automáticamente al arrancar

### Media prioridad
- [x] ~~Formulario web de baja de datos~~ — resuelto: `/solicitar-baja` en el frontend, guarda en `data_deletion_requests` + log en disco
- [x] ~~Logs persistentes de solicitudes de baja~~ — resuelto: `backend/logs/compliance/` con timestamp, tanto desde el script como desde el endpoint web
- [ ] App de Meta propia para que clientes conecten WhatsApp Cloud API sin crear su propia app de Developer
- [ ] App de Mercado Libre propia para OAuth de un clic

### Baja prioridad / futuro
- [ ] TikTok DMs (Fase 4, webhook ya parcialmente implementado)
- [ ] Embedded Signup de Meta (requiere aprobación como Tech Provider primero)
- [ ] Cifrado de columnas sensibles (solo si Railway deja de cifrar en disco o hay requerimiento legal explícito)
