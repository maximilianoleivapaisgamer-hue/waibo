const axios = require('axios');
const FormData = require('form-data');

/*
 * Transcripción de notas de voz en la nube. Proveedores intercambiables:
 *   openai  → OPENAI_API_KEY  (whisper-1)
 *   groq    → GROQ_API_KEY    (whisper-large-v3-turbo, muy rápido y barato)
 *   gemini  → GEMINI_API_KEY  (gemini-2.5-flash con el audio adjunto)
 * TRANSCRIPTION_PROVIDER fuerza uno; si no está, se usa el primero que tenga clave.
 * El canal QR primero intenta el Whisper local de la PC y solo cae acá si no puede.
 */

function extensionDe(mimeType) {
  if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'ogg';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) return 'm4a';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('webm')) return 'webm';
  return 'ogg';
}

// Formato de transcripción de OpenAI (Groq usa la misma API)
async function whisperCompatible(url, apiKey, model, audioBuffer, mimeType) {
  const formData = new FormData();
  formData.append('file', audioBuffer, { filename: `audio.${extensionDe(mimeType)}`, contentType: mimeType });
  formData.append('model', model);
  formData.append('language', 'es');
  const r = await axios.post(url, formData, {
    headers: { Authorization: `Bearer ${apiKey}`, ...formData.getHeaders() },
    timeout: 120000,
    maxBodyLength: Infinity
  });
  return r.data.text;
}

async function gemini(apiKey, audioBuffer, mimeType) {
  const model = process.env.GEMINI_TRANSCRIPTION_MODEL || 'gemini-2.5-flash';
  const r = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      contents: [{
        parts: [
          { text: 'Transcribí textualmente esta nota de voz en español rioplatense. Devolvé solo el texto dicho, sin comillas ni comentarios.' },
          { inline_data: { mime_type: mimeType.split(';')[0], data: audioBuffer.toString('base64') } }
        ]
      }]
    },
    { timeout: 120000 }
  );
  return (r.data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
}

const PROVEEDORES = {
  openai: { clave: 'OPENAI_API_KEY', run: (k, b, m) => whisperCompatible('https://api.openai.com/v1/audio/transcriptions', k, 'whisper-1', b, m) },
  groq: { clave: 'GROQ_API_KEY', run: (k, b, m) => whisperCompatible('https://api.groq.com/openai/v1/audio/transcriptions', k, 'whisper-large-v3-turbo', b, m) },
  gemini: { clave: 'GEMINI_API_KEY', run: gemini }
};

function proveedorActivo() {
  const forzado = (process.env.TRANSCRIPTION_PROVIDER || '').toLowerCase();
  if (forzado && PROVEEDORES[forzado] && process.env[PROVEEDORES[forzado].clave]) return forzado;
  return Object.keys(PROVEEDORES).find((p) => process.env[PROVEEDORES[p].clave]) || null;
}

async function transcribeAudio(audioBuffer, mimeType = 'audio/ogg') {
  const nombre = proveedorActivo();
  if (!nombre) {
    console.error('Transcripción: no hay proveedor configurado (OPENAI_API_KEY, GROQ_API_KEY o GEMINI_API_KEY)');
    return null;
  }
  try {
    const texto = await PROVEEDORES[nombre].run(process.env[PROVEEDORES[nombre].clave], audioBuffer, mimeType);
    return (texto || '').trim() || null;
  } catch (err) {
    console.error(`Error transcribiendo audio (${nombre}):`, err.response?.data || err.message);
    return null;
  }
}

async function downloadAndTranscribe(audioUrl, authHeader) {
  try {
    const response = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: authHeader }
    });

    const audioBuffer = Buffer.from(response.data);
    const contentType = response.headers['content-type'] || 'audio/ogg';

    return await transcribeAudio(audioBuffer, contentType);
  } catch (err) {
    console.error('Error descargando audio:', err.message);
    return null;
  }
}

module.exports = { transcribeAudio, downloadAndTranscribe, proveedorActivo };
