const axios = require('axios');
const nodemailer = require('nodemailer');
const pool = require('../db');

/*
 * Avisos de WhatsApp por QR desconectado. Dos caminos:
 *  - el servicio QR avisa cuando WhatsApp cierra la sesión (/api/whatsapp-qr/disconnected)
 *  - un chequeo cada 5 minutos, porque si la PC o el servicio están apagados nadie avisa nada
 * Se avisa una sola vez por caída (alerta en el panel + mail al negocio); vuelve a avisar
 * recién después de que se reconecte.
 */

function mailer() {
  return nodemailer.createTransport({
    host: '172.65.255.143',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    tls: { servername: 'smtp.hostinger.com' }
  });
}

const MOTIVOS = {
  LOGOUT: 'se cerró la sesión desde el celular o WhatsApp la venció',
  servicio_caido: 'el servicio de conexión no responde',
  auth_failure: 'WhatsApp rechazó la sesión guardada'
};

async function marcarDesconectado(clientId, motivo) {
  const prev = await pool.query('SELECT status FROM whatsapp_qr_sessions WHERE client_id = $1', [clientId]);
  if (!prev.rows.length || prev.rows[0].status !== 'connected') return false;

  await pool.query(`UPDATE whatsapp_qr_sessions SET status = 'disconnected' WHERE client_id = $1`, [clientId]);
  const texto = `Tu WhatsApp se desconectó de Waibo (${MOTIVOS[motivo] || motivo}). El bot no está contestando: entrá a WhatsApp en el panel y escaneá el QR de nuevo.`;
  await pool.query(`INSERT INTO alerts (client_id, type, message) VALUES ($1, 'whatsapp_disconnected', $2)`, [clientId, texto]);
  console.log(`[qr] ${clientId} desconectado: ${motivo}`);

  // Por WhatsApp no se puede avisar (la línea es justamente la que se cayó): va por mail.
  try {
    const c = (await pool.query('SELECT email, business_name, name FROM clients WHERE id = $1', [clientId])).rows[0];
    if (c?.email && process.env.MAIL_USER) {
      const panel = process.env.FRONTEND_URL || 'https://app.waibochat.com';
      await mailer().sendMail({
        from: `"Waibo" <${process.env.MAIL_USER}>`,
        to: c.email,
        subject: '⚠️ Tu WhatsApp se desconectó de Waibo',
        html: `<div style="font-family:sans-serif;max-width:520px">
          <h2 style="color:#B91C1C">Tu WhatsApp se desconectó</h2>
          <p>Hola ${c.business_name || c.name || ''}, tu línea de WhatsApp dejó de estar conectada a Waibo (${MOTIVOS[motivo] || motivo}).</p>
          <p><strong>Mientras tanto el bot no contesta.</strong> Para volver a conectarla, entrá al panel, andá a WhatsApp y escaneá el QR con el celular.</p>
          <p><a href="${panel}/channels" style="background:#7C3AED;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reconectar WhatsApp</a></p>
        </div>`
      });
    }
  } catch (e) {
    console.error('[qr] no se pudo mandar el mail de desconexión:', e.message);
  }
  return true;
}

async function chequearSesiones() {
  const url = process.env.QR_SERVICE_URL;
  if (!url) return;
  const secret = process.env.QR_SERVICE_SECRET || 'whabot_qr_secret_2024';
  const activas = (await pool.query(
    `SELECT s.client_id FROM whatsapp_qr_sessions s JOIN clients c ON c.id = s.client_id
     WHERE s.status = 'connected' AND c.whatsapp_mode = 'qr' AND c.active = true`
  )).rows;
  for (const { client_id } of activas) {
    let estado = null;
    try {
      const r = await axios.get(`${url}/session/${client_id}/status`, { headers: { 'x-service-secret': secret }, timeout: 20000 });
      estado = r.data.status;
    } catch (_) {
      estado = 'servicio_caido';
    }
    if (['connected', 'connecting', 'starting'].includes(estado)) continue;
    // Un fallo suelto del túnel no es una caída: se confirma con un segundo intento.
    await new Promise((r) => setTimeout(r, 30000));
    try {
      const r = await axios.get(`${url}/session/${client_id}/status`, { headers: { 'x-service-secret': secret }, timeout: 20000 });
      if (r.data.status === 'connected') continue;
      if (['connecting', 'starting'].includes(r.data.status)) continue;
      estado = ['qr_ready', 'disconnected'].includes(r.data.status) ? 'LOGOUT' : r.data.status;
    } catch (_) {
      estado = 'servicio_caido';
    }
    await marcarDesconectado(client_id, estado);
  }
}

module.exports = { marcarDesconectado, chequearSesiones };
