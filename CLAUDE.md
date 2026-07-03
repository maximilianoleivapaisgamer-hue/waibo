# CLAUDE.md — Waibo (ex-WhaBot)

> Este archivo es la fuente de verdad del proyecto para sesiones de Claude Code.
> Actualizarlo es obligatorio cada vez que se complete un paso importante, se tome una decisión de arquitectura, o se resuelva un pendiente.
> Última actualización: 2026-07-02

---

## Descripción general

**Waibo** es una plataforma SaaS multi-tenant argentina que provee chatbots de IA para PyMEs y negocios (concesionarias, comercios, profesionales). Cada negocio cliente conecta sus propios canales de mensajería y el bot responde automáticamente con IA.

- **Dominio público:** waibochat.com
- **Panel de clientes (frontend):** https://frontend-lac-nine-16.vercel.app
- **Backend API:** https://whabot-backend-production.up.railway.app
- **Modelo de negocio:** SaaS, facturación mensual en ARS vía MercadoPago

### Canales soportados
| Canal | Estado |
|---|---|
| WhatsApp (Cloud API oficial de Meta) | ✅ Funcional |
| WhatsApp Lite (QR vía Baileys) | ✅ Funcional (no oficial, uso transitorio) |
| Instagram DM + comentarios | ✅ Funcional |
| Facebook Messenger + comentarios + reseñas | ✅ Funcional |
| Mercado Libre (preguntas) | ✅ Funcional |
| Tiendanube (catálogo + checkout) | ✅ Funcional |
| TikTok DMs | 🔜 Fase 4, no implementado |

---

## Historia del nombre

El proyecto se llamó **WhaBot** originalmente y se renombró a **Waibo** (dominio waibochat.com).

### Qué se actualizó
- Textos visibles al usuario: login, registro, sidebar, instrucciones, notificaciones WhatsApp al dueño, descripciones en MercadoPago
- Nombres de archivos exportados: `waibo-conversaciones-*.csv`, `waibo-base-conocimiento-*.json`

### Qué se dejó intencionalmente sin cambiar (decisión explícita para minimizar riesgo)
- Token de verificación de webhook de Meta: `whabot2024` — cambiar esto durante el App Review podría cortar la integración
- Variables de localStorage: `whabot_token`, `whabot_client`
- Secrets internos: `whabot_qr_secret_2024`
- `package.json` name: `whabot-frontend`, `whabot-backend`
- User-Agent HTTP headers: `WhaBot/1.0`
- Nombre de base de datos en `.env.example`
- Nombres de rutas internas, funciones y variables de código

**Regla:** si es visible al usuario final → Waibo. Si es técnico interno → se deja como está.

---

## Stack tecnológico

### Backend
- **Runtime:** Node.js + Express
- **Hosting:** Railway (whabot-backend-production.up.railway.app)
- **Base de datos:** PostgreSQL en Railway
- **Autenticación:** JWT
- **Cifrado de tokens:** AES-256-GCM (implementado en `backend/services/crypto.js`)
- **Scheduler:** node-cron

### Frontend
- **Framework:** Next.js 14 (Pages Router)
- **Hosting:** Vercel
- **HTTP client:** axios
- **Sin estado global:** todo vía localStorage + llamadas a la API

### Microservicio QR (local, en la PC del admin)
- **Runtime:** Node.js + Express en puerto 3002
- **Librería WhatsApp:** @whiskeysockets/baileys
- **Exposición pública:** Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:3002`)
- **URL del tunnel:** cambia en cada reinicio (usar tunnel nombrado en producción)
- **Ubicación:** `whatsapp-qr-service/index.js`

### APIs de IA y terceros
| Servicio | Uso | Variable de entorno |
|---|---|---|
| Anthropic Claude (Haiku) | Generación de respuestas del bot | `ANTHROPIC_API_KEY` |
| OpenAI Whisper | Transcripción de notas de voz | `OPENAI_API_KEY` |
| Meta (WhatsApp Cloud API) | Envío/recepción mensajes WA oficial | `WHATSAPP_API_URL`, tokens por cliente |
| Meta (Instagram Graph API) | DMs + comentarios IG | tokens por cliente en DB |
| Meta (Facebook Graph API) | Messenger + comentarios FB | tokens por cliente en DB |
| MercadoLibre API | Preguntas de publicaciones | tokens por cliente en DB |
| Tiendanube API | Catálogo + órdenes | tokens por cliente en DB |
| MercadoPago API | Cobro de suscripciones | `MERCADOPAGO_ACCESS_TOKEN` |
| Google Calendar API | Agenda de turnos | tokens por cliente en DB |

---

## Estructura de carpetas

```
whabot/                          ← raíz del repo git
├── CLAUDE.md                    ← este archivo
├── backend/
│   ├── index.js                 ← entry point, monta rutas
│   ├── db.js                    ← init de PostgreSQL + todas las CREATE TABLE
│   ├── middleware/auth.js        ← JWT middleware
│   ├── routes/
│   │   ├── clients.js           ← /api/clients/me (perfil + config WhatsApp)
│   │   ├── bot.js               ← /api/bot/* (envío manual, exportación)
│   │   ├── webhook.js           ← /webhook/* (entrada de mensajes WA/IG/FB)
│   │   ├── whatsappQR.js        ← /api/whatsapp-qr/* (proxy al microservicio QR)
│   │   ├── instagram.js
│   │   ├── facebook.js
│   │   ├── mercadolibre.js
│   │   ├── tiendanube.js
│   │   ├── agenda.js
│   │   ├── billing.js
│   │   └── ...
│   ├── services/
│   │   ├── ai.js                ← llamadas a Claude API
│   │   ├── messageProcessor.js  ← lógica principal de procesamiento de mensajes
│   │   ├── crypto.js            ← AES-256-GCM encrypt/decrypt para tokens
│   │   ├── cronjobs.js          ← recordatorios, morosidad, retención 24 meses
│   │   ├── whatsapp.js          ← envío vía Cloud API y 360dialog
│   │   ├── alerts.js            ← notificaciones al dueño del negocio
│   │   ├── mercadopago.js       ← suscripciones y pagos únicos
│   │   ├── voice.js             ← transcripción Whisper
│   │   ├── agenda.js            ← turnos y Google Calendar
│   │   ├── businessHours.js
│   │   ├── contactVariables.js  ← extracción de datos de clientes por IA
│   │   ├── orders.js            ← detección de pedidos
│   │   └── ...
│   └── scripts/
│       └── eliminar-datos-usuario.js  ← derecho al olvido (Ley 25.326)
├── frontend/
│   ├── pages/
│   │   ├── index.js             ← login
│   │   ├── register.js
│   │   ├── dashboard.js
│   │   ├── conversations.js     ← panel de conversaciones + envío manual
│   │   ├── channels.js          ← conexión de canales (WA Lite primero, Cloud API segundo)
│   │   ├── config.js            ← configuración del bot
│   │   ├── billing.js
│   │   ├── instagram.js / facebook.js / mercadolibre.js
│   │   ├── agenda.js / catalog.js / orders.js / knowledge.js
│   │   └── profile.js
│   ├── components/
│   │   └── Sidebar.js
│   └── styles/globals.css
└── whatsapp-qr-service/
    ├── index.js                 ← microservicio Baileys (corre en PC local)
    ├── package.json
    └── sessions/                ← credenciales de sesiones QR (gitignored)
```

---

## Estado de registro como Tech Provider de Meta/WhatsApp

| Paso | Estado |
|---|---|
| Verificación de negocio en Meta Business Manager | ✅ Aprobada |
| Videos de demo grabados para App Review | ✅ Completado |
| App Review enviado a Meta | ✅ En curso |
| Política de privacidad pública publicada en waibochat.com/privacidad | ✅ Publicada |
| Aprobación como Tech Provider / Embedded Signup | ⏳ Pendiente resolución de Meta |
| Implementar OAuth de un clic para clientes (Embedded Signup) | 🔜 Una vez aprobado |

**Objetivo:** que los clientes de Waibo puedan conectar su número de WhatsApp Business con un solo clic (OAuth), sin tener que crear su propia app de Meta Developer. Hoy deben hacerlo manualmente.

**Alternativa transitoria:** WhatsApp Lite (QR vía Baileys) — canal no oficial, puede ser bloqueado por Meta sin previo aviso. Sirve para que los clientes empiecen a usar el bot mientras tramitan la Cloud API.

---

## Estado de landing y política de privacidad

- **Landing:** waibochat.com — publicada
- **Política de privacidad:** waibochat.com/privacidad — publicada, incluye:
  - Inventario completo de datos recolectados
  - Terceros que reciben datos (Anthropic, OpenAI, Meta, Google, Railway)
  - Retención: 24 meses
  - Derecho al olvido: solicitudes a privacidad@waibochat.com
- **Email de soporte:** hola@waibochat.com
- **Email compliance:** privacidad@waibochat.com
- **Datos legales en la política:** razón social y CUIT del titular

---

## Decisiones de arquitectura importantes

### 1. Tech Provider directo en vez de BSP (360dialog)
**Decisión:** no usar 360dialog ni otro BSP (Business Solution Provider) como intermediario.
**Por qué:** 360dialog cobra ~$59 USD/mes por número de WhatsApp, lo que encarece el servicio para cada cliente. Ser Tech Provider directo con Meta permite que los clientes usen la Cloud API de Meta gratis (hasta 1.000 conversaciones/mes) sin intermediarios.
**Costo:** requiere pasar el App Review de Meta y la aprobación como Tech Provider, que puede demorar semanas o meses.

### 2. WhatsApp QR en microservicio local (Baileys)
**Decisión:** el bot de WhatsApp QR no corre en Railway sino en un microservicio Node.js local en la PC del admin, expuesto mediante Cloudflare Tunnel.
**Por qué:** Railway y otros proveedores de cloud tienen IPs de datacenter que WhatsApp bloquea para sesiones de Baileys (solo acepta conexiones desde IPs residenciales). El microservicio corre en la PC con IP domiciliaria.
**Limitación conocida:** la URL del tunnel cambia en cada reinicio de cloudflared (solución a largo plazo: tunnel nombrado con cuenta de Cloudflare).
**Variable clave:** `QR_SERVICE_URL` en Railway debe actualizarse si la URL del tunnel cambia.
**Secret compartido:** `whabot_qr_secret_2024` (header `x-service-secret`).

### 3. Soporte de WhatsApp LID (Linked ID)
**Problema encontrado:** WhatsApp usa un formato nuevo llamado LID (`96735548448847@lid`) para algunos números en vez del formato clásico (`@s.whatsapp.net`). El microservicio QR detecta esto y preserva el JID completo para poder responder correctamente.
**Fix aplicado:** `const jid = to.includes('@') ? to : \`${to}@s.whatsapp.net\`` en el endpoint de envío del microservicio.

### 4. Enfoque híbrido de eliminación de datos (Ley 25.326)
**Decisión:** ni DELETE puro ni anonimización pura — se usa un híbrido según la sensibilidad del dato.

| Tabla | Acción |
|---|---|
| `messages` | DELETE real (contenido más sensible, sin valor estadístico) |
| `appointments` | DELETE real |
| `orders` | DELETE real |
| `contact_variables` | DELETE real |
| `scheduled_followups` | DELETE real |
| `conversations` | Anonimizar: phone/name → "ELIMINADO" (mantiene conteo para estadísticas) |
| `mercadolibre_log` | Anonimizar buyer_name → "ELIMINADO" |
| `alerts` | DELETE real |

**Cómo ejecutar:** `node scripts/eliminar-datos-usuario.js +5491XXXXXXXXX`
Todo corre en una transacción con ROLLBACK automático si algo falla.

### 5. Sin cifrado de columnas en la base de datos
**Decisión:** no cifrar `messages.content`, `customer_phone`, `customer_name` a nivel de columna.
**Por qué:** Railway ya cifra el disco a nivel de infraestructura (AES-256). Cifrar columnas implicaría romper ~15 queries con `WHERE customer_phone = $1`, imposibilitar JOINs entre tablas, agregar latencia en cada llamada a Claude (descifrado del historial), y complicar la exportación CSV.
**Qué sí está cifrado:** tokens de OAuth de Instagram, Facebook, MercadoPago, TikTok, Google, Tiendanube — todos con AES-256-GCM en `services/crypto.js`.
**Qué activaría el cifrado de columnas en el futuro:** requerimiento regulatorio explícito, o migración a un provider que no cifre en disco.

### 6. Proveedores de WhatsApp en la DB
Cada cliente tiene `whatsapp_provider` (`cloud_api` | `360dialog`) y `whatsapp_mode` (`api` | `qr`) en la tabla `clients`. La lógica de envío en `services/whatsapp.js` y `routes/bot.js` ramifica según estos valores.

---

## Datos personales que recolectamos

### De los usuarios finales (personas que escriben al negocio)
| Dato | Tabla(s) | Cifrado |
|---|---|---|
| Número de teléfono | `conversations`, `appointments`, `orders`, `contact_variables`, `scheduled_followups` | No (texto plano) |
| Nombre | `conversations`, `appointments`, `orders` | No |
| Historial de mensajes | `messages` | No |
| Dirección de entrega | `orders.delivery_address` | No |
| Datos de turno | `appointments` | No |
| Variables extraídas por IA | `contact_variables` | No |
| Username Instagram | `instagram_comments_log` | No |
| Nombre Facebook | `facebook_comments_log`, `facebook_reviews_log` | No |
| Nombre/consulta ML | `mercadolibre_log` | No |

### Terceros que reciben datos de usuarios finales
| Tercero | País | Qué recibe |
|---|---|---|
| Anthropic (Claude API) | USA | Historial de mensajes + system prompt del negocio, en cada mensaje |
| OpenAI (Whisper) | USA | Audio de notas de voz (no almacenado por ellos) |
| Meta (WA/IG/FB) | USA | Mensajes de respuesta del bot |
| Google (Calendar) | USA | Nombre, teléfono, servicio y horario si el negocio tiene agenda |
| Railway | USA | Todo (infraestructura) |

---

## Compliance — Estado

| Ítem | Estado | Cómo |
|---|---|---|
| Política de privacidad pública | ✅ Publicada | waibochat.com/privacidad |
| Derecho al olvido (solicitud manual) | ✅ Implementado | `node scripts/eliminar-datos-usuario.js +NUMERO` |
| Retención automática 24 meses | ✅ Implementado | Cron todos los domingos a las 3am en `services/cronjobs.js` |
| Cifrado de tokens OAuth | ✅ Implementado | AES-256-GCM en `services/crypto.js` |
| Cifrado de contenido de mensajes | ⏳ Diferido | Cubierto por cifrado en disco de Railway |
| Mecanismo de solicitud pública de baja | ⚠️ Parcial | Solo por email a privacidad@waibochat.com, sin formulario web |
| Logs de cumplimiento de solicitudes de baja | ✅ El script genera output para guardar manualmente |

---

## Workflow de Git

### Estado del repo
Git inicializado, sin remote configurado. Deploy se hace directo con CLIs:
- **Backend:** `cd backend && railway up --detach`
- **Frontend:** `cd frontend && vercel --prod --yes`

### Reglas de commit (Claude las aplica automáticamente)
- **Cuándo:** cada vez que se completa algo funcional — feature, corrección, decisión implementada
- **Sin preguntar:** los commits se hacen como parte del flujo normal, sin pedir confirmación
- **Idioma:** español
- **Formato:** `tipo: descripción clara de qué se hizo y por qué`
  - `feat:` — nueva funcionalidad
  - `fix:` — corrección de bug
  - `rebrand:` — cambios de nombre/marca
  - `docs:` — actualización de CLAUDE.md u otra documentación
  - `compliance:` — cambios legales/privacidad
  - `refactor:` — cambios internos sin impacto en comportamiento

### Antes de tocar algo riesgoso — OBLIGATORIO avisar primero
Los siguientes cambios requieren confirmación explícita antes de ejecutar, y el último commit debe estar hecho para poder hacer rollback:
- Cambiar `WEBHOOK_VERIFY_TOKEN` (`whabot2024`) — puede cortar el App Review de Meta
- Migrar cifrado de columnas en la DB — afecta todas las queries existentes
- Modificar cómo se autentica la Cloud API de Meta
- Cambios en el schema de la DB que impliquen DROP o ALTER de columnas con datos
- Forzar desconexión de sesiones QR activas

### CLAUDE.md y commits en sintonía
Cada vez que se actualiza el CLAUDE.md por un avance importante, ese mismo commit incluye el avance que lo motivó. No hay actualizaciones del CLAUDE.md sin su commit correspondiente.

---

## Convenciones de código

- **Sin comentarios** salvo que el WHY sea no obvio (constraint oculta, workaround de un bug)
- **Sin manejo de errores defensivo** para escenarios imposibles — solo validar en boundaries (input del usuario, APIs externas)
- **Sin abstracciones prematuras** — tres líneas similares son mejores que una abstracción apresurada
- **Queries SQL** directas con `pool.query` — sin ORM
- **Cifrado:** siempre usar `services/crypto.js` para tokens de terceros, nunca guardar en texto plano
- **Normalización de teléfonos:** usar `services/phone.js` → `normalizePhone()` antes de guardar o buscar
- **Modelo de IA por defecto:** `claude-haiku-4-5-20251001` (configurable por cliente en `bot_configs.ai_model`)
- **Webhook verify token:** `whabot2024` — NO cambiar mientras el App Review de Meta esté activo

---

## Pendientes técnicos

### Alta prioridad
- [ ] Tunnel nombrado permanente de Cloudflare para el microservicio QR (hoy la URL cambia en cada reinicio y hay que actualizar `QR_SERVICE_URL` en Railway a mano)
- [ ] Auto-restauración de sesiones QR al reiniciar el microservicio (hoy hay que ir a Canales → Conectar después de cada reinicio)

### Media prioridad
- [ ] Formulario web de solicitud de baja de datos en waibochat.com/privacidad (hoy es solo por email)
- [ ] Logs persistentes de cumplimiento de solicitudes de baja (hoy es copiar/pegar el output del script)
- [ ] App de Meta propia para Facebook/Instagram OAuth (hoy los clientes necesitan crear la suya)
- [ ] App de MercadoLibre propia para OAuth de un clic

### Baja prioridad / futuro
- [ ] TikTok DMs (Fase 4)
- [ ] Embedded Signup de Meta (una vez aprobado como Tech Provider)
- [ ] Cifrado de columnas sensibles si Railway deja de cifrar en disco o hay requerimiento regulatorio

---

## Variables de entorno críticas (backend Railway)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL |
| `JWT_SECRET` | Firma de tokens JWT |
| `ENCRYPTION_KEY` | Clave AES-256 para tokens OAuth (hex de 64 chars) |
| `ANTHROPIC_API_KEY` | Claude API |
| `OPENAI_API_KEY` | Whisper (notas de voz) |
| `MERCADOPAGO_ACCESS_TOKEN` | Cobro de suscripciones |
| `QR_SERVICE_URL` | URL del Cloudflare Tunnel hacia el microservicio QR local |
| `QR_SERVICE_SECRET` | Secret compartido con el microservicio (`whabot_qr_secret_2024`) |
| `WEBHOOK_VERIFY_TOKEN` | Token de verificación de webhooks Meta (`whabot2024`) |
| `FRONTEND_URL` | URL del frontend para redirects OAuth |
| `APP_URL` | URL del backend |
| `FB_APP_ID` / `FB_APP_SECRET` | App de Meta para Facebook/Instagram |
| `ML_APP_ID` / `ML_APP_SECRET` | App de Mercado Libre |
| `TIENDANUBE_CLIENT_ID` / `TIENDANUBE_CLIENT_SECRET` | App de Tiendanube |
