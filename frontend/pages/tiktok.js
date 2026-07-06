import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import ChannelLogo from '../components/ChannelLogo';

const API = process.env.NEXT_PUBLIC_API_URL;

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-AR') : '—'; }
function timeAgo(d) {
  if (!d) return '—';
  const mins = Math.floor((new Date() - new Date(d)) / 60000);
  if (mins < 60) return `hace ${mins}m`;
  if (mins < 1440) return `hace ${Math.floor(mins / 60)}h`;
  return `hace ${Math.floor(mins / 1440)}d`;
}

export default function TikTokPage() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    if (!localStorage.getItem('whabot_token')) { router.push('/login'); return; }
    load();
    if (router.query.tt_connected) setMsg('✅ TikTok conectado correctamente');
    if (router.query.tt_error) setMsg('❌ Error al conectar TikTok. Intentá de nuevo.');
  }, [router.query]);

  async function load() {
    setLoading(true);
    try {
      const s = await axios.get(`${API}/api/tiktok/status`, { headers: headers() });
      setStatus(s.data);
      if (s.data?.connected) {
        const c = await axios.get(`${API}/api/tiktok/conversations`, { headers: headers() }).catch(() => ({ data: [] }));
        setConvs(c.data || []);
      }
    } catch { setStatus(null); }
    setLoading(false);
  }

  async function connect() {
    try {
      const r = await axios.get(`${API}/api/tiktok/connect`, { headers: headers() });
      window.location.href = r.data.url;
    } catch { setMsg('❌ Error al iniciar la conexión'); }
  }

  async function disconnect() {
    if (!confirm('¿Desconectar TikTok?')) return;
    await axios.delete(`${API}/api/tiktok/disconnect`, { headers: headers() });
    setStatus(null); setConvs([]);
    setMsg('TikTok desconectado.');
  }

  const connected = status?.connected;

  return (
    <div className="dashboard">
      <Sidebar active="tiktok" />
      <div className="main-content">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <ChannelLogo channel="tiktok" size={40} style={{ borderRadius: 10 }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>TikTok</h1>
            <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>Respondé mensajes directos de TikTok con tu bot</p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: connected ? '#D1FAE5' : '#F3F4F6',
              color: connected ? '#065F46' : '#6B7280',
            }}>
              {connected ? '● Conectado' : '● Sin conectar'}
            </span>
          </div>
        </div>

        {msg && (
          <div style={{ background: msg.includes('❌') ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${msg.includes('❌') ? '#FCA5A5' : '#BBF7D0'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: msg.includes('❌') ? '#991B1B' : '#065F46' }}>
            {msg}
          </div>
        )}

        {/* Banner fase beta */}
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#92400E', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🚧</span>
          <span><strong>Canal en fase beta.</strong> Los DMs de TikTok están disponibles pero pueden tener limitaciones según los permisos de tu cuenta de TikTok for Business.</span>
        </div>

        {loading ? (
          <div style={{ color: '#9CA3AF', padding: 32 }}>Cargando...</div>
        ) : !connected ? (
          /* Estado desconectado — paso a paso */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              {
                n: 1, title: 'Necesitás una cuenta TikTok for Business',
                desc: 'TikTok DMs solo están disponibles para cuentas Business o Creator con más de 1.000 seguidores.',
                content: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      'Tener una cuenta de TikTok for Business',
                      'Tener al menos 1.000 seguidores en tu cuenta',
                      'Tener los DMs habilitados en la configuración de TikTok',
                    ].map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#EDE9FE', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                        {r}
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                n: 2, title: 'Conectá tu cuenta TikTok',
                desc: 'Autorizá a Waibo para acceder a tus mensajes directos.',
                content: (
                  <button onClick={connect} style={{ padding: '11px 24px', background: '#010101', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ChannelLogo channel="tiktok" size={18} /> Conectar con TikTok
                  </button>
                ),
              },
              {
                n: 3, title: 'El bot responde tus DMs automáticamente',
                desc: 'Cuando alguien te escribe por TikTok, el bot responde con la misma IA que usás en WhatsApp.',
                content: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {['Responde DMs automáticamente con tu bot de IA', 'Las conversaciones aparecen en tu panel de Conversaciones', 'Podés tomar control manual en cualquier momento', 'Usa la misma base de conocimiento que tus otros canales'].map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
                        <span style={{ color: '#7C3AED', fontWeight: 700 }}>✓</span> {f}
                      </div>
                    ))}
                  </div>
                ),
              },
            ].map(step => (
              <div key={step.n} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#7C3AED', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{step.n}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{step.title}</div>
                    <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{step.desc}</div>
                  </div>
                </div>
                <div style={{ padding: '16px 20px' }}>{step.content}</div>
              </div>
            ))}
          </div>
        ) : (
          /* Estado conectado */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Info de la cuenta */}
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>@{status.tiktok_display_name || 'Mi cuenta'}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>Conectado el {fmtDate(status.connected_at)}</div>
                {status.token_expires_at && (
                  <div style={{ fontSize: 12, color: '#D97706', marginTop: 2 }}>Token expira el {fmtDate(status.token_expires_at)}</div>
                )}
              </div>
              <button onClick={disconnect} style={{ padding: '8px 16px', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Desconectar
              </button>
            </div>

            {/* Conversaciones recientes */}
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', fontWeight: 600, fontSize: 14 }}>
                Conversaciones recientes por TikTok
              </div>
              {convs.length === 0 ? (
                <div style={{ padding: 32, color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>
                  Aún no hay conversaciones por TikTok. Cuando alguien te escriba un DM, aparecerá aquí.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                      {['Usuario', 'Estado', 'Mensajes', 'Última actividad'].map(h => (
                        <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {convs.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 500 }}>{c.customer_name || c.customer_phone}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: c.status === 'bot' ? '#EDE9FE' : '#FEF3C7', color: c.status === 'bot' ? '#5B21B6' : '#92400E' }}>
                            {c.status === 'bot' ? '🤖 Bot' : '👤 Humano'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', color: '#6B7280' }}>{c.message_count || '—'}</td>
                        <td style={{ padding: '10px 16px', color: '#9CA3AF' }}>{timeAgo(c.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
