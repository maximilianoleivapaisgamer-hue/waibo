import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Instagram() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [comments, setComments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [config, setConfig] = useState(null);
  const [tab, setTab] = useState('comments');
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
    if (params.get('ig_connected')) showSuccess(`✅ Instagram conectado: ${params.get('page')}`);
    if (params.get('ig_error')) showError('Error en la conexión. Intentá de nuevo.');
    if (params.toString()) window.history.replaceState({}, '', '/instagram');

    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [statusRes, commentsRes, convRes, configRes] = await Promise.all([
        axios.get(`${API}/api/instagram/status`, { headers: getHeaders() }),
        axios.get(`${API}/api/instagram/comments`, { headers: getHeaders() }),
        axios.get(`${API}/api/instagram/conversations`, { headers: getHeaders() }),
        axios.get(`${API}/api/bot/config`, { headers: getHeaders() }),
      ]);
      setStatus(statusRes.data);
      setComments(commentsRes.data);
      setConversations(convRes.data);
      setConfig(configRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const connectInstagram = async () => {
    try {
      const res = await axios.get(`${API}/api/instagram/connect`, { headers: getHeaders() });
      window.location.href = res.data.url;
    } catch { showError('Error iniciando conexión con Instagram'); }
  };

  const disconnectInstagram = async () => {
    if (!confirm('¿Desconectar Instagram?')) return;
    await axios.delete(`${API}/api/instagram/disconnect`, { headers: getHeaders() });
    setStatus({ connected: false });
    showSuccess('Instagram desconectado');
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/bot/config`, config, { headers: getHeaders() });
      showSuccess('✅ Configuración guardada');
    } catch { showError('Error guardando configuración'); }
    finally { setSaving(false); }
  };

  const timeAgo = (date) => {
    const mins = Math.floor((new Date() - new Date(date)) / 60000);
    if (mins < 1) return 'hace un momento';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  };

  if (loading) return (
    <div className="dashboard">
      <Sidebar active="instagram" />
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      <Sidebar active="instagram" />
      <div className="main-content">
        <div className="page-header">
          <h1>📸 Instagram</h1>
          <p>DMs automáticos + respuesta a comentarios con intención de compra</p>
        </div>

        {success && <div className="success-msg">{success}</div>}
        {error && <div className="error-msg">{error}</div>}

        <div className="card" style={{ borderLeft: '4px solid #E1306C', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 32 }}>📸</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{status?.page_name || 'Instagram Business'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {status?.connected ? 'Cuenta de Instagram Business conectada' : 'Conectá tu cuenta de Instagram Business'}
              </div>
            </div>
            {status?.connected ? (
              <>
                <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: '#DCFCE7', color: '#15803D', fontWeight: 500 }}>✅ Conectado</span>
                <button onClick={disconnectInstagram} className="btn btn-secondary" style={{ width: 'auto', fontSize: 12 }}>Desconectar</button>
              </>
            ) : (
              <button onClick={connectInstagram} className="btn btn-primary" style={{ width: 'auto', padding: '10px 20px' }}>
                📸 Conectar Instagram
              </button>
            )}
          </div>
        </div>

        {!status?.connected ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Conectá tu cuenta de Instagram Business para empezar a responder DMs y comentarios automáticamente.
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              Necesitás una cuenta de Instagram Business vinculada a una Página de Facebook.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {[
                { key: 'comments', label: `💬 Comentarios detectados (${comments.length})` },
                { key: 'dms', label: `📩 DMs activos (${conversations.length})` },
                { key: 'igconfig', label: '⚙️ Configuración' },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'comments' && (
              <div>
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13, color: '#1D4ED8' }}>
                  <strong>🤖 Cómo funciona:</strong> Cuando alguien comenta una palabra clave en tus posts, el bot responde el comentario públicamente y le abre un DM privado para iniciar la venta.
                </div>
                {comments.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Todavía no se detectaron comentarios con palabras clave de compra.</p>
                  </div>
                ) : comments.map(c => (
                  <div key={c.id} className="card" style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div className="conv-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                        {(c.commenter_username || 'U')[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>@{c.commenter_username}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(c.created_at)} {c.post_caption ? `· Post: "${c.post_caption}"` : ''}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 8, background: 'var(--bg)', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      💬 Comentario: "{c.comment_text}"
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 12, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '7px 11px' }}>
                        <strong>🌐 Respuesta pública:</strong> {c.public_reply}
                      </div>
                      <div style={{ fontSize: 12, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '7px 11px' }}>
                        <strong>📩 DM abierto:</strong> {c.dm_sent}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'dms' && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {conversations.length === 0 ? (
                  <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>No hay DMs activos todavía</p>
                ) : (
                  <ul className="conv-list" style={{ padding: '0 16px' }}>
                    {conversations.map(conv => (
                      <li key={conv.id} className="conv-item" onClick={() => router.push('/conversations')}>
                        <div className="conv-avatar" style={{ background: '#FCE7F3', color: '#9D174D' }}>
                          {(conv.customer_name || 'U')[0].toUpperCase()}
                        </div>
                        <div className="conv-info">
                          <div className="conv-name">{conv.customer_name || 'Usuario Instagram'}</div>
                          <div className="conv-last">{conv.last_message || '—'}</div>
                        </div>
                        <span className={`conv-badge ${conv.status === 'bot' ? 'badge-bot' : 'badge-human'}`}>
                          {conv.status === 'bot' ? '🤖' : '👤'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'igconfig' && config && (
              <div className="card">
                <div className="card-title">🔑 Palabras clave que activan el bot en comentarios</div>
                <div className="form-group">
                  <label>Si un comentario contiene alguna de estas palabras, el bot responde automáticamente</label>
                  <input
                    value={config.instagram_comment_keywords || ''}
                    onChange={e => setConfig({ ...config, instagram_comment_keywords: e.target.value })}
                    placeholder="precio,info,cuanto,quiero,disponible"
                  />
                  <small style={{ fontSize: 11, color: 'var(--text-muted)' }}>Separadas por coma, en minúsculas.</small>
                </div>
                <button className="btn btn-primary" onClick={saveConfig} disabled={saving} style={{ width: 'auto', padding: '10px 24px' }}>
                  {saving ? 'Guardando...' : '💾 Guardar'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
