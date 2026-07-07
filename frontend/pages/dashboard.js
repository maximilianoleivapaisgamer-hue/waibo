import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import ChannelLogo from '../components/ChannelLogo';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [onboarding, setOnboarding] = useState(null);
  const [trial, setTrial] = useState(null);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    const clientData = localStorage.getItem('whabot_client');
    if (!token) { router.push('/login'); return; }
    setClient(JSON.parse(clientData || '{}'));

    const loadDashboard = (isInitial) => {
      const calls = [
        axios.get(`${API}/api/bot/stats`, { headers: getHeaders() }),
        axios.get(`${API}/api/bot/conversations`, { headers: getHeaders() }),
        axios.get(`${API}/api/bot/alerts`, { headers: getHeaders() }),
        ...(isInitial ? [
          axios.get(`${API}/api/bot/onboarding`, { headers: getHeaders() }),
          axios.get(`${API}/api/bot/trial`, { headers: getHeaders() }),
        ] : [])
      ];
      Promise.allSettled(calls).then(([statsRes, convsRes, alertsRes, onboardingRes, trialRes]) => {
        if (statsRes.status === 'rejected' && statsRes.reason?.response?.status === 401) {
          router.push('/login'); return;
        }
        if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
        if (convsRes.status === 'fulfilled') setConversations(convsRes.value.data.slice(0, 5));
        if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value.data);
        if (onboardingRes?.status === 'fulfilled') setOnboarding(onboardingRes.value.data);
        if (trialRes?.status === 'fulfilled') setTrial(trialRes.value.data);
      }).finally(() => {
        if (isInitial) setLoading(false);
      });
    };

    loadDashboard(true);
    const interval = setInterval(() => loadDashboard(false), 10000);
    return () => clearInterval(interval);
  }, []);

  const resolveAlert = async (alertId) => {
    try {
      await axios.put(`${API}/api/bot/alerts/${alertId}/resolve`, {}, { headers: getHeaders() });
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch {
      alert('Error al resolver la alerta');
    }
  };

  const alertIcon = { human_requested: '👤', ai_failed: '⚠️', low_stock: '📦', new_order: '🍕', negative_review: '⭐', transfer_pending_review: '💰' };
  const channelIcon = { whatsapp: 'whatsapp', instagram: 'instagram', tiktok: 'tiktok', mercadolibre: 'mercadolibre', facebook: 'facebook' };

  const timeAgo = (date) => {
    const mins = Math.floor((new Date() - new Date(date)) / 60000);
    if (mins < 1) return 'recién';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  };

  if (loading) return (
    <div className="dashboard">
      <Sidebar active="dashboard" />
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      <Sidebar active="dashboard" />
      <div className="main-content">
        <div className="page-header">
          <h1>¡Hola, {client?.name?.split(' ')[0]}! 👋</h1>
          <p>
            <span className="status-dot"></span>
            Tu bot está activo para <strong>{client?.business_name || 'tu negocio'}</strong>
          </p>
        </div>

        {(!trial || trial.in_trial) && (
          <div style={{
            marginBottom: 20, padding: '14px 20px', borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            background: trial?.ending_soon ? '#FFFBEB' : trial?.expired ? '#FEF2F2' : '#EFF6FF',
            border: `1px solid ${trial?.ending_soon ? '#FDE68A' : trial?.expired ? '#FECACA' : '#BFDBFE'}`,
          }}>
            <span style={{ fontSize: 22 }}>{trial?.expired ? '🔴' : trial?.ending_soon ? '⚠️' : '🕐'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: trial?.expired ? '#DC2626' : trial?.ending_soon ? '#92400E' : '#1D4ED8' }}>
                {trial?.expired
                  ? 'Tu período de prueba venció'
                  : trial?.days_left != null
                    ? `Período de prueba gratuita — te quedan ${trial.days_left} día${trial.days_left !== 1 ? 's' : ''}`
                    : 'Estás en período de prueba gratuita'}
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                {trial?.expired
                  ? 'Activá tu plan para seguir usando Waibo sin interrupciones.'
                  : 'Explorá todas las funciones sin costo. Activá tu plan cuando estés listo.'}
              </div>
            </div>
            <button
              onClick={() => router.push('/billing')}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
                background: trial?.expired ? '#DC2626' : '#7C3AED', color: 'white',
              }}
            >
              {trial?.expired ? 'Activar ahora' : 'Ver planes'}
            </button>
          </div>
        )}

        {onboarding && !onboarding.all_done && (
          <div className="card" style={{ borderLeft: '4px solid var(--green)', marginBottom: 20 }}>
            <div className="card-title" style={{ border: 'none', marginBottom: 12 }}>
              🚀 Primeros pasos ({onboarding.completed_count}/{onboarding.total_count})
            </div>
            <div style={{ height: 6, background: 'var(--bg)', borderRadius: 10, marginBottom: 14, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 10, background: 'var(--green)',
                width: `${(onboarding.completed_count / onboarding.total_count) * 100}%`,
                transition: 'width 0.3s'
              }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {onboarding.steps.map(step => (
                <div
                  key={step.key}
                  onClick={() => !step.done && router.push(step.href)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderRadius: 8, cursor: step.done ? 'default' : 'pointer',
                    background: step.done ? '#F5F3FF' : 'var(--bg)'
                  }}
                >
                  <span style={{ fontSize: 16 }}>{step.done ? '✅' : '⬜'}</span>
                  <span style={{ fontSize: 13, color: step.done ? 'var(--text-muted)' : 'var(--text)', textDecoration: step.done ? 'line-through' : 'none' }}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="card" style={{ borderLeft: '4px solid #F59E0B', marginBottom: 20 }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', marginBottom: 10 }}>
              <span>🔔 Necesitan tu atención ({alerts.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.slice(0, 5).map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)'
                }}>
                  <span style={{ fontSize: 18 }}>{alertIcon[a.type] || '🔔'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>{a.message}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {channelIcon[a.channel] && <ChannelLogo channel={channelIcon[a.channel]} size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />}{timeAgo(a.created_at)}
                    </div>
                  </div>
                  <button
                    onClick={() => router.push('/conversations')}
                    className="btn btn-secondary"
                    style={{ width: 'auto', fontSize: 11, padding: '5px 10px' }}
                  >Ver chat</button>
                  <button
                    onClick={() => resolveAlert(a.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}
                    title="Marcar como resuelto"
                  >✓</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Conversaciones hoy</div>
            <div className="stat-value" style={{ color: 'var(--green-dark)' }}>
              {stats?.today_conversations ?? 0}
            </div>
            <div className="stat-sub">nuevas consultas</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total conversaciones</div>
            <div className="stat-value">{stats?.total_conversations ?? 0}</div>
            <div className="stat-sub">desde el inicio</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Mensajes procesados</div>
            <div className="stat-value">{stats?.total_messages ?? 0}</div>
            <div className="stat-sub">respondidos por IA</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Chats activos</div>
            <div className="stat-value" style={{ color: '#F59E0B' }}>
              {stats?.active_conversations ?? 0}
            </div>
            <div className="stat-sub">en curso ahora</div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">💬 Últimas conversaciones</div>
          {conversations.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
              Todavía no hay conversaciones. ¡Configurá tu bot y empezá a recibir mensajes!
            </p>
          ) : (
            <ul className="conv-list">
              {conversations.map(conv => (
                <li
                  key={conv.id}
                  className="conv-item"
                  onClick={() => router.push('/conversations')}
                >
                  <div className="conv-avatar">
                    {(conv.customer_name || conv.customer_phone)[0].toUpperCase()}
                  </div>
                  <div className="conv-info">
                    <div className="conv-name">
                      {conv.customer_name || conv.customer_phone}
                    </div>
                    <div className="conv-last">{conv.last_message || 'Sin mensajes'}</div>
                  </div>
                  <span className={`conv-badge ${conv.status === 'bot' ? 'badge-bot' : 'badge-human'}`}>
                    {conv.status === 'bot' ? '🤖 Bot' : '👤 Humano'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card" style={{ background: '#F5F3FF', border: '1px solid #DDD6FE' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 32 }}>🚀</div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Configurá tu bot ahora</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Agregá información sobre tu negocio para que la IA responda correctamente.
              </div>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: 'auto', marginLeft: 'auto', flexShrink: 0 }}
              onClick={() => router.push('/config')}
            >
              Configurar ⚙️
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Estado de canales</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'WhatsApp', channel: 'whatsapp', href: '/channels' },
              { label: 'Instagram', channel: 'instagram', href: '/instagram' },
              { label: 'Facebook', channel: 'facebook', href: '/facebook' },
              { label: 'Mercado Libre', channel: 'mercadolibre', href: '/mercadolibre' },
              { label: 'Tiendanube', channel: 'tiendanube', href: '/channels' },
            ].map(ch => (
              <div
                key={ch.label}
                onClick={() => router.push(ch.href)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}
              >
                <ChannelLogo channel={ch.channel} size={20} />
                {ch.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
