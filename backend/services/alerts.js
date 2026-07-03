const pool = require('../db');
const { sendWhatsAppMessage } = require('./whatsapp');
const { normalizePhone } = require('./phone');

async function createAlert(clientId, conversationId, type, message) {
  try {
    await pool.query(
      `INSERT INTO alerts (client_id, conversation_id, type, message)
       VALUES ($1, $2, $3, $4)`,
      [clientId, conversationId, type, message]
    );

    await notifyOwnerIfEnabled(clientId, message);
  } catch (err) {
    console.error('Error creando alerta:', err.message);
  }
}

async function notifyOwnerIfEnabled(clientId, message) {
  try {
    const configResult = await pool.query(
      'SELECT owner_notification_phone, owner_notifications_enabled FROM bot_configs WHERE client_id = $1',
      [clientId]
    );
    const config = configResult.rows[0];
    if (!config?.owner_notifications_enabled || !config.owner_notification_phone) return;

    const clientResult = await pool.query('SELECT whatsapp_api_key, whatsapp_provider, whatsapp_phone_id FROM clients WHERE id = $1', [clientId]);
    const cr = clientResult.rows[0];
    if (!cr?.whatsapp_api_key) return;

    const ownerPhone = normalizePhone(config.owner_notification_phone);
    await sendWhatsAppMessage(ownerPhone, `🔔 *Waibo*\n\n${message}`, cr.whatsapp_api_key, { provider: cr.whatsapp_provider || '360dialog', phoneNumberId: cr.whatsapp_phone_id });
  } catch (err) {
    console.error('Error notificando al dueño por WhatsApp:', err.message);
  }
}

async function getActiveAlerts(clientId) {
  const result = await pool.query(
    `SELECT a.*, c.customer_name, c.customer_phone, c.channel
     FROM alerts a
     LEFT JOIN conversations c ON c.id = a.conversation_id
     WHERE a.client_id = $1 AND a.resolved = false
     ORDER BY a.created_at DESC
     LIMIT 50`,
    [clientId]
  );
  return result.rows;
}

async function resolveAlert(alertId, clientId) {
  await pool.query(
    `UPDATE alerts SET resolved = true WHERE id = $1 AND client_id = $2`,
    [alertId, clientId]
  );
}

module.exports = { createAlert, getActiveAlerts, resolveAlert };
