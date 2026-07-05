const cron = require('node-cron');
const pool = require('../db');
const nodemailer = require('nodemailer');
const { sendWhatsAppMessage } = require('./whatsapp');
const { sendInstagramDM } = require('./instagram');
const { sendMessengerMessage } = require('./facebook');
const { sendTikTokDM, getTikTokToken } = require('./tiktok');
const { decrypt } = require('./crypto');
const { getPendingFollowups, markFollowupSent } = require('./scheduledFollowups');

// ── Anti-plantón: primer recordatorio, segundo recordatorio y detección no-show ──
cron.schedule('*/15 * * * *', async () => {
  try {
    const configsResult = await pool.query(
      `SELECT bc.client_id, bc.reminder_hours_before, c.whatsapp_api_key, c.whatsapp_provider, c.whatsapp_phone_id, c.business_name
       FROM bot_configs bc JOIN clients c ON c.id = bc.client_id
       WHERE bc.agenda_enabled = true AND c.active = true`
    );

    for (const cfg of configsResult.rows) {
      const hoursAhead = cfg.reminder_hours_before || 2;

      // ── 1er recordatorio: X horas antes (ventana ±15 min) ──────────
      const first = await pool.query(
        `SELECT * FROM appointments
         WHERE client_id = $1
           AND status = 'confirmed'
           AND reminder_sent = false
           AND start_time > NOW()
           AND start_time <= NOW() + ($2 || ' hours')::INTERVAL + INTERVAL '15 minutes'
           AND start_time >= NOW() + ($2 || ' hours')::INTERVAL - INTERVAL '15 minutes'`,
        [cfg.client_id, hoursAhead]
      );

      for (const appt of first.rows) {
        const timeStr = new Date(appt.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const msg =
          `⏰ *Recordatorio de turno*\n\n` +
          `Hola ${appt.customer_name || 'cliente'}, te recordamos que tenés un turno de ` +
          `*${appt.service_name}* hoy a las *${timeStr} hs*.\n\n` +
          `✅ Respondé *SI* para confirmar tu asistencia\n❌ Respondé *CANCELAR* si no podés venir`;
        try {
          if (cfg.whatsapp_api_key) {
            await sendWhatsAppMessage(appt.customer_phone, msg, cfg.whatsapp_api_key, { provider: cfg.whatsapp_provider || '360dialog', phoneNumberId: cfg.whatsapp_phone_id });
          }
          await pool.query('UPDATE appointments SET reminder_sent = true WHERE id = $1', [appt.id]);
          console.log(`✅ 1er recordatorio → ${appt.customer_phone} (${appt.service_name} ${timeStr})`);
        } catch (err) {
          console.error(`❌ Error 1er recordatorio:`, err.message);
        }
      }

      // ── 2do recordatorio: 30 min antes si no confirmó ──────────────
      const second = await pool.query(
        `SELECT * FROM appointments
         WHERE client_id = $1
           AND status = 'confirmed'
           AND reminder_sent = true
           AND second_reminder_sent = false
           AND reminder_confirmed = false
           AND start_time > NOW()
           AND start_time <= NOW() + INTERVAL '30 minutes' + INTERVAL '15 minutes'
           AND start_time >= NOW() + INTERVAL '30 minutes' - INTERVAL '15 minutes'`,
        [cfg.client_id]
      );

      for (const appt of second.rows) {
        const timeStr = new Date(appt.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const msg =
          `⚠️ *Último aviso — turno en 30 minutos*\n\n` +
          `${appt.customer_name || 'Hola'}, tu turno de *${appt.service_name}* es a las *${timeStr} hs*.\n\n` +
          `¿Seguís viniendo? Respondé *SI* para confirmar o *CANCELAR* si no podés.`;
        try {
          if (cfg.whatsapp_api_key) {
            await sendWhatsAppMessage(appt.customer_phone, msg, cfg.whatsapp_api_key, { provider: cfg.whatsapp_provider || '360dialog', phoneNumberId: cfg.whatsapp_phone_id });
          }
          await pool.query('UPDATE appointments SET second_reminder_sent = true WHERE id = $1', [appt.id]);
          console.log(`✅ 2do recordatorio → ${appt.customer_phone} (${appt.service_name} ${timeStr})`);
        } catch (err) {
          console.error(`❌ Error 2do recordatorio:`, err.message);
        }
      }

      // ── Detección de no-show: turno pasado sin confirmación ────────
      const noshows = await pool.query(
        `SELECT * FROM appointments
         WHERE client_id = $1
           AND status = 'confirmed'
           AND no_show = false
           AND reminder_sent = true
           AND reminder_confirmed = false
           AND end_time < NOW() - INTERVAL '10 minutes'`,
        [cfg.client_id]
      );

      for (const appt of noshows.rows) {
        try {
          await pool.query(
            `UPDATE appointments SET no_show = true, status = 'completed' WHERE id = $1`,
            [appt.id]
          );

          const dateStr = new Date(appt.start_time).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
          const timeStr = new Date(appt.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

          const { createAlert } = require('./alerts');
          await createAlert(cfg.client_id, null, 'no_show',
            `🚫 Plantón detectado: *${appt.customer_name || appt.customer_phone}* no confirmó ni se presentó al turno de *${appt.service_name}* del ${dateStr} a las ${timeStr} hs`
          ).catch(() => {});

          console.log(`⚠️ No-show registrado: ${appt.customer_name || appt.customer_phone} — ${appt.service_name}`);
        } catch (err) {
          console.error(`❌ Error registrando no-show:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('❌ Error en cronjob anti-plantón:', err.message);
  }
});

// ── Suspensión por morosidad (diario a las 9am) ────────────────────
cron.schedule('0 9 * * *', async () => {
  console.log('🔄 Verificando clientes morosos...');
  try {
    const result = await pool.query(`
      UPDATE billing SET status = 'suspended', suspended_at = NOW()
      WHERE status = 'active'
        AND next_due < NOW() - INTERVAL '3 days'
      RETURNING client_id
    `);

    if (result.rows.length > 0) {
      const ids = result.rows.map(r => r.client_id);
      await pool.query(`UPDATE clients SET active = false WHERE id = ANY($1::uuid[])`, [ids]);
      console.log(`⚠️ ${ids.length} cliente(s) suspendido(s) por morosidad`);
    }
  } catch (err) {
    console.error('❌ Error en cronjob de facturación:', err.message);
  }
});

// ── Limpiar turnos pasados (diario a medianoche) ───────────────────
cron.schedule('0 0 * * *', async () => {
  try {
    await pool.query(
      `UPDATE appointments SET status = 'completed'
       WHERE status = 'confirmed' AND end_time < NOW() - INTERVAL '1 hour'`
    );
  } catch (err) {
    console.error('❌ Error limpiando turnos:', err.message);
  }
});

// ── Seguimiento de consultas abandonadas (cada 15 minutos) ─────────
cron.schedule('*/15 * * * *', async () => {
  try {
    const configsResult = await pool.query(
      `SELECT bc.client_id, bc.followup_enabled, bc.followup_wait_minutes,
              bc.followup_max_attempts, bc.followup_message, c.whatsapp_api_key, c.whatsapp_provider, c.whatsapp_phone_id
       FROM bot_configs bc JOIN clients c ON c.id = bc.client_id
       WHERE bc.followup_enabled = true AND c.active = true`
    );

    for (const cfg of configsResult.rows) {
      const abandonedConvs = await pool.query(
        `SELECT c.* FROM conversations c
         WHERE c.client_id = $1
           AND c.status = 'bot'
           AND c.followup_count < $2
           AND (
             SELECT role FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1
           ) = 'assistant'
           AND (
             SELECT timestamp FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1
           ) < NOW() - ($3 || ' minutes')::INTERVAL
           AND (
             c.last_followup_at IS NULL OR c.last_followup_at < NOW() - ($3 || ' minutes')::INTERVAL
           )`,
        [cfg.client_id, cfg.followup_max_attempts, cfg.followup_wait_minutes]
      );

      for (const conv of abandonedConvs.rows) {
        try {
          let sent = false;

          if (conv.channel === 'whatsapp' && cfg.whatsapp_api_key) {
            await sendWhatsAppMessage(conv.customer_phone, cfg.followup_message, cfg.whatsapp_api_key, { provider: cfg.whatsapp_provider || '360dialog', phoneNumberId: cfg.whatsapp_phone_id });
            sent = true;
          } else if (conv.channel === 'instagram') {
            const igToken = await pool.query('SELECT access_token FROM instagram_tokens WHERE client_id = $1 AND active = true', [cfg.client_id]);
            if (igToken.rows.length) {
              await sendInstagramDM(conv.channel_user_id, cfg.followup_message, decrypt(igToken.rows[0].access_token));
              sent = true;
            }
          } else if (conv.channel === 'facebook') {
            const fbToken = await pool.query('SELECT access_token FROM facebook_tokens WHERE client_id = $1 AND active = true', [cfg.client_id]);
            if (fbToken.rows.length) {
              await sendMessengerMessage(conv.channel_user_id, cfg.followup_message, decrypt(fbToken.rows[0].access_token));
              sent = true;
            }
          } else if (conv.channel === 'tiktok') {
            const ttTokenRow = await pool.query('SELECT tiktok_open_id FROM tiktok_tokens WHERE client_id = $1 AND active = true', [cfg.client_id]);
            const accessToken = await getTikTokToken(cfg.client_id);
            if (ttTokenRow.rows.length && accessToken) {
              await sendTikTokDM(conv.channel_user_id, cfg.followup_message, accessToken, ttTokenRow.rows[0].tiktok_open_id);
              sent = true;
            }
          }

          if (sent) {
            await pool.query(
              'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
              [conv.id, 'assistant', cfg.followup_message]
            );
            await pool.query(
              `UPDATE conversations SET followup_count = followup_count + 1, last_followup_at = NOW(), updated_at = NOW() WHERE id = $1`,
              [conv.id]
            );
            console.log(`✅ Seguimiento enviado a conversación ${conv.id} (intento ${conv.followup_count + 1}/${cfg.followup_max_attempts})`);
          }
        } catch (err) {
          console.error(`❌ Error enviando seguimiento a conversación ${conv.id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('❌ Error en cronjob de seguimiento:', err.message);
  }
});

// ── Recordatorios programados por fecha pedida (cada 30 minutos) ──
cron.schedule('*/30 * * * *', async () => {
  try {
    const pending = await getPendingFollowups();

    for (const followup of pending) {
      try {
        const message = `¡Hola! 😊 Te escribo como me pediste, sobre: ${followup.reason}. ¿Seguís interesado o tenés alguna consulta?`;

        if (followup.channel === 'whatsapp') {
          const clientResult = await pool.query('SELECT whatsapp_api_key, whatsapp_provider, whatsapp_phone_id FROM clients WHERE id = $1', [followup.client_id]);
          const cr = clientResult.rows[0];
          if (cr?.whatsapp_api_key) {
            await sendWhatsAppMessage(followup.customer_phone, message, cr.whatsapp_api_key, { provider: cr.whatsapp_provider || '360dialog', phoneNumberId: cr.whatsapp_phone_id });
          }
        } else if (followup.channel === 'instagram') {
          const igToken = await pool.query('SELECT access_token FROM instagram_tokens WHERE client_id = $1 AND active = true', [followup.client_id]);
          if (igToken.rows.length) {
            await sendInstagramDM(followup.channel_user_id, message, decrypt(igToken.rows[0].access_token));
          }
        } else if (followup.channel === 'facebook') {
          const fbToken = await pool.query('SELECT access_token FROM facebook_tokens WHERE client_id = $1 AND active = true', [followup.client_id]);
          if (fbToken.rows.length) {
            await sendMessengerMessage(followup.channel_user_id, message, decrypt(fbToken.rows[0].access_token));
          }
        } else if (followup.channel === 'tiktok') {
          const ttTokenRow = await pool.query('SELECT tiktok_open_id FROM tiktok_tokens WHERE client_id = $1 AND active = true', [followup.client_id]);
          const accessToken = await getTikTokToken(followup.client_id);
          if (ttTokenRow.rows.length && accessToken) {
            await sendTikTokDM(followup.channel_user_id, message, accessToken, ttTokenRow.rows[0].tiktok_open_id);
          }
        }

        if (followup.conversation_id) {
          await pool.query(
            'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
            [followup.conversation_id, 'assistant', message]
          );
        }

        await markFollowupSent(followup.id);
        console.log(`✅ Recordatorio programado enviado a ${followup.customer_phone} (motivo: ${followup.reason})`);
      } catch (err) {
        console.error(`❌ Error enviando recordatorio programado ${followup.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Error en cronjob de recordatorios programados:', err.message);
  }
});

async function reactivateClient(clientId) {
  try {
    await pool.query(
      `UPDATE billing SET status = 'active', suspended_at = NULL,
       last_payment = NOW(), next_due = NOW() + INTERVAL '30 days'
       WHERE client_id = $1`,
      [clientId]
    );
    await pool.query(`UPDATE clients SET active = true WHERE id = $1`, [clientId]);
    return true;
  } catch (err) {
    console.error('Error reactivando cliente:', err.message);
    return false;
  }
}

// ── Retención de datos — 24 meses (cada domingo a las 3am) ────────────
cron.schedule('0 3 * * 0', async () => {
  const RETENTION_MONTHS = 24;
  const cutoff = `NOW() - INTERVAL '${RETENTION_MONTHS} months'`;
  let totalConversaciones = 0;
  let totalMensajes = 0;
  let totalTurnos = 0;
  let totalPedidos = 0;
  let totalVariables = 0;
  let totalSeguimientos = 0;

  console.log(`[Retención] Iniciando limpieza de datos con más de ${RETENTION_MONTHS} meses de antigüedad...`);

  try {
    // Conversaciones sin actividad en 24 meses
    const convResult = await pool.query(
      `SELECT id FROM conversations WHERE updated_at < ${cutoff}`
    );
    const convIds = convResult.rows.map(r => r.id);

    if (convIds.length) {
      // Borrar mensajes de esas conversaciones
      const msgResult = await pool.query(
        `DELETE FROM messages WHERE conversation_id = ANY($1::uuid[])`,
        [convIds]
      );
      totalMensajes = msgResult.rowCount;

      // Anonimizar la conversación (mantener registro para estadísticas)
      const convAnon = await pool.query(
        `UPDATE conversations
         SET customer_phone = 'ELIMINADO', customer_name = 'ELIMINADO'
         WHERE id = ANY($1::uuid[])`,
        [convIds]
      );
      totalConversaciones = convAnon.rowCount;

      // Borrar follow-ups asociados
      const fuResult = await pool.query(
        `DELETE FROM scheduled_followups WHERE conversation_id = ANY($1::uuid[])`,
        [convIds]
      );
      totalSeguimientos = fuResult.rowCount;
    }

    // Turnos con más de 24 meses
    const apptResult = await pool.query(
      `DELETE FROM appointments WHERE created_at < ${cutoff}`
    );
    totalTurnos = apptResult.rowCount;

    // Pedidos con más de 24 meses
    const ordResult = await pool.query(
      `DELETE FROM orders WHERE created_at < ${cutoff}`
    );
    totalPedidos = ordResult.rowCount;

    // Variables de contacto cuya conversación ya fue anonimizada
    const cvResult = await pool.query(
      `DELETE FROM contact_variables
       WHERE customer_phone = 'ELIMINADO'
          OR updated_at < ${cutoff}`
    );
    totalVariables = cvResult.rowCount;

    console.log(
      `[Retención] Corrida completada:\n` +
      `  Conversaciones anonimizadas : ${totalConversaciones}\n` +
      `  Mensajes eliminados         : ${totalMensajes}\n` +
      `  Turnos eliminados           : ${totalTurnos}\n` +
      `  Pedidos eliminados          : ${totalPedidos}\n` +
      `  Variables eliminadas        : ${totalVariables}\n` +
      `  Seguimientos eliminados     : ${totalSeguimientos}`
    );
  } catch (err) {
    console.error('[Retención] Error en cron de retención de datos:', err.message);
  }
});

// ── Notificaciones de prueba vencida / por vencer (diario a las 10am) ──
cron.schedule('0 10 * * *', async () => {
  try {
    const transporter = nodemailer.createTransport({
      host: '172.65.255.143', port: 587, secure: false, requireTLS: true,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
      tls: { servername: 'smtp.hostinger.com' },
    });

    // Clientes con prueba que vence en exactamente 3 días (aviso previo)
    const ending = await pool.query(`
      SELECT c.id, c.name, c.email, c.business_name, c.trial_ends_at
      FROM clients c
      LEFT JOIN billing b ON b.client_id = c.id
      WHERE c.trial_ends_at IS NOT NULL
        AND c.trial_ends_at > NOW()
        AND c.trial_ends_at <= NOW() + INTERVAL '3 days'
        AND c.trial_reminder_sent = false
        AND (b.status IS NULL OR b.status NOT IN ('active'))
    `);

    for (const c of ending.rows) {
      const days = Math.ceil((new Date(c.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24));
      try {
        await transporter.sendMail({
          from: `"Waibo" <${process.env.MAIL_USER}>`,
          to: c.email,
          subject: `Tu prueba gratuita vence en ${days} día${days !== 1 ? 's' : ''} — Waibo`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#1A1A2E">
              <img src="https://frontend-lac-nine-16.vercel.app/waibo-logo.png" width="48" style="border-radius:12px;margin-bottom:16px"/>
              <h2 style="margin:0 0 8px">⏰ Tu prueba gratuita está por vencer</h2>
              <p>Hola <strong>${c.business_name || c.name}</strong>,</p>
              <p>Tu período de prueba gratuita de <strong>Waibo</strong> vence en <strong>${days} día${days !== 1 ? 's' : ''}</strong>.</p>
              <p>Para seguir recibiendo y respondiendo mensajes automáticamente con IA, activá tu plan antes de que venza.</p>
              <a href="https://frontend-lac-nine-16.vercel.app/billing" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#7C3AED;color:white;border-radius:10px;text-decoration:none;font-weight:600">Activar mi plan</a>
              <p style="color:#6B7280;font-size:13px;margin-top:24px">¿Tenés dudas? Escribinos a <a href="mailto:hola@waibochat.com">hola@waibochat.com</a></p>
            </div>
          `,
        });
        await pool.query('UPDATE clients SET trial_reminder_sent = true WHERE id = $1', [c.id]);
        console.log(`📧 Aviso de trial enviado a ${c.email} (${days} días restantes)`);
      } catch (e) {
        console.error(`❌ Error enviando aviso de trial a ${c.email}:`, e.message);
      }
    }

    // Clientes con prueba vencida hoy (notificación de vencimiento)
    const expired = await pool.query(`
      SELECT c.id, c.name, c.email, c.business_name
      FROM clients c
      LEFT JOIN billing b ON b.client_id = c.id
      WHERE c.trial_ends_at IS NOT NULL
        AND c.trial_ends_at < NOW()
        AND c.trial_ends_at > NOW() - INTERVAL '1 day'
        AND (b.status IS NULL OR b.status NOT IN ('active'))
    `);

    for (const c of expired.rows) {
      try {
        await transporter.sendMail({
          from: `"Waibo" <${process.env.MAIL_USER}>`,
          to: c.email,
          subject: 'Tu prueba gratuita venció — Waibo',
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#1A1A2E">
              <img src="https://frontend-lac-nine-16.vercel.app/waibo-logo.png" width="48" style="border-radius:12px;margin-bottom:16px"/>
              <h2 style="margin:0 0 8px">Tu prueba gratuita venció</h2>
              <p>Hola <strong>${c.business_name || c.name}</strong>,</p>
              <p>Tu período de prueba gratuita de <strong>14 días</strong> en Waibo llegó a su fin.</p>
              <p>Para continuar usando el bot con IA y no perder tus conversaciones y configuración, activá tu plan hoy.</p>
              <a href="https://frontend-lac-nine-16.vercel.app/billing" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#7C3AED;color:white;border-radius:10px;text-decoration:none;font-weight:600">Activar mi plan ahora</a>
              <p style="color:#6B7280;font-size:13px;margin-top:24px">¿Necesitás más tiempo o tenés dudas? Escribinos a <a href="mailto:hola@waibochat.com">hola@waibochat.com</a> y lo resolvemos.</p>
            </div>
          `,
        });
        console.log(`📧 Notificación de trial vencido enviada a ${c.email}`);
      } catch (e) {
        console.error(`❌ Error notificando trial vencido a ${c.email}:`, e.message);
      }
    }
  } catch (err) {
    console.error('❌ Error en cronjob de trial:', err.message);
  }
});

console.log('✅ Cronjobs iniciados (recordatorios + morosidad + limpieza + seguimientos + retención)');
module.exports = { reactivateClient };
