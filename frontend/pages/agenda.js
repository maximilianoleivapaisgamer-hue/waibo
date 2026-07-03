import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Agenda() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [tab, setTab] = useState('appointments');
  const [newService, setNewService] = useState({ name: '', duration_minutes: 60, price: '', description: '' });
  const [agendaConfig, setAgendaConfig] = useState({ agenda_start_hour: 9, agenda_end_hour: 18, reminder_hours_before: 2, agenda_days: 'lunes,martes,miercoles,jueves,viernes' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });
  const showSuccess = (m) => { setSuccess(m); setTimeout(() => setSuccess(''), 4000); };
  const showError = (m) => { setError(m); setTimeout(() => setError(''), 4000); };

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/'); return; }

    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) showSuccess('✅ Google Calendar conectado correctamente');
    if (params.get('error')) showError('Error conectando Google Calendar. Intentá de nuevo.');
    if (params.toString()) window.history.replaceState({}, '', '/agenda');

    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [statusRes, servicesRes, apptRes] = await Promise.all([
        axios.get(`${API}/api/agenda/status`, { headers: getHeaders() }),
        axios.get(`${API}/api/agenda/services`, { headers: getHeaders() }),
        axios.get(`${API}/api/agenda/appointments`, { headers: getHeaders() }),
      ]);
      setStatus(statusRes.data);
      setServices(servicesRes.data);
      setAppointments(apptRes.data);
      if (statusRes.data) {
        setAgendaConfig({
          agenda_start_hour: statusRes.data.agenda_start_hour || 9,
          agenda_end_hour: statusRes.data.agenda_end_hour || 18,
          reminder_hours_before: statusRes.data.reminder_hours_before || 2,
          agenda_days: statusRes.data.agenda_days || 'lunes,martes,miercoles,jueves,viernes'
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const connectGoogle = async () => {
    try {
      const res = await axios.get(`${API}/api/agenda/connect`, { headers: getHeaders() });
      window.location.href = res.data.url;
    } catch { showError('Error iniciando conexión con Google'); }
  };

  const disconnectGoogle = async () => {
    if (!confirm('¿Desconectar Google Calendar?')) return;
    await axios.delete(`${API}/api/agenda/disconnect`, { headers: getHeaders() });
    setStatus({ ...status, connected: false });
    showSuccess('Google Calendar desconectado');
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/agenda/config`, agendaConfig, { headers: getHeaders() });
      showSuccess('✅ Configuración guardada');
    } catch { showError('Error guardando configuración'); }
    finally { setSaving(false); }
  };

  const addService = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/api/agenda/services`, newService, { headers: getHeaders() });
      setNewService({ name: '', duration_minutes: 60, price: '', description: '' });
      const res = await axios.get(`${API}/api/agenda/services`, { headers: getHeaders() });
      setServices(res.data);
      showSuccess('✅ Servicio agregado');
    } catch { showError('Error agregando servicio'); }
  };

  const deleteService = async (id) => {
    if (!confirm('¿Eliminar este servicio?')) return;
    await axios.delete(`${API}/api/agenda/services/${id}`, { headers: getHeaders() });
    setServices(services.filter(s => s.id !== id));
  };

  const cancelAppointment = async (id) => {
    if (!confirm('¿Cancelar este turno?')) return;
    await axios.delete(`${API}/api/agenda/appointments/${id}`, { headers: getHeaders() });
    loadAll();
    showSuccess('Turno cancelado');
  };

  const formatDateTime = (dt) => new Date(dt).toLocaleString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });

  const statusColor = { confirmed: '#5B21B6', cancelled: '#DC2626', completed: '#6B7280' };
  const statusLabel = { confirmed: '✅ Confirmado', cancelled: '❌ Cancelado', completed: '✔ Completado' };

  return (
    <div className="dashboard">
      <Sidebar active="agenda" />
      <div className="main-content">
        <div className="page-header">
          <h1>📅 Agenda de turnos</h1>
          <p>El bot agenda turnos automáticamente por WhatsApp e Instagram</p>
        </div>

        {success && <div className="success-msg">{success}</div>}
        {error && <div className="error-msg">{error}</div>}

        <div className="card" style={{ marginBottom: 20, borderLeft: `4px solid ${status?.connected ? 'var(--green)' : '#E5E7EB'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 36 }}>📆</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Google Calendar</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {status?.connected ? 'Conectado — los turnos se agregan automáticamente a tu calendario' : 'Conectá para sincronizar turnos con tu Google Calendar'}
              </div>
            </div>
            {status?.connected ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6', fontWeight: 500 }}>✅ Conectado</span>
                <button onClick={disconnectGoogle} className="btn btn-secondary" style={{ width: 'auto', fontSize: 12, padding: '6px 14px' }}>Desconectar</button>
              </div>
            ) : (
              <button onClick={connectGoogle} className="btn btn-primary" style={{ width: 'auto', padding: '10px 20px' }}>
                🔗 Conectar Google Calendar
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { key: 'appointments', label: `📋 Turnos (${appointments.length})` },
            { key: 'services', label: `🛠 Servicios (${services.length})` },
            { key: 'config', label: '⚙️ Configuración' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: 'auto', padding: '8px 18px', fontSize: 13 }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'appointments' && (
          <div className="card">
            <div className="card-title">Próximos turnos</div>
            {loading ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Cargando...</p>
              : appointments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                  <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No hay turnos próximos.<br />Cuando un cliente saque turno por WhatsApp, aparece acá.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {appointments.map(appt => (
                    <div key={appt.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--green-dark)', fontSize: 18, flexShrink: 0 }}>
                        {(appt.customer_name || appt.customer_phone)[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{appt.customer_name || appt.customer_phone}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>📞 {appt.customer_phone}</div>
                        <div style={{ fontSize: 13, marginTop: 2 }}>
                          <strong>{appt.service_name}</strong> — {formatDateTime(appt.start_time)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: appt.status === 'confirmed' ? '#EDE9FE' : '#F3F4F6', color: statusColor[appt.status] || '#6B7280', fontWeight: 500 }}>
                          {statusLabel[appt.status] || appt.status}
                        </span>
                        <span style={{ fontSize: 11, color: appt.reminder_sent ? '#5B21B6' : '#9CA3AF' }}>
                          {appt.reminder_sent ? '📩 Recordatorio enviado' : '⏳ Recordatorio pendiente'}
                        </span>
                        {appt.status === 'confirmed' && (
                          <button onClick={() => cancelAppointment(appt.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#DC2626', padding: 0 }}>
                            Cancelar turno
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {tab === 'services' && (
          <div>
            <div className="card">
              <div className="card-title">➕ Agregar servicio</div>
              <form onSubmit={addService}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Nombre del servicio</label>
                    <input placeholder="Corte de cabello, Consulta, Clase..." value={newService.name} onChange={e => setNewService({ ...newService, name: e.target.value })} required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Duración (minutos)</label>
                    <input type="number" min="15" step="15" value={newService.duration_minutes} onChange={e => setNewService({ ...newService, duration_minutes: parseInt(e.target.value) })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Precio (opcional)</label>
                    <input type="number" placeholder="0" value={newService.price} onChange={e => setNewService({ ...newService, price: e.target.value })} />
                  </div>
                </div>
                <button className="btn btn-primary" type="submit" style={{ width: 'auto', marginTop: 16, padding: '10px 24px' }}>
                  ➕ Agregar servicio
                </button>
              </form>
            </div>

            <div className="card">
              <div className="card-title">Servicios configurados</div>
              {services.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
                  Agregá tus servicios para que el bot pueda agendar turnos.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {services.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          ⏱ {s.duration_minutes} min {s.price > 0 ? `· $${Number(s.price).toLocaleString('es-AR')}` : ''}
                        </div>
                      </div>
                      <button onClick={() => deleteService(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 18 }}>🗑</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'config' && (
          <div className="card">
            <div className="card-title">⚙️ Horarios y recordatorios</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div className="form-group">
                <label>Horario de apertura</label>
                <select value={agendaConfig.agenda_start_hour} onChange={e => setAgendaConfig({ ...agendaConfig, agenda_start_hour: parseInt(e.target.value) })}>
                  {Array.from({ length: 16 }, (_, i) => i + 6).map(h => (
                    <option key={h} value={h}>{h}:00 hs</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Horario de cierre</label>
                <select value={agendaConfig.agenda_end_hour} onChange={e => setAgendaConfig({ ...agendaConfig, agenda_end_hour: parseInt(e.target.value) })}>
                  {Array.from({ length: 16 }, (_, i) => i + 10).map(h => (
                    <option key={h} value={h}>{h}:00 hs</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Recordatorio (horas antes)</label>
                <select value={agendaConfig.reminder_hours_before} onChange={e => setAgendaConfig({ ...agendaConfig, reminder_hours_before: parseInt(e.target.value) })}>
                  {[1, 2, 3, 4, 6, 12, 24].map(h => (
                    <option key={h} value={h}>{h} hora{h !== 1 ? 's' : ''} antes</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Días de atención</label>
              <input placeholder="lunes,martes,miercoles,jueves,viernes" value={agendaConfig.agenda_days} onChange={e => setAgendaConfig({ ...agendaConfig, agenda_days: e.target.value })} />
              <small style={{ fontSize: 12, color: 'var(--text-muted)' }}>Separados por coma, en minúsculas sin tildes.</small>
            </div>
            <div style={{ background: '#F5F3FF', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
              <strong>🤖 Cómo funciona el bot:</strong><br />
              Cuando un cliente escribe "quiero un turno" o "¿tienen disponibilidad?", el bot consulta tu Google Calendar, ofrece 2 horarios libres del próximo día disponible y confirma la reserva automáticamente. {agendaConfig.reminder_hours_before} hora{agendaConfig.reminder_hours_before !== 1 ? 's' : ''} antes del turno, manda un recordatorio automático.
            </div>
            <button className="btn btn-primary" onClick={saveConfig} disabled={saving} style={{ width: 'auto', padding: '10px 28px' }}>
              {saving ? 'Guardando...' : '💾 Guardar configuración'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
