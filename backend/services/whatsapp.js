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

module.exports = { sendWhatsAppMessage };
