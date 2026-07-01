const axios = require('axios');
const pool = require('../db');
const { encrypt, decrypt } = require('./crypto');

const TT_API = 'https://business-api.tiktok.com/open_api/v1.3';
const TT_AUTH = 'https://www.tiktok.com/v2/auth/authorize';
const TT_TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';

function getTikTokOAuthURL(clientId) {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    scope: 'user.info.basic,message.send,message.history',
    response_type: 'code',
    redirect_uri: `${process.env.APP_URL}/api/tiktok/callback`,
    state: clientId
  });
  return `${TT_AUTH}?${params.toString()}`;
}

async function exchangeTikTokCode(code) {
  const res = await axios.post(TT_TOKEN, {
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: `${process.env.APP_URL}/api/tiktok/callback`
  }, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data.data;
}

async function refreshTikTokToken(clientId) {
  const result = await pool.query(
    'SELECT * FROM tiktok_tokens WHERE client_id = $1 AND active = true',
    [clientId]
  );
  if (!result.rows.length) throw new Error('No TikTok token found');
  const token = result.rows[0];
  const refreshToken = decrypt(token.refresh_token);

  const res = await axios.post(TT_TOKEN, {
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  }, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const data = res.data.data;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  const refreshExpiresAt = new Date(Date.now() + data.refresh_expires_in * 1000);

  await pool.query(
    `UPDATE tiktok_tokens SET
       access_token = $1, refresh_token = $2,
       token_expires_at = $3, refresh_expires_at = $4
     WHERE client_id = $5`,
    [encrypt(data.access_token), encrypt(data.refresh_token), expiresAt, refreshExpiresAt, clientId]
  );

  return data.access_token;
}

async function getTikTokToken(clientId) {
  const result = await pool.query(
    'SELECT * FROM tiktok_tokens WHERE client_id = $1 AND active = true',
    [clientId]
  );
  if (!result.rows.length) return null;

  const token = result.rows[0];

  if (token.refresh_expires_at && new Date(token.refresh_expires_at) < new Date()) {
    await pool.query(
      'UPDATE tiktok_tokens SET active = false WHERE client_id = $1', [clientId]
    );
    return null;
  }

  if (new Date(token.token_expires_at) < new Date(Date.now() + 10 * 60 * 1000)) {
    return await refreshTikTokToken(clientId);
  }

  return decrypt(token.access_token);
}

async function getTikTokUserInfo(accessToken, openId) {
  const res = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      fields: 'open_id,union_id,avatar_url,display_name'
    }
  });
  return res.data.data?.user || {};
}

async function sendTikTokDM(recipientOpenId, message, accessToken, businessId) {
  try {
    const res = await axios.post(
      `${TT_API}/business/message/send/`,
      {
        business_id: businessId,
        to_user_id: recipientOpenId,
        message_type: 'TEXT',
        content: { text: message }
      },
      {
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (res.data.code !== 0) {
      console.error('Error TikTok DM:', res.data.message);
      return null;
    }

    return res.data.data;
  } catch (err) {
    console.error('Error enviando DM TikTok:', err.response?.data || err.message);
    throw err;
  }
}

async function getTikTokMessageHistory(conversationId, accessToken, businessId) {
  try {
    const res = await axios.get(
      `${TT_API}/business/message/history/`,
      {
        headers: { 'Access-Token': accessToken },
        params: {
          business_id: businessId,
          conversation_id: conversationId,
          page_size: 20,
          sort_order: 'DESC'
        }
      }
    );
    return res.data.data?.messages || [];
  } catch (err) {
    console.error('Error obteniendo historial TikTok:', err.message);
    return [];
  }
}

async function registerTikTokWebhook(accessToken, businessId, webhookUrl) {
  try {
    const res = await axios.post(
      `${TT_API}/business/webhook/config/create/`,
      {
        business_id: businessId,
        webhook_url: webhookUrl,
        events: ['direct_message']
      },
      {
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );
    return res.data.code === 0;
  } catch (err) {
    console.error('Error registrando webhook TikTok:', err.message);
    return false;
  }
}

module.exports = {
  getTikTokOAuthURL,
  exchangeTikTokCode,
  getTikTokToken,
  getTikTokUserInfo,
  sendTikTokDM,
  getTikTokMessageHistory,
  registerTikTokWebhook
};
