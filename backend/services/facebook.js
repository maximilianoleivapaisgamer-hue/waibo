const axios = require('axios');

const GRAPH_URL = 'https://graph.facebook.com/v18.0';

async function sendMessengerMessage(recipientId, message, pageAccessToken) {
  try {
    const response = await axios.post(
      `${GRAPH_URL}/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text: message }
      },
      { params: { access_token: pageAccessToken } }
    );
    return response.data;
  } catch (err) {
    console.error('Error enviando Messenger:', err.response?.data || err.message);
    throw err;
  }
}

async function replyToFacebookComment(commentId, message, pageAccessToken) {
  try {
    const response = await axios.post(
      `${GRAPH_URL}/${commentId}/comments`,
      { message },
      { params: { access_token: pageAccessToken } }
    );
    return response.data;
  } catch (err) {
    console.error('Error respondiendo comentario FB:', err.response?.data || err.message);
    throw err;
  }
}

async function respondToReviewViaMessenger(reviewerId, message, pageAccessToken) {
  return sendMessengerMessage(reviewerId, message, pageAccessToken);
}

function getFacebookOAuthURL(clientId) {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID,
    redirect_uri: `${process.env.APP_URL}/api/facebook/callback`,
    scope: 'pages_show_list,pages_read_engagement,pages_messaging,pages_manage_engagement',
    response_type: 'code',
    state: clientId
  });
  return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
}

async function exchangeFacebookCode(code) {
  const response = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
    params: {
      client_id: process.env.FACEBOOK_APP_ID,
      client_secret: process.env.FACEBOOK_APP_SECRET,
      redirect_uri: `${process.env.APP_URL}/api/facebook/callback`,
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
}

async function getFacebookPage(accessToken) {
  const pagesRes = await axios.get(`${GRAPH_URL}/me/accounts`, {
    params: { access_token: accessToken, fields: 'id,name,access_token' }
  });
  const page = pagesRes.data.data[0];
  if (!page) throw new Error('No se encontró ninguna Página de Facebook vinculada a esta cuenta');
  return { pageId: page.id, pageName: page.name, pageToken: page.access_token };
}

module.exports = {
  sendMessengerMessage,
  replyToFacebookComment,
  respondToReviewViaMessenger,
  getFacebookOAuthURL,
  exchangeFacebookCode,
  getFacebookPage
};
