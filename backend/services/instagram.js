const axios = require('axios');

const GRAPH_URL = 'https://graph.facebook.com/v18.0';

async function sendInstagramDM(recipientId, message, accessToken) {
  try {
    const response = await axios.post(
      `${GRAPH_URL}/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text: message }
      },
      { params: { access_token: accessToken } }
    );
    return response.data;
  } catch (err) {
    console.error('Error enviando DM Instagram:', err.response?.data || err.message);
    throw err;
  }
}

async function replyToComment(commentId, message, accessToken) {
  try {
    const response = await axios.post(
      `${GRAPH_URL}/${commentId}/replies`,
      { message },
      { params: { access_token: accessToken } }
    );
    return response.data;
  } catch (err) {
    console.error('Error respondiendo comentario:', err.response?.data || err.message);
    throw err;
  }
}

function getInstagramOAuthURL(clientId) {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID,
    redirect_uri: `${process.env.APP_URL}/api/instagram/callback`,
    scope: 'instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list,pages_read_engagement',
    response_type: 'code',
    state: clientId
  });
  return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  try {
    const response = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: `${process.env.APP_URL}/api/instagram/callback`,
        code
      }
    });

    const longLived = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: response.data.access_token
      }
    });

    return longLived.data.access_token;
  } catch (err) {
    console.error('Error obteniendo token Instagram:', err.response?.data || err.message);
    throw err;
  }
}

async function getInstagramAccount(accessToken) {
  try {
    const pagesRes = await axios.get(`${GRAPH_URL}/me/accounts`, {
      params: { access_token: accessToken, fields: 'id,name,access_token,instagram_business_account' }
    });

    const page = pagesRes.data.data.find(p => p.instagram_business_account);
    if (!page) throw new Error('No se encontró cuenta de Instagram Business vinculada');

    return {
      pageId: page.id,
      pageName: page.name,
      pageToken: page.access_token,
      instagramAccountId: page.instagram_business_account.id
    };
  } catch (err) {
    console.error('Error obteniendo cuenta Instagram:', err.response?.data || err.message);
    throw err;
  }
}

module.exports = {
  sendInstagramDM,
  replyToComment,
  getInstagramOAuthURL,
  exchangeCodeForToken,
  getInstagramAccount
};
