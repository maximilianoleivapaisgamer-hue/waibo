// Fecha del último mensaje al estilo WhatsApp: hora si es de hoy, "ayer", el día de
// la semana si fue esta semana, y la fecha si es más viejo.
export function lastContactLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (dias <= 0) return hora;
  if (dias === 1) return `ayer ${hora}`;
  if (dias < 7) return d.toLocaleDateString('es-AR', { weekday: 'long' });
  const mismoAnio = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('es-AR', mismoAnio ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// Texto largo para el tooltip: "Último contacto: 12/09/2026 14:32 (hace 5 días)".
export function lastContactTitle(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  const hace = dias <= 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
  return `Último contacto: ${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} (${hace})`;
}
