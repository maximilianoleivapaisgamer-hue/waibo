import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

const STATUS_LABELS = {
  draft: { label: 'Borrador', bg: '#F3F4F6', color: '#6B7280' },
  sending: { label: 'Enviando...', bg: '#FEF3C7', color: '#92400E' },
  sent: { label: 'Enviada', bg: '#DCFCE7', color: '#16A34A' },
  failed: { label: 'Error', bg: '#FEE2E2', color: '#DC2626' },
};

export default function Campaigns() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('nueva'); // 'nueva' | 'historial'

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [recipientMode, setRecipientMode] = useState('conversations'); // 'conversations' | 'manual'
  const [conversations, setConversations] = useState([]);
  const [selectedPhones, setSelectedPhones] = useState([]);
  const [manualPhones, setManualPhones] = useState('');
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(null);

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/'); return; }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [campRes, convRes] = await Promise.all([
        axios.get(`${API}/api/campaigns`, { headers: getHeaders() }),
        axios.get(`${API}/api/bot/conversations`, { headers: getHeaders() }),
      ]);
      setCampaigns(campRes.data);
      setConversations(convRes.data.filter(c => c.channel === 'whatsapp'));
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const togglePhone = (phone, name) => {
    setSelectedPhones(prev => {
      const exists = prev.find(p => p.phone === phone);
      if (exists) return prev.filter(p => p.phone !== phone);
      return [...prev, { phone, name }];
    });
  };

  const buildRecipients = () => {
    if (recipientMode === 'conversations') return selectedPhones;
    return manualPhones
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => ({ phone: l, name: null }));
  };

  const createCampaign = async () => {
    const recipients = buildRecipients();
    if (!name.trim()) return alert('Ingresá un nombre para la campaña.');
    if (!message.trim()) return alert('Ingresá el mensaje a enviar.');
    if (!recipients.length) return alert('Seleccioná al menos un destinatario.');

    setCreating(true);
    try {
      const res = await axios.post(`${API}/api/campaigns`, { name, message, recipients }, { headers: getHeaders() });
      setCampaigns(prev => [res.data, ...prev]);
      setName('');
      setMessage('');
      setSelectedPhones([]);
      setManualPhones('');
      setTab('historial');
      alert('Campaña creada. Podés enviarla desde el historial.');
    } catch (err) {
      alert(err.response?.data?.error || 'Error creando la campaña.');
    } finally {
      setCreating(false);
    }
  };

  const sendCampaign = async (id) => {
    if (!confirm('¿Estás seguro? Se enviará el mensaje a todos los destinatarios.')) return;
    setSending(id);
    try {
      await axios.post(`${API}/api/campaigns/${id}/send`, {}, { headers: getHeaders() });
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'sending' } : c));
      setTimeout(loadData, 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Error iniciando la campaña.');
    } finally {
      setSending(null);
    }
  };

  const deleteCampaign = async (id) => {
    if (!confirm('¿Eliminar esta campaña?')) return;
    try {
      await axios.delete(`${API}/api/campaigns/${id}`, { headers: getHeaders() });
      setCampaigns(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'No se puede eliminar.');
    }
  };

  const pollSending = () => {
    const hasSending = campaigns.some(c => c.status === 'sending');
    if (hasSending) {
      setTimeout(async () => {
        const res = await axios.get(`${API}/api/campaigns`, { headers: getHeaders() });
        setCampaigns(res.data);
      }, 5000);
    }
  };

  useEffect(() => { pollSending(); }, [campaigns]);

  return (
    <div className="dashboard">
      <Sidebar active="campaigns" />
      <div className="main-content">
        <div className="page-header">
          <h1>📣 Campañas masivas</h1>
          <p>Enviá mensajes a múltiples contactos de WhatsApp a la vez</p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['nueva', 'historial'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={tab === t ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ width: 'auto', padding: '8px 20px', fontSize: 14 }}
            >
              {t === 'nueva' ? '✏️ Nueva campaña' : `📋 Historial (${campaigns.length})`}
            </button>
          ))}
        </div>

        {tab === 'nueva' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: 15 }}>Datos de la campaña</h3>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Nombre interno</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej: Promo julio, Recordatorio turnos..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Mensaje</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={6}
                  placeholder="Escribí el mensaje que van a recibir tus contactos..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {message.length} caracteres
                </div>
              </div>

              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400E', marginBottom: 14 }}>
                ⚠️ <strong>Importante:</strong> WhatsApp solo entrega mensajes a contactos que te escribieron en las últimas 24 horas. Para contactos inactivos necesitás usar plantillas aprobadas por Meta.
              </div>

              <button
                onClick={createCampaign}
                disabled={creating}
                className="btn btn-primary"
                style={{ width: '100%' }}
              >
                {creating ? 'Creando...' : '✅ Crear campaña'}
              </button>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 12, fontSize: 15 }}>Destinatarios</h3>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[['conversations', '📋 Desde conversaciones'], ['manual', '✏️ Ingresar manual']].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setRecipientMode(key)}
                    style={{
                      fontSize: 12, padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontWeight: 500,
                      border: recipientMode === key ? '2px solid #7C3AED' : '1px solid var(--border)',
                      background: recipientMode === key ? '#EDE9FE' : 'var(--bg)',
                      color: recipientMode === key ? '#7C3AED' : 'var(--text-muted)'
                    }}
                  >{label}</button>
                ))}
              </div>

              {recipientMode === 'conversations' ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    {selectedPhones.length} seleccionados de {conversations.length} contactos de WhatsApp
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <button
                      onClick={() => setSelectedPhones(conversations.map(c => ({ phone: c.customer_phone, name: c.customer_name })))}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >Seleccionar todos</button>
                    <button
                      onClick={() => setSelectedPhones([])}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >Limpiar</button>
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                    {conversations.length === 0 ? (
                      <p style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>No hay contactos de WhatsApp</p>
                    ) : conversations.map(c => {
                      const isSelected = !!selectedPhones.find(p => p.phone === c.customer_phone);
                      return (
                        <div
                          key={c.id}
                          onClick={() => togglePhone(c.customer_phone, c.customer_name)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                            cursor: 'pointer', borderBottom: '1px solid var(--border)',
                            background: isSelected ? '#F5F3FF' : 'transparent'
                          }}
                        >
                          <div style={{
                            width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSelected ? '#7C3AED' : 'var(--border)'}`,
                            background: isSelected ? '#7C3AED' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                          }}>
                            {isSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{c.customer_name || c.customer_phone}</div>
                            {c.customer_name && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.customer_phone}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Teléfonos (uno por línea, formato internacional)
                  </label>
                  <textarea
                    value={manualPhones}
                    onChange={e => setManualPhones(e.target.value)}
                    rows={10}
                    placeholder={"+5491112345678\n+5491187654321\n..."}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {manualPhones.split('\n').filter(l => l.trim()).length} teléfonos ingresados · Máximo 500
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'historial' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>Cargando...</p>
            ) : campaigns.length === 0 ? (
              <p style={{ padding: 32, color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>
                Todavía no creaste ninguna campaña.{' '}
                <button onClick={() => setTab('nueva')} style={{ background: 'none', border: 'none', color: '#7C3AED', cursor: 'pointer', fontWeight: 600 }}>
                  Creá la primera
                </button>
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 20px' }}>Campaña</th>
                    <th style={{ padding: '12px 16px' }}>Estado</th>
                    <th style={{ padding: '12px 16px' }}>Enviados</th>
                    <th style={{ padding: '12px 16px' }}>Fallidos</th>
                    <th style={{ padding: '12px 16px' }}>Creada</th>
                    <th style={{ padding: '12px 16px' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(c => {
                    const st = STATUS_LABELS[c.status] || STATUS_LABELS.draft;
                    const pct = c.total_recipients > 0
                      ? Math.round(((c.sent_count + c.failed_count) / c.total_recipients) * 100)
                      : 0;
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.message}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {c.total_recipients} destinatarios
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                          {c.status === 'sending' && (
                            <div style={{ marginTop: 6, width: 80 }}>
                              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                                <div style={{ height: '100%', background: '#7C3AED', borderRadius: 2, width: `${pct}%`, transition: 'width 0.5s' }} />
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{pct}%</div>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', color: '#16A34A', fontWeight: 600 }}>{c.sent_count}</td>
                        <td style={{ padding: '14px 16px', color: c.failed_count > 0 ? '#DC2626' : 'var(--text-muted)', fontWeight: c.failed_count > 0 ? 600 : 400 }}>{c.failed_count}</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                          {new Date(c.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {c.status === 'draft' && (
                              <>
                                <button
                                  onClick={() => sendCampaign(c.id)}
                                  disabled={sending === c.id}
                                  className="btn btn-primary"
                                  style={{ fontSize: 12, padding: '5px 12px', width: 'auto' }}
                                >
                                  {sending === c.id ? '...' : '🚀 Enviar'}
                                </button>
                                <button
                                  onClick={() => deleteCampaign(c.id)}
                                  className="btn btn-secondary"
                                  style={{ fontSize: 12, padding: '5px 10px', width: 'auto', color: '#DC2626' }}
                                >🗑</button>
                              </>
                            )}
                            {c.status === 'sending' && (
                              <span style={{ fontSize: 12, color: '#92400E' }}>En curso...</span>
                            )}
                            {c.status === 'sent' && (
                              <span style={{ fontSize: 12, color: '#16A34A' }}>✓ Completada</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
