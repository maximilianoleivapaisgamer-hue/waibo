const axios = require('axios');

const MP_API = 'https://api.mercadopago.com';

async function createSubscription(clientId, clientEmail, plan) {
  const response = await axios.post(
    `${MP_API}/preapproval`,
    {
      reason: `Waibo — Plan ${plan.name}`,
      external_reference: clientId,
      payer_email: clientEmail,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: parseFloat(plan.price),
        currency_id: 'ARS'
      },
      back_url: `${process.env.FRONTEND_URL}/billing?mp_return=true`,
      status: 'pending'
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
}

async function createOneTimePayment(clientId, clientEmail, plan) {
  const response = await axios.post(
    `${MP_API}/checkout/preferences`,
    {
      items: [
        {
          title: `Waibo — Plan ${plan.name} (pago único, 1 mes)`,
          quantity: 1,
          unit_price: parseFloat(plan.price),
          currency_id: 'ARS'
        }
      ],
      payer: { email: clientEmail },
      external_reference: clientId,
      back_urls: {
        success: `${process.env.FRONTEND_URL}/billing?mp_return=true&mp_status=success`,
        failure: `${process.env.FRONTEND_URL}/billing?mp_return=true&mp_status=failure`,
        pending: `${process.env.FRONTEND_URL}/billing?mp_return=true&mp_status=pending`
      },
      auto_return: 'approved',
      notification_url: `${process.env.APP_URL}/api/mercadopago/webhook`
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
}

async function getSubscriptionStatus(preapprovalId) {
  const response = await axios.get(`${MP_API}/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
  });
  return response.data;
}

async function cancelSubscription(preapprovalId) {
  const response = await axios.put(
    `${MP_API}/preapproval/${preapprovalId}`,
    { status: 'cancelled' },
    { headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } }
  );
  return response.data;
}

async function getPaymentDetails(paymentId) {
  const response = await axios.get(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
  });
  return response.data;
}

module.exports = { createSubscription, createOneTimePayment, getSubscriptionStatus, cancelSubscription, getPaymentDetails };
