const axios = require('axios');
const FormData = require('form-data');

async function transcribeAudio(audioBuffer, mimeType = 'audio/ogg') {
  try {
    const formData = new FormData();
    const extension = mimeType.includes('ogg') ? 'ogg' :
                      mimeType.includes('mpeg') ? 'mp3' :
                      mimeType.includes('mp4') ? 'mp4' : 'ogg';

    formData.append('file', audioBuffer, {
      filename: `audio.${extension}`,
      contentType: mimeType
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'es');

    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          ...formData.getHeaders()
        }
      }
    );

    return response.data.text;
  } catch (err) {
    console.error('Error transcribiendo audio:', err.response?.data || err.message);
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

module.exports = { transcribeAudio, downloadAndTranscribe };
