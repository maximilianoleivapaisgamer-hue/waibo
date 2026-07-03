import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Facebook() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [comments, setComments] = useState([]);
  const [reviews, setReviews] = useState([]);
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
    if (params.get('fb_connected')) showSuccess(`✅ Facebook conectado: ${params.get('page')}`);
    if (params.get('fb_error')) showError('Error en la conexión. Intentá de nuevo.');
    if (params.toString()) window.history.replaceState({}, '', '/facebook');

    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [statusRes, commentsRes, reviewsRes, convRes, configRes] = await Promise.all([
        axios.get(`${API}/api/facebook/status`, { headers: getHeaders() }),
        axios.get(`${API}/api/facebook/comments`, { headers: getHeaders() }),
        axios.get(`${API}/api/facebook/reviews`, { headers: getHeaders() }),
        axios.get(`${API}/api/facebook/conversations`, { headers: getHeaders() }),
        axios.get(`${API}/api/bot/config`, { headers: getHeaders() }),
      ]);
      setStatus(statusRes.data);
      setComments(commentsRes.data);
      setReviews(reviewsRes.data);
      setConversations(convRes.data);
      setConfig(configRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const connectFacebook = async () => {
    try {
      const res = await axios.get(`${API}/api/facebook/connect`, { headers: getHeaders() });
      window.location.href = res.data.url;
    } catch { showError('Error iniciando conexión con Facebook'); }
  };

  const disconnectFacebook = async () => {
    if (!confirm('¿Desconectar Facebook?')) return;
    await axios.delete(`${API}/api/facebook/disconnect`, { headers: getHeaders() });
    setStatus({ connected: false });
    showSuccess('Facebook desconectado');
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

  const stars = (rating) => rating ? '⭐'.repeat(rating) + '☆'.repeat(5 - rating) : '';

  if (loading) return (
    <div className="dashboard">
      <Sidebar active="facebook" />
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      <Sidebar active="facebook" />
      <div className="main-content">
        <div className="page-header">
          <h1>👍 Facebook</h1>
          <p>Messenger + comentarios + reseñas de tu Página</p>
        </div>

        {success && <div className="success-msg">{success}</div>}
        {error && <div className="error-msg">{error}</div>}

        <div className="card" style={{ borderLeft: '4px solid #1877F2', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 32 }}>👍</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{status?.page_name || 'Página de Facebook'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {status?.connected ? 'Página conectada' : 'Conectá tu Página de Facebook'}
              </div>
            </div>
            {status?.connected ? (
              <>
                <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6', fontWeight: 500 }}>✅ Conectado</span>
                <button onClick={disconnectFacebook} className="btn btn-secondary" style={{ width: 'auto', fontSize: 12 }}>Desconectar</button>
              </>
            ) : (
              <button onClick={connectFacebook} className="btn btn-primary" style={{ width: 'auto', padding: '10px 20px', background: '#1877F2' }}>
                👍 Conectar Facebook
              </button>
            )}
          </div>
        </div>

        {!status?.connected ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👍</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Conectá tu Página de Facebook para responder Messenger, comentarios y reseñas automáticamente.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {[
                { key: 'comments', label: `💬 Comentarios (${comments.length})` },
                { key: 'messenger', label: `📩 Messenger (${conversations.length})` },
                { key: 'reviews', label: `⭐ Reseñas (${reviews.length})` },
                { key: 'fbconfig', label: '⚙️ Configuración' },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'comments' && (
              comments.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Todavía no se detectaron comentarios con palabras clave de compra.</p>
                </div>
              ) : comments.map(c => (
                <div key={c.id} className="card" style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{c.commenter_name}</div>
                  <div style={{ fontSize: 13, marginBottom: 6, background: 'var(--bg)', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)' }}>
                    💬 "{c.comment_text}"
                  </div>
                  <div style={{ fontSize: 12, background: '#F5F3FF', padding: '7px 11px', borderRadius: 8, border: '1px solid #DDD6FE' }}>
                    <strong>📩 DM abierto:</strong> {c.dm_sent}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{timeAgo(c.created_at)}</div>
                </div>
              ))
            )}

            {tab === 'messenger' && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {conversations.length === 0 ? (
                  <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>No hay chats de Messenger activos</p>
                ) : (
                  <ul className="conv-list" style={{ padding: '0 16px' }}>
                    {conversations.map(conv => (
                      <li key={conv.id} className="conv-item" onClick={() => router.push('/conversations')}>
                        <div className="conv-avatar" style={{ background: '#E7F0FE', color: '#1877F2' }}>
                          {(conv.customer_name || 'U')[0].toUpperCase()}
                        </div>
                        <div className="conv-info">
                          <div className="conv-name">{conv.customer_name || 'Usuario Facebook'}</div>
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

            {tab === 'reviews' && (
              <div>
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13, color: '#92400E' }}>
                  ⚠️ Las reseñas con calificación baja NO se responden automáticamente — generan una alerta para que las respondas vos personalmente. Las positivas sí reciben un agradecimiento automático.
                </div>
                {reviews.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Todavía no hay reseñas registradas.</p>
                  </div>
                ) : reviews.map(r => (
                  <div key={r.id} className="card" style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.reviewer_name}</div>
                      <div>{stars(r.rating)}</div>
                    </div>
                    {r.review_text && (
                      <div style={{ fontSize: 13, marginBottom: 6, background: 'var(--bg)', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        "{r.review_text}"
                      </div>
                    )}
                    {r.reply_sent ? (
                      <div style={{ fontSize: 12, background: '#F5F3FF', padding: '7px 11px', borderRadius: 8, border: '1px solid #DDD6FE' }}>
                        <strong>🤖 Respuesta automática:</strong> {r.reply_sent}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, background: '#FEF2F2', padding: '7px 11px', borderRadius: 8, border: '1px solid #FECACA', color: '#DC2626' }}>
                        ⚠️ Sin responder — requiere tu atención personal
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{timeAgo(r.created_at)}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'fbconfig' && config && (
              <div className="card">
                <div className="card-title">🔑 Palabras clave que activan el bot en comentarios</div>
                <div className="form-group">
                  <label>Si un comentario contiene alguna de estas palabras, el bot responde automáticamente</label>
                  <input
                    value={config.facebook_comment_keywords || ''}
                    onChange={e => setConfig({ ...config, facebook_comment_keywords: e.target.value })}
                    placeholder="precio,info,cuanto,quiero,disponible"
                  />
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
