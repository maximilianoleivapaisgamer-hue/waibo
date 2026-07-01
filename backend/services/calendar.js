const { google } = require('googleapis');
const pool = require('../db');
const { encrypt, decrypt } = require('./crypto');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/api/agenda/callback`
  );
}

function getGoogleOAuthURL(clientId) {
  const oAuth2Client = getOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: clientId
  });
}

async function exchangeGoogleCode(code) {
  const oAuth2Client = getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
}

async function getAuthenticatedClient(clientId) {
  const result = await pool.query(
    'SELECT * FROM google_tokens WHERE client_id = $1 AND active = true',
    [clientId]
  );
  if (!result.rows.length) return null;

  const tokenRow = result.rows[0];
  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({
    access_token: decrypt(tokenRow.access_token),
    refresh_token: decrypt(tokenRow.refresh_token),
    expiry_date: tokenRow.token_expires_at ? new Date(tokenRow.token_expires_at).getTime() : null
  });

  oAuth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await pool.query(
        `UPDATE google_tokens SET access_token = $1, token_expires_at = $2 WHERE client_id = $3`,
        [encrypt(tokens.access_token), tokens.expiry_date ? new Date(tokens.expiry_date) : null, clientId]
      );
    }
  });

  return { client: oAuth2Client, calendarId: tokenRow.calendar_id || 'primary' };
}

async function getAvailableSlots(clientId, date, durationMinutes = 60) {
  const auth = await getAuthenticatedClient(clientId);
  if (!auth) return [];

  const config = await pool.query(
    'SELECT agenda_start_hour, agenda_end_hour FROM bot_configs WHERE client_id = $1',
    [clientId]
  );
  const cfg = config.rows[0] || { agenda_start_hour: 9, agenda_end_hour: 18 };

  const calendar = google.calendar({ version: 'v3', auth: auth.client });

  const startOfDay = new Date(date);
  startOfDay.setHours(cfg.agenda_start_hour, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(cfg.agenda_end_hour, 0, 0, 0);

  const busyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      items: [{ id: auth.calendarId }]
    }
  });

  const busyTimes = busyRes.data.calendars[auth.calendarId]?.busy || [];

  const slots = [];
  let current = new Date(startOfDay);

  while (current < endOfDay) {
    const slotEnd = new Date(current.getTime() + durationMinutes * 60000);
    if (slotEnd > endOfDay) break;

    const isBusy = busyTimes.some(busy => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return current < busyEnd && slotEnd > busyStart;
    });

    const isPast = current < new Date();

    if (!isBusy && !isPast) {
      slots.push({
        start: new Date(current),
        end: new Date(slotEnd),
        label: current.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
      });
    }

    current = new Date(current.getTime() + durationMinutes * 60000);
  }

  return slots;
}

async function createCalendarEvent(clientId, appointment) {
  const auth = await getAuthenticatedClient(clientId);
  if (!auth) return null;

  const calendar = google.calendar({ version: 'v3', auth: auth.client });

  const event = await calendar.events.insert({
    calendarId: auth.calendarId,
    requestBody: {
      summary: `${appointment.service_name} — ${appointment.customer_name}`,
      description: `Cliente: ${appointment.customer_name}\nTeléfono: ${appointment.customer_phone}\n${appointment.notes || ''}`,
      start: { dateTime: appointment.start_time.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
      end: { dateTime: appointment.end_time.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] }
    }
  });

  return event.data.id;
}

async function deleteCalendarEvent(clientId, eventId) {
  const auth = await getAuthenticatedClient(clientId);
  if (!auth || !eventId) return;

  const calendar = google.calendar({ version: 'v3', auth: auth.client });
  await calendar.events.delete({ calendarId: auth.calendarId, eventId }).catch(() => {});
}

module.exports = {
  getGoogleOAuthURL,
  exchangeGoogleCode,
  getAuthenticatedClient,
  getAvailableSlots,
  createCalendarEvent,
  deleteCalendarEvent
};
