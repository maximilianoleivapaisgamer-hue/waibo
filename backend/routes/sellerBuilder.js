const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { callClaudeAPI } = require('../services/ai');

/*
 * "Armá tu vendedor con IA": a partir de un documento, de los chats ya guardados o de unas
 * preguntas, la IA propone toda la configuración del bot (instrucciones, pasos de venta,
 * etiquetas, seguimiento y casos que se pasan al dueño). El negocio la revisa y elige qué
 * aplicar. Nada se guarda hasta que el negocio aplica.
 */

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const MAX_FUENTE = 150000;

async function chatsGuardados(clientId) {
  const r = await pool.query(
    `WITH chats AS (
       SELECT c.id, c.customer_name, c.customer_phone, MAX(m.timestamp) AS ultimo
       FROM conversations c JOIN messages m ON m.conversation_id = c.id
       WHERE c.client_id = $1
       GROUP BY c.id
       HAVING COUNT(*) FILTER (WHERE m.role = 'assistant' AND COALESCE(m.origin, '') <> 'seguimiento') > 0
          AND COUNT(*) FILTER (WHERE m.role = 'user') > 0
       ORDER BY ultimo DESC
       LIMIT 200
     )
     SELECT ch.id, m.role, m.content
     FROM chats ch JOIN messages m ON m.conversation_id = ch.id
     ORDER BY ch.ultimo DESC, ch.id, m.timestamp`,
    [clientId]
  );
  let actual = null;
  const lineas = [];
  for (const m of r.rows) {
    if (m.id !== actual) { lineas.push('\n=== Chat ==='); actual = m.id; }
    lineas.push(`${m.role === 'user' ? 'Cliente' : 'Negocio'}: ${String(m.content).slice(0, 600)}`);
  }
  return lineas.join('\n').slice(0, MAX_FUENTE);
}

const FORMATO = `Respondé SOLO con un JSON válido, sin texto alrededor ni bloques de código, con esta forma:
{
  "bot_name": "nombre con el que se presenta (el del dueño o el del negocio)",
  "system_prompt": "instrucciones completas del bot (ver abajo)",
  "sales_steps": [
    { "title": "nombre corto", "instruction": "qué hace el bot en este paso, con el texto exacto si el negocio usa uno", "needs_file": "qué archivo convendría mandar en este paso (ej: video de cómo funciona, imagen de precios) o null", "caption": "texto que va junto al archivo o null", "after_text": "mensaje que va después del archivo o null", "label": "etiqueta que se pone al completarlo o null" }
  ],
  "label_instructions": "cuándo usar cada etiqueta y cuándo archivar, una regla por línea con guion",
  "recontact_guide": "cómo hacer el seguimiento de quien deja de contestar, según cada caso, una regla por línea con guion",
  "recontact_schedule": [horas de espera de cada intento, ej 4, 24, 72],
  "reply_delay_seconds": segundos de demora antes de contestar (60 a 180 suele ir bien),
  "missing": ["datos que faltan y el dueño debería completar, ej: precios, horarios, zona de envío"]
}

Cómo escribir "system_prompt" (es lo más importante):
- En segunda persona, dirigido al bot ("Te presentás como...", "Nunca digas...").
- Secciones en este orden: quién es y a quién le habla; cómo escribe (tono, voseo si corresponde, largo de los mensajes); lo que NO se dice nunca; los precios y datos del negocio; las respuestas a las preguntas frecuentes, usando las palabras que usa el negocio; los casos que se frenan y pasan al dueño.
- Los casos que se pasan al dueño se resuelven escribiendo [[derivar:motivo]]. Incluí siempre "si la respuesta no está en estas instrucciones, derivá".
- Escribí como habla el negocio en los chats o el documento, sin inventar datos que no aparezcan. Si un dato falta, ponelo en "missing", no lo inventes.
- Por WhatsApp se escribe sin signos de apertura (nada de ¿ ni ¡).

Pasos de venta: entre 3 y 6, en el orden en que el negocio vende de verdad. El primero es la apertura para un contacto nuevo. El último suele ser pasarle el chat al dueño cuando el cliente quiere cerrar, salvo que el negocio cierre solo por chat.`;

// POST /api/seller-builder/propose  (multipart: file opcional; campos source, text, answers)
router.post('/propose', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const source = req.body.source;
    let material = '';
    let tipo = '';

    if (source === 'chats') {
      material = await chatsGuardados(req.client.id);
      tipo = 'CHATS REALES DEL NEGOCIO CON SUS CLIENTES (de ahí sale cómo vende, qué preguntan y qué contesta)';
      if (material.length < 1500) return res.status(400).json({ error: 'Todavía no hay suficientes chats guardados en Waibo. Conectá tu WhatsApp e importá los chats, o usá otra opción.' });
    } else if (source === 'doc') {
      if (req.file) {
        const esPdf = req.file.mimetype === 'application/pdf' || /\.pdf$/i.test(req.file.originalname);
        material = esPdf ? (await pdfParse(req.file.buffer)).text : req.file.buffer.toString('utf8');
      }
      if (req.body.text) material = `${material}\n\n${req.body.text}`;
      material = material.trim().slice(0, MAX_FUENTE);
      tipo = 'DOCUMENTO DEL NEGOCIO SOBRE CÓMO VENDE';
      if (material.length < 200) return res.status(400).json({ error: 'El documento es muy corto. Pegá o subí más información de cómo vendés.' });
    } else if (source === 'questions') {
      let answers = req.body.answers;
      if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch (_) { answers = {}; } }
      material = Object.entries(answers || {}).filter(([, v]) => String(v || '').trim()).map(([k, v]) => `${k}\n${v}`).join('\n\n');
      tipo = 'RESPUESTAS DEL DUEÑO A UN CUESTIONARIO SOBRE SU NEGOCIO';
      if (material.length < 150) return res.status(400).json({ error: 'Completá un poco más las respuestas para que la IA tenga de dónde armar tu vendedor.' });
    } else {
      return res.status(400).json({ error: 'Elegí de dónde sacar la información' });
    }

    const cli = (await pool.query('SELECT business_name, name FROM clients WHERE id = $1', [req.client.id])).rows[0] || {};
    const raw = await callClaudeAPI({
      model: 'claude-sonnet-4-6',
      max_tokens: 12000,
      system: `Sos experto en armar vendedores por WhatsApp con IA para PyMEs argentinas. Tu trabajo es convertir lo que te da un negocio en la configuración completa de su bot de ventas.

Negocio: ${cli.business_name || cli.name || 'sin nombre'}.

${FORMATO}`,
      messages: [{ role: 'user', content: `${tipo}:\n\n${material}` }]
    }, { timeout: 280000, maxRetries: 1 });

    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    let propuesta;
    try { propuesta = JSON.parse(json); } catch (_) {
      console.error('[seller-builder] JSON inválido:', raw.slice(0, 500));
      return res.status(502).json({ error: 'La IA devolvió algo que no se pudo leer. Probá de nuevo.' });
    }
    res.json({ proposal: propuesta });
  } catch (err) {
    console.error('[seller-builder]', err.response?.data || err.message);
    res.status(500).json({ error: 'No se pudo armar la propuesta. Probá de nuevo en un rato.' });
  }
});

// POST /api/seller-builder/apply  { proposal, parts: ['prompt','steps','labels','recontact','delay','name'] }
router.post('/apply', authMiddleware, async (req, res) => {
  const { proposal: p, parts } = req.body;
  if (!p || !Array.isArray(parts) || !parts.length) return res.status(400).json({ error: 'No hay nada para aplicar' });
  const id = req.client.id;
  try {
    if (parts.includes('prompt') && p.system_prompt) await pool.query('UPDATE bot_configs SET system_prompt = $2 WHERE client_id = $1', [id, String(p.system_prompt)]);
    if (parts.includes('name') && p.bot_name) await pool.query('UPDATE bot_configs SET bot_name = $2 WHERE client_id = $1', [id, String(p.bot_name).slice(0, 60)]);
    if (parts.includes('labels') && p.label_instructions) await pool.query('UPDATE bot_configs SET label_instructions = $2 WHERE client_id = $1', [id, String(p.label_instructions)]);
    if (parts.includes('delay') && p.reply_delay_seconds != null) {
      await pool.query('UPDATE bot_configs SET reply_delay_seconds = $2 WHERE client_id = $1', [id, Math.max(0, Math.min(900, parseInt(p.reply_delay_seconds, 10) || 0))]);
    }
    if (parts.includes('steps') && Array.isArray(p.sales_steps)) {
      const pasos = p.sales_steps.filter((s) => s && s.title).slice(0, 15).map((s) => ({
        title: String(s.title).slice(0, 80),
        instruction: String(s.instruction || '').slice(0, 1000),
        resource_id: null,
        caption: s.caption ? String(s.caption).slice(0, 1000) : null,
        after_text: s.after_text ? String(s.after_text).slice(0, 1000) : null,
        label: s.label ? String(s.label).slice(0, 60) : null
      }));
      await pool.query('UPDATE bot_configs SET sales_steps = $2::jsonb, sales_steps_enabled = true WHERE client_id = $1', [id, JSON.stringify(pasos)]);
    }
    if (parts.includes('recontact')) {
      const horas = (Array.isArray(p.recontact_schedule) ? p.recontact_schedule : [4, 24, 72]).map(Number).filter((h) => h > 0).slice(0, 6);
      // Se deja cargado pero no se prende solo: escribirle a clientes es decisión del dueño.
      await pool.query('UPDATE bot_configs SET recontact_guide = $2, recontact_schedule = $3::jsonb WHERE client_id = $1',
        [id, String(p.recontact_guide || ''), JSON.stringify(horas.length ? horas : [4, 24, 72])]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[seller-builder apply]', err.message);
    res.status(500).json({ error: 'No se pudo aplicar' });
  }
});

module.exports = router;
