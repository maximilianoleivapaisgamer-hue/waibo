const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

function isWithinBusinessHours(config) {
  if (!config.business_hours_enabled) return true;

  const now = new Date();
  const argentinaHour = (now.getUTCHours() - 3 + 24) % 24;
  const argentinaDayIndex = (now.getUTCDay() + (now.getUTCHours() < 3 ? -1 + 7 : 0)) % 7;
  const todayName = DAY_NAMES[argentinaDayIndex];

  const enabledDays = (config.business_hours_days || '').split(',').map(d => d.trim().toLowerCase());
  if (!enabledDays.includes(todayName)) return false;

  return argentinaHour >= config.business_hours_start && argentinaHour < config.business_hours_end;
}

module.exports = { isWithinBusinessHours };
