const axios = require('axios');
const pool = require('../db');
const { encrypt, decrypt } = require('./crypto');

const ML_API = 'https://api.mercadolibre.com';

function getMLOAuthURL(clientId) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ML_APP_ID,
    redirect_uri: `${process.env.APP_URL}/api/mercadolibre/callback`,
    state: clientId
  });
  return `https://auth.mercadolibre.com.ar/authorization?${params.toString()}`;
}

async function exchangeMLCode(code) {
  const res = await axios.post(`${ML_API}/oauth/token`, {
    grant_type: 'authorization_code',
    client_id: process.env.ML_APP_ID,
    client_secret: process.env.ML_APP_SECRET,
    code,
    redirect_uri: `${process.env.APP_URL}/api/mercadolibre/callback`
  });
  return res.data;
}

async function refreshMLToken(clientId) {
  const result = await pool.query(
    'SELECT * FROM mercadolibre_tokens WHERE client_id = $1 AND active = true',
    [clientId]
  );
  if (!result.rows.length) throw new Error('No ML token found');
  const token = result.rows[0];
  const refreshToken = decrypt(token.refresh_token);

  const res = await axios.post(`${ML_API}/oauth/token`, {
    grant_type: 'refresh_token',
    client_id: process.env.ML_APP_ID,
    client_secret: process.env.ML_APP_SECRET,
    refresh_token: refreshToken
  });

  const { access_token, refresh_token, expires_in } = res.data;
  const expiresAt = new Date(Date.now() + expires_in * 1000);

  await pool.query(
    `UPDATE mercadolibre_tokens SET access_token = $1, refresh_token = $2, token_expires_at = $3 WHERE client_id = $4`,
    [encrypt(access_token), encrypt(refresh_token), expiresAt, clientId]
  );

  return access_token;
}

async function getMLToken(clientId) {
  const result = await pool.query(
    'SELECT * FROM mercadolibre_tokens WHERE client_id = $1 AND active = true',
    [clientId]
  );
  if (!result.rows.length) return null;

  const token = result.rows[0];
  if (new Date(token.token_expires_at) < new Date(Date.now() + 10 * 60 * 1000)) {
    return await refreshMLToken(clientId);
  }
  return decrypt(token.access_token);
}

async function getItemDetails(itemId, accessToken) {
  const res = await axios.get(`${ML_API}/items/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return res.data;
}

async function answerMLQuestion(questionId, answer, accessToken) {
  try {
    const res = await axios.post(
      `${ML_API}/answers`,
      { question_id: questionId, text: answer },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return res.data;
  } catch (err) {
    console.error('Error respondiendo pregunta ML:', err.response?.data || err.message);
    throw err;
  }
}

async function sendMLOrderMessage(orderId, buyerId, message, accessToken) {
  try {
    const res = await axios.post(
      `${ML_API}/messages/packs/${orderId}/sellers/me`,
      {
        from: { user_id: buyerId },
        to: { user_id: buyerId },
        text: message
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'x-pack-id': orderId } }
    );
    return res.data;
  } catch (err) {
    console.error('Error enviando mensaje ML:', err.response?.data || err.message);
  }
}

async function getMLSellerInfo(accessToken) {
  const res = await axios.get(`${ML_API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return { id: res.data.id, nickname: res.data.nickname };
}

module.exports = {
  getMLOAuthURL,
  exchangeMLCode,
  getMLToken,
  getItemDetails,
  answerMLQuestion,
  sendMLOrderMessage,
  getMLSellerInfo
};
