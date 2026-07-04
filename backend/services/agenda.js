const pool = require('../db');
const { getAvailableSlots, createCalendarEvent } = require('./calendar');

const BOOKING_KEYWORDS = [
  'turno', 'reservar', 'reserva', 'cita', 'agendar', 'agenda',
  'cuando', 'disponible', 'libre', 'horario', 'hora', 'sacar', 'quiero ir',
  'puedo ir', 'puedo venir', 'appointment', 'cuando tienen'
];

const CONFIRM_KEYWORDS = ['si', 'sí', 'dale', 'perfecto', 'buenísimo', 'ok', 'okay', 'confirmo', 'ese', 'esa', 'primero', 'segundo'];
const CANCEL_KEYWORDS = ['cancelar', 'cancel', 'no puedo', 'no voy', 'no quiero'];

function hasBookingIntent(message) {
  const lower = message.toLowerCase();
  return BOOKING_KEYWORDS.some(kw => lower.includes(kw));
}

function getNextWorkingDays(count = 3) {
  const days = [];
  const date = new Date();
  date.setDate(date.getDate() + 1);

  while (days.length < count) {
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      days.push(new Date(date));
    }
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function formatDateES(date) {
  return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

async function handleBookingFlow(clientId, customerPhone, customerName, message, conversationId) {
  const configResult = await pool.query(
    'SELECT agenda_enabled, bot_name FROM bot_configs WHERE client_id = $1',
    [clientId]
  );
  const config = configResult.rows[0];
  if (!config?.agenda_enabled) return { handled: false };

  const servicesResult = await pool.query(
    'SELECT * FROM services WHERE client_id = $1 AND active = true ORDER BY created_at LIMIT 10',
    [clientId]
  );
  const services = servicesResult.rows;

  const stateResult = await pool.query(
    `SELECT content FROM messages WHERE conversation_id = $1 AND role = 'assistant'
     ORDER BY timestamp DESC LIMIT 5`,
    [conversationId]
  );
  const recentBotMessages = stateResult.rows.map(r => r.content);
  const lastBotMsg = recentBotMessages[0] || '';

  const lower = message.toLowerCase();

  if (lastBotMsg.includes('servicio') && lastBotMsg.includes('?')) {
    for (const svc of services) {
      if (lower.includes(svc.name.toLowerCase()) || lower.match(/\\b[1-9]\\b/)) {
        await pool.query(
          'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
          [conversationId, 'system', `PENDING_SERVICE:${svc.id}:${svc.name}:${svc.duration_minutes}`]
        );
        return await offerSlots(clientId, customerPhone, svc, conversationId);
      }
    }
  }

  if (lastBotMsg.includes('hs') && (lastBotMsg.includes('o las') || lastBotMsg.includes('alguno'))) {
    const pendingResult = await pool.query(
      `SELECT content FROM messages WHERE conversation_id = $1 AND role = 'system' AND content LIKE 'PENDING%'
       ORDER BY timestamp DESC LIMIT 1`,
      [conversationId]
    );

    if (pendingResult.rows.length) {
      const [_, serviceId, serviceName, duration] = pendingResult.rows[0].content.split(':');

      const slotResult = await pool.query(
        `SELECT content FROM messages WHERE conversation_id = $1 AND role = 'system' AND content LIKE 'SLOTS:%'
         ORDER BY timestamp DESC LIMIT 1`,
        [conversationId]
      );

      if (slotResult.rows.length) {
        const slots = JSON.parse(slotResult.rows[0].content.replace('SLOTS:', ''));

        let selectedSlot = null;
        if (lower.includes('primer') || lower.includes('primero') || lower.match(/\\b1\\b/) || lower.includes(slots[0]?.label)) {
          selectedSlot = slots[0];
        } else if (lower.includes('segund') || lower.match(/\\b2\\b/) || lower.includes(slots[1]?.label)) {
          selectedSlot = slots[1];
        } else if (CONFIRM_KEYWORDS.some(k => lower.includes(k))) {
          selectedSlot = slots[0];
        }

        if (selectedSlot) {
          return await confirmAppointment(
            clientId, customerPhone, customerName,
            serviceName, new Date(selectedSlot.start), parseInt(duration), conversationId
          );
        }
      }
    }
  }

  // Confirmación de recordatorio: "SI", "confirmo", etc.
  const CONFIRM_REMINDER_KEYWORDS = ['si', 'sí', 'confirmo', 'voy', 'ahí estoy', 'ahi estoy', 'confirmed', 'ok', 'dale', 'perfecto'];
  if (CONFIRM_REMINDER_KEYWORDS.some(k => lower === k || lower.startsWith(k + ' ') || lower.endsWith(' ' + k))) {
    const upcoming = await pool.query(
      `SELECT * FROM appointments WHERE client_id = $1 AND customer_phone = $2
       AND start_time > NOW() AND status = 'confirmed' AND reminder_sent = true AND reminder_confirmed = false
       ORDER BY start_time LIMIT 1`,
      [clientId, customerPhone]
    );
    if (upcoming.rows.length) {
      const appt = upcoming.rows[0];
      await pool.query('UPDATE appointments SET reminder_confirmed = true WHERE id = $1', [appt.id]);
      const timeStr = new Date(appt.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      return {
        handled: true,
        response: `✅ ¡Perfecto, ${customerName}! Te esperamos a las *${timeStr} hs* para tu turno de *${appt.service_name}*. ¡Hasta pronto! 🙌`
      };
    }
  }

  if (CANCEL_KEYWORDS.some(k => lower.includes(k))) {
    const upcoming = await pool.query(
      `SELECT * FROM appointments WHERE client_id = $1 AND customer_phone = $2
       AND start_time > NOW() AND status = 'confirmed' ORDER BY start_time LIMIT 1`,
      [clientId, customerPhone]
    );
    if (upcoming.rows.length) {
      const appt = upcoming.rows[0];
      await pool.query(
        `UPDATE appointments SET status = 'cancelled', cancelled_by_client = true WHERE id = $1`,
        [appt.id]
      );
      const { createAlert } = require('./alerts');
      const dateStr = new Date(appt.start_time).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
      const timeStr = new Date(appt.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      await createAlert(clientId, null, 'appointment_cancelled',
        `❌ ${customerName} canceló su turno de *${appt.service_name}* del ${dateStr} a las ${timeStr} hs`
      ).catch(() => {});
      return {
        handled: true,
        response: `✅ Cancelé tu turno de *${appt.service_name}* del ${dateStr}. ¡Cuando quieras podés sacar otro! Si fue un error, escribinos y lo arreglamos 😊`
      };
    }
  }

  if (hasBookingIntent(message)) {
    if (services.length === 0) {
      return {
        handled: true,
        response: '📅 Me encantaría ayudarte con un turno, pero todavía no tenemos los servicios configurados. ¡Escribinos en un momento!'
      };
    }

    if (services.length === 1) {
      return await offerSlots(clientId, customerPhone, services[0], conversationId);
    }

    const serviceList = services.map((s, i) =>
      `*${i + 1}.* ${s.name} (${s.duration_minutes} min${s.price > 0 ? ` — $${s.price}` : ''})`
    ).join('\n');

    return {
      handled: true,
      response: `📅 ¡Con gusto! ¿Para qué servicio querés el turno?\n\n${serviceList}\n\nEscribí el número o el nombre del servicio.`
    };
  }

  return { handled: false };
}

async function offerSlots(clientId, customerPhone, service, conversationId) {
  const nextDays = getNextWorkingDays(3);
  let offeredSlots = [];

  for (const day of nextDays) {
    const slots = await getAvailableSlots(clientId, day, service.duration_minutes);
    if (slots.length >= 2) {
      offeredSlots = slots.slice(0, 2);

      await pool.query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [conversationId, 'system', `SLOTS:${JSON.stringify(offeredSlots)}`]
      );

      const dayLabel = formatDateES(day);
      const s1 = offeredSlots[0].label;
      const s2 = offeredSlots[1].label;

      return {
        handled: true,
        response: `📅 Para *${service.name}* tengo disponible el *${dayLabel}*:\n\n🕐 *${s1} hs* o 🕑 *${s2} hs*\n\n¿Cuál te queda mejor?`
      };
    }
  }

  return {
    handled: true,
    response: `📅 Por el momento no tenemos turnos disponibles para *${service.name}* en los próximos días. ¿Querés que te avisemos cuando se libere uno?`
  };
}

async function confirmAppointment(clientId, customerPhone, customerName, serviceName, startTime, duration, conversationId) {
  const endTime = new Date(startTime.getTime() + duration * 60000);

  const result = await pool.query(
    `INSERT INTO appointments (client_id, customer_phone, customer_name, service_name, start_time, end_time)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [clientId, customerPhone, customerName, serviceName, startTime, endTime]
  );
  const appt = result.rows[0];

  createCalendarEvent(clientId, appt).then(eventId => {
    if (eventId) pool.query('UPDATE appointments SET google_event_id=$1 WHERE id=$2', [eventId, appt.id]);
  }).catch(() => {});

  const dateStr = startTime.toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  const timeStr = startTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  return {
    handled: true,
    response: `✅ ¡Turno confirmado, ${customerName}!\n\n📅 *${serviceName}*\n🗓 ${dateStr} a las *${timeStr} hs*\n\nTe vamos a mandar un recordatorio 2 horas antes. ¡Nos vemos! 🙌`
  };
}

module.exports = { handleBookingFlow, hasBookingIntent };
