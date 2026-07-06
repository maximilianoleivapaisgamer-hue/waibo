const nodemailer = require('nodemailer');

function getMailer() {
  return nodemailer.createTransport({
    host: '172.65.255.143', port: 587, secure: false, requireTLS: true,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    tls: { servername: 'smtp.hostinger.com' },
  });
}

async function sendConversionEmail(client, planName) {
  const mailer = getMailer();

  // Email al cliente
  await mailer.sendMail({
    from: `"Waibo" <${process.env.MAIL_USER}>`,
    to: client.email,
    subject: `¡Tu plan ${planName} está activo! 🎉 — Waibo`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
        <div style="background:linear-gradient(135deg,#7C3AED,#5B21B6);padding:32px;text-align:center">
          <img src="${process.env.FRONTEND_URL}/waibo-logo.png" width="48" style="border-radius:12px;margin-bottom:12px"/>
          <h1 style="color:white;margin:0;font-size:24px">¡Bienvenido al plan ${planName}! 🚀</h1>
        </div>
        <div style="padding:32px;color:#1A1A2E">
          <p>Hola <strong>${client.business_name || client.name}</strong>,</p>
          <p>Tu suscripción está <strong>activa</strong>. Tu bot de IA ya está respondiendo consultas de tus clientes las 24 horas.</p>
          <div style="background:#F5F3FF;border-radius:12px;padding:20px;margin:20px 0">
            <p style="margin:0;font-weight:700;font-size:15px">✅ Lo que incluye tu plan ${planName}:</p>
            ${planName.toLowerCase().includes('pro') || planName.toLowerCase().includes('commerce') ? `
            <p style="margin:10px 0 0;font-size:14px;color:#374151">• WhatsApp Business + Instagram + Facebook<br>• Mercado Libre + Tiendanube<br>• Agenda de turnos<br>• Estadísticas avanzadas<br>• Soporte prioritario</p>
            ` : `
            <p style="margin:10px 0 0;font-size:14px;color:#374151">• WhatsApp Business + Instagram + Facebook<br>• Agenda de turnos<br>• Base de conocimiento<br>• Estadísticas básicas<br>• Soporte por email</p>
            `}
          </div>
          <p>Si necesitás ayuda para configurar algo, respondé este email y te ayudamos.</p>
          <a href="${process.env.FRONTEND_URL}/dashboard" style="display:inline-block;margin:8px 0 16px;padding:13px 28px;background:#7C3AED;color:white;border-radius:10px;text-decoration:none;font-weight:600">Ir a mi panel →</a>
          <p style="color:#6B7280;font-size:13px;margin-top:16px">¿Preguntas? Escribinos a <a href="mailto:hola@waibochat.com" style="color:#7C3AED">hola@waibochat.com</a></p>
        </div>
      </div>
    `,
  });

  // Notificación interna al admin de Waibo
  if (process.env.MAIL_ADMIN) {
    await mailer.sendMail({
      from: `"Waibo Sistema" <${process.env.MAIL_USER}>`,
      to: process.env.MAIL_ADMIN,
      subject: `💰 Nueva conversión — ${client.business_name || client.name} activó ${planName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1A1A2E">
          <h2 style="margin:0 0 16px;color:#7C3AED">💰 Nueva conversión</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#6B7280">Negocio</td><td style="padding:6px 0;font-weight:600">${client.business_name || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#6B7280">Nombre</td><td style="padding:6px 0">${client.name}</td></tr>
            <tr><td style="padding:6px 0;color:#6B7280">Email</td><td style="padding:6px 0">${client.email}</td></tr>
            <tr><td style="padding:6px 0;color:#6B7280">Plan activado</td><td style="padding:6px 0;font-weight:700;color:#059669">${planName}</td></tr>
          </table>
        </div>
      `,
    });
  }
}

module.exports = { getMailer, sendConversionEmail };
