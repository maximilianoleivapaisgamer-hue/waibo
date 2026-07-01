# WhaBot v1.0 — Contexto del proyecto

## ¿Qué es?
Plataforma SaaS de bots de WhatsApp/Instagram/Facebook/TikTok/Mercado Libre con IA, para vender a PyMEs y locales comerciales argentinos.

## Stack técnico
- Backend: Node.js + Express → Railway
- Frontend: Next.js (React) → Vercel
- Base de datos: PostgreSQL → Railway
- IA: Claude API de Anthropic (Haiku 4.5 por defecto, Sonnet 4.6 opcional)
- WhatsApp: 360dialog API oficial, o modo QR temporal (Baileys)
- Pagos: MercadoPago (suscripción + pago único) y transferencia bancaria con comprobante

## Canales integrados
| Canal | Funciones |
|---|---|
| WhatsApp Business | Texto, notas de voz, turnos, pedidos, checkout |
| Instagram | DMs + respuesta a comentarios con intención de compra |
| Facebook | Messenger + comentarios + reseñas (negativas van a revisión humana) |
| Mercado Libre | Preguntas públicas + mensajes post-venta |
| Tiendanube | Catálogo sincronizado + checkout directo |
| TikTok | DMs |
| Google Calendar | Agenda de turnos automática |

## Módulos de IA con tool use (mutuamente excluyentes entre sí, por config)
- **Pedidos** (gastronomía): detecta productos/cantidades del menú propio y genera pedido estructurado
- **Variables dinámicas**: extrae datos del cliente (presupuesto, zona, etc.) y los guarda por contacto
- **Recordatorios por fecha pedida**: detecta "contactame el lunes" y programa el seguimiento

## Seguridad
- Tokens OAuth de los 5 canales, encriptados con AES-256-GCM (services/crypto.js)
- Rate limiting en login, webhooks y API general
- Reintentos automáticos ante fallos de la IA

## Pendientes para seguir desarrollando
- Probar todo el proyecto de punta a punta antes de sumar nuevas funciones
- Onboarding sin fricción técnica (contenido, no código)
- Reportes de ventas explotando las tablas orders/appointments
- Multi-sucursal
