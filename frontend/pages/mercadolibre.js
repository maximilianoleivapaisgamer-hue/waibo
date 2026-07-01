import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function MercadoLibre() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('conexion');
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });
  const showSuccess = (m) => { setSuccess(m); setTimeout(() => setSuccess(''), 4000); };
  const showError = (m) => { setError(m); setTimeout(() => setError(''), 4000); };

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/'); return; }

    const params = new URLSearchParams(window.location.search);
    if (params.get('ml_connected')) showSuccess(`✅ Mercado Libre conectado: @${params.get('seller')}`);
    if (params.get('ml_error')) showError('Error en la conexión. Intentá de nuevo.');
    if (params.toString()) window.history.replaceState({}, '', '/mercadolibre');

    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [statusRes, logRes, statsRes, profileRes] = await Promise.all([
        axios.get(`${API}/api/mercadolibre/status`, { headers: getHeaders() }),
        axios.get(`${API}/api/mercadolibre/log`, { headers: getHeaders() }),
        axios.get(`${API}/api/mercadolibre/stats`, { headers: getHeaders() }),
        axios.get(`${API}/api/clients/me`, { headers: getHeaders() }),
      ]);
      setStatus(statusRes.data);
      setLog(logRes.data);
      setStats(statsRes.data);
      setProfile(profileRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const connectML = async () => {
    try {
      const res = await axios.get(`${API}/api/mercadolibre/connect`, { headers: getHeaders() });
      window.location.href = res.data.url;
    } catch { showError('Error iniciando conexión con Mercado Libre'); }
  };

  const disconnectML = async () => {
    if (!confirm('¿Desconectar Mercado Libre?')) return;
    await axios.delete(`${API}/api/mercadolibre/disconnect`, { headers: getHeaders() });
    setStatus({ connected: false });
    showSuccess('Mercado Libre desconectado');
  };

  const timeAgo = (date) => {
    const mins = Math.floor((new Date() - new Date(date)) / 60000);
    if (mins < 1) return 'hace un momento';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  };

  const questions = log.filter(l => l.type === 'question');
  const orders = log.filter(l => l.type === 'order');
  const webhookUrl = profile ? `${API}/webhook/mercadolibre/${profile.id}` : '';

  if (loading) return (
    <div className="dashboard">
      <Sidebar active="mercadolibre" />
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      <Sidebar active="mercadolibre" />
      <div className="main-content">
        <div className="page-header">
          <h1>🛒 Mercado Libre</h1>
          <p>Respuesta automática a preguntas y mensajes post-venta</p>
        </div>

        {success && <div className="success-msg">{success}</div>}
        {error && <div className="error-msg">{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { key: 'conexion', label: '🔗 Conexión' },
            { key: 'preguntas', label: `❓ Preguntas (${questions.length})` },
            { key: 'ordenes', label: `📦 Órdenes (${orders.length})` },
            { key: 'webhook', label: '⚙️ Webhook' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'conexion' && (
          <div>
            <div className="card" style={{ borderLeft: '4px solid #FFE600', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 32 }}>🛒</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{status?.connected ? `@${status.seller_nickname}` : 'Mercado Libre'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {status?.connected ? 'Cuenta de vendedor conectada' : 'Conectá tu cuenta de vendedor'}
                  </div>
                </div>
                {status?.connected ? (
                  <>
                    <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: '#DCFCE7', color: '#15803D', fontWeight: 500 }}>✅ Conectado</span>
                    <button onClick={disconnectML} className="btn btn-secondary" style={{ width: 'auto', fontSize: 12 }}>Desconectar</button>
                  </>
                ) : (
                  <button onClick={connectML} className="btn btn-primary" style={{ width: 'auto', padding: '10px 20px' }}>
                    🛒 Conectar Mercado Libre
                  </button>
                )}
              </div>
            </div>

            {!status?.connected ? (
              <div className="card">
                <div className="card-title">🔗 ¿Cómo funciona la conexión?</div>
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13, color: '#1D4ED8' }}>
                  Es una conexión <strong>oficial y segura</strong> vía OAuth 2.0 — el mismo sistema que usa cualquier app para conectarse con ML. Nunca se guarda tu contraseña.
                </div>
                {[
                  'Hacés clic en "Conectar Mercado Libre"',
                  'ML te muestra su pantalla de login oficial — iniciás sesión con tu cuenta de vendedor',
                  'ML pregunta si autorizás a WhaBot a leer preguntas y enviar mensajes en tu nombre — aceptás',
                  'Volvés al panel y ML queda conectado. El bot empieza a responder automáticamente',
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)', marginBottom: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--green)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ fontSize: 13 }}>{step}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Preguntas respondidas</div>
                  <div className="stat-value" style={{ color: 'var(--green-dark)' }}>{stats?.questions_this_week ?? 0}</div>
                  <div className="stat-sub">esta semana</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Tiempo promedio</div>
                  <div className="stat-value">{stats?.avg_response_seconds ? `${stats.avg_response_seconds}s` : '—'}</div>
                  <div className="stat-sub">de respuesta</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Órdenes procesadas</div>
                  <div className="stat-value">{stats?.orders_this_week ?? 0}</div>
                  <div className="stat-sub">msg post-venta</div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'preguntas' && (
          <div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13, color: '#1D4ED8' }}>
              Cuando un comprador hace una pregunta pública en una publicación, el bot la responde en segundos usando la información del producto y tu base de conocimiento.
            </div>
            {questions.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Todavía no se respondieron preguntas automáticamente.</p>
              </div>
            ) : questions.map(q => (
              <div key={q.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>📦 {q.item_title}</div>
                <div style={{ fontSize: 13, marginBottom: 6, background: 'var(--bg)', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <strong>Pregunta:</strong> "{q.question_text}"
                </div>
                <div style={{ fontSize: 13, background: '#F0FDF4', padding: '8px 11px', borderRadius: 8, border: '1px solid #BBF7D0' }}>
                  <strong>🤖 Respuesta:</strong> "{q.answer_text}"
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  {timeAgo(q.created_at)} {q.response_time_ms ? `· Respondido en ${(q.response_time_ms / 1000).toFixed(1)}s` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'ordenes' && (
          <div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13, color: '#1D4ED8' }}>
              Cuando se confirma una compra, el bot envía automáticamente un mensaje de bienvenida y solicita datos de facturación si corresponde.
            </div>
            {orders.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Todavía no se procesaron órdenes.</p>
              </div>
            ) : orders.map(o => (
              <div key={o.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Orden #{o.order_id} — {o.buyer_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Producto: {o.item_title}</div>
                <div style={{ fontSize: 13, background: '#F0FDF4', padding: '8px 11px', borderRadius: 8, border: '1px solid #BBF7D0' }}>
                  <strong>🤖 Mensaje enviado:</strong> "{o.answer_text}"
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{timeAgo(o.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'webhook' && (
          <div className="card">
            <div className="card-title">⚙️ Configuración en ML Developers</div>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13, color: '#92400E' }}>
              Hay que configurar esto una sola vez en el panel de Mercado Libre Developers para que el bot empiece a funcionar.
            </div>
            {[
              'Ir a developers.mercadolibre.com → Tu aplicación',
              'Sección Notificaciones → Agregar URL de notificación',
              'Activar los tópicos: questions (preguntas) y orders_v2 (órdenes)',
              'Pegar tu webhook URL (ver abajo)',
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)', marginBottom: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--green)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ fontSize: 13 }}>{step}</div>
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>📋 Tu Webhook URL</div>
              <code style={{ display: 'block', background: 'var(--bg)', padding: '10px 14px', borderRadius: 9, fontSize: 12, border: '1px solid var(--border)', wordBreak: 'break-all' }}>
                {webhookUrl}
              </code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
