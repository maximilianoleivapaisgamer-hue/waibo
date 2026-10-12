const axios = require('axios');

async function sendWhatsAppMessage(to, message, apiKey, options = {}) {
  const { provider = '360dialog', phoneNumberId } = options;
  try {
    let url, headers;
    if (provider === 'cloud_api') {
      url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
      headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    } else {
      url = `${process.env.WHATSAPP_API_URL}/messages`;
      headers = { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' };
    }
    const response = await axios.post(
      url,
      { messaging_product: 'whatsapp', to, type: 'text', text: { body: message } },
      { headers }
    );
    return response.data;
  } catch (err) {
    console.error('Error enviando mensaje WhatsApp:', err.response?.data || err.message);
    throw err;
  }
}

// WhatsApp por la API (Meta o 360dialog) solo acepta audio ogg/opus, mp3, aac, amr o mp4.
// Lo grabado desde el panel es webm: se pasa a ogg/opus para que llegue como nota de voz.
function aOggOpus(buffer) {
  const { spawn } = require('child_process');
  const ffmpeg = require('ffmpeg-static');
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ['-i', 'pipe:0', '-ac', '1', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1']);
    const out = [];
    p.stdout.on('data', (d) => out.push(d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error('ffmpeg salió con ' + code))));
    p.stdin.on('error', () => {});
    p.stdin.end(buffer);
  });
}

// Manda un recurso de la biblioteca (imagen, video, audio, archivo): primero se sube a
// WhatsApp y después se manda el mensaje con el id del archivo subido.
async function sendWhatsAppMedia(to, rec, apiKey, options = {}) {
  const FormData = require('form-data');
  const { provider = '360dialog', phoneNumberId } = options;
  const cloud = provider === 'cloud_api';
  const base = cloud ? `https://graph.facebook.com/v18.0/${phoneNumberId}` : process.env.WHATSAPP_API_URL;
  const auth = cloud ? { Authorization: `Bearer ${apiKey}` } : { 'D360-API-KEY': apiKey };

  let data = rec.data;
  let mimetype = (rec.mimetype || 'application/octet-stream').split(';')[0];
  let filename = rec.filename || 'archivo';
  if (rec.kind === 'audio' && !/^audio\/(ogg|mpeg|mp4|aac|amr)$/.test(mimetype)) {
    data = await aOggOpus(data);
    mimetype = 'audio/ogg';
    filename = filename.replace(/\.[^.]+$/, '') + '.ogg';
  }

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimetype);
  form.append('file', data, { filename, contentType: mimetype });
  const up = await axios.post(`${base}/media`, form, { headers: { ...auth, ...form.getHeaders() }, maxBodyLength: Infinity, timeout: 120000 });

  const tipo = { image: 'image', video: 'video', audio: 'audio' }[rec.kind] || 'document';
  const media = { id: up.data.id };
  if (tipo === 'document') media.filename = filename;
  if (tipo === 'audio' && mimetype === 'audio/ogg') media.voice = true;
  if (options.caption && tipo !== 'audio') media.caption = options.caption;
  const r = await axios.post(`${base}/messages`,
    { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: tipo, [tipo]: media },
    { headers: { ...auth, 'Content-Type': 'application/json' } });
  return r.data;
}

module.exports = { sendWhatsAppMessage, sendWhatsAppMedia };
