import { useEffect, useState } from 'react';
import axios from 'axios';
import ChannelLogo from './ChannelLogo';

const API = process.env.NEXT_PUBLIC_API_URL;

// Panel de conversaciones reutilizable.
// props.channel: si se pasa (ej. 'whatsapp'), filtra las conversaciones de ese canal.
export default function ConversationsPanel({ channel }) {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [contactVariables, setContactVariables] = useState([]);
  const [funnelFilter, setFunnelFilter] = useState('');
  const [savingFunnel, setSavingFunnel] = useState(false);

  const FUNNEL_STAGES = [
    { key: 'nuevo',           label: 'Nuevo',          bg: '#F3F4F6', color: '#6B7280' },
    { key: 'interesado',      label: 'Interesado',     bg: '#DBEAFE', color: '#1D4ED8' },
    { key: 'turno_agendado',  label: 'Turno/Pedido',   bg: '#EDE9FE', color: '#7C3AED' },
    { key: 'cerrado',         label: 'Cerrado',        bg: '#DCFCE7', color: '#16A34A' },
    { key: 'perdido',         label: 'Perdido',        bg: '#FEE2E2', color: '#DC2626' },
  ];
  const getFunnelStyle = (key) => FUNNEL_STAGES.find(s => s.key === key) || FUNNEL_STAGES[0];

  // Sugerencias: las fijas + todas las etiquetas que el cliente ya usó en otras conversaciones
  const BASE_TAGS = ['Lead Caliente', 'Falta Pago', 'Turno Agendado'];
  const SUGGESTED_TAGS = [...new Set([
    ...BASE_TAGS,
    ...conversations.flatMap(c => c.tags || [])
  ])];
  const TAG_COLORS = {
    'Lead Caliente': { bg: '#FEE2E2', color: '#DC2626' },
    'Falta Pago': { bg: '#FEF3C7', color: '#92400E' },
    'Turno Agendado': { bg: '#DBEAFE', color: '#1D4ED8' },
  };
  const getTagStyle = (tag) => TAG_COLORS[tag] || { bg: '#F3F4F6', color: '#6B7280' };

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  const byChannel = (list) => channel ? list.filter(c => c.channel === channel) : list;

  useEffect(() => {
    const refresh = async (isInitial) => {
      try {
        const convRes = await axios.get(`${API}/api/bot/conversations`, { headers: getHeaders() });
        setConversations(byChannel(convRes.data));

        if (selected) {
          const refreshed = convRes.data.find(c => c.id === selected.id);
          if (refreshed) {
            setSelected(prev => prev ? { ...prev, is_typing: refreshed.is_typing, status: refreshed.status } : prev);
          }
          const msgsRes = await axios.get(`${API}/api/bot/conversations/${selected.id}/messages`, { headers: getHeaders() });
          setMessages(msgsRes.data);
        }
      } catch {
      } finally {
        if (isInitial) setLoading(false);
      }
    };

    refresh(true);
    const interval = setInterval(() => refresh(false), 10000);
    return () => clearInterval(interval);
  }, [selected?.id]);

  const loadMessages = async (conv) => {
    setSelected(conv);
    const res = await axios.get(`${API}/api/bot/conversations/${conv.id}/messages`, { headers: getHeaders() });
    setMessages(res.data);
    try {
      const varsRes = await axios.get(`${API}/api/bot/conversations/${conv.id}/variables`, { headers: getHeaders() });
      setContactVariables(varsRes.data);
    } catch {
      setContactVariables([]);
    }
  };

  const toggleStatus = async (newStatus) => {
    if (!selected) return;
    setTogglingStatus(true);
    try {
      const res = await axios.put(
        `${API}/api/bot/conversations/${selected.id}/status`,
        { status: newStatus },
        { headers: getHeaders() }
      );
      setSelected(res.data);
      setConversations(prev => prev.map(c => c.id === res.data.id ? { ...c, status: res.data.status } : c));
    } catch (err) {
      alert('Error cambiando el estado de la conversación. Intentá de nuevo.');
    } finally {
      setTogglingStatus(false);
    }
  };

  const saveTags = async (newTags) => {
    if (!selected) return;
    setSavingTags(true);
    try {
      const res = await axios.put(
        `${API}/api/bot/conversations/${selected.id}/tags`,
        { tags: newTags },
        { headers: getHeaders() }
      );
      setSelected(res.data);
      setConversations(prev => prev.map(c => c.id === res.data.id ? { ...c, tags: res.data.tags } : c));
    } catch (err) {
      alert('Error guardando tags. Intentá de nuevo.');
    } finally {
      setSavingTags(false);
    }
  };

  const addTag = (tag) => {
    const trimmed = tag.trim();
    if (!trimmed || (selected.tags || []).includes(trimmed)) return;
    saveTags([...(selected.tags || []), trimmed]);
    setNewTagInput('');
  };

  const removeTag = (tag) => {
    saveTags((selected.tags || []).filter(t => t !== tag));
  };

  const changeFunnelStage = async (stage) => {
    if (!selected) return;
    setSavingFunnel(true);
    try {
      await axios.put(
        `${API}/api/bot/conversations/${selected.id}/funnel`,
        { stage },
        { headers: getHeaders() }
      );
      setSelected(prev => ({ ...prev, funnel_stage: stage }));
      setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, funnel_stage: stage } : c));
    } catch {
      alert('Error actualizando la etapa. Intentá de nuevo.');
    } finally {
      setSavingFunnel(false);
    }
  };

  const sendManualMessage = async () => {
    const text = messageInput.trim();
    if (!text || !selected) return;
    setSendingMessage(true);
    try {
      const res = await axios.post(
        `${API}/api/bot/conversations/${selected.id}/send`,
        { message: text },
        { headers: getHeaders() }
      );
      setSelected(res.data.conversation);
      setConversations(prev => prev.map(c => c.id === res.data.conversation.id ? { ...c, status: 'human' } : c));
      setMessages(prev => [...prev, {
        id: `temp-${Date.now()}`,
        role: 'assistant',
        content: text,
        timestamp: new Date().toISOString()
      }]);
      setMessageInput('');
    } catch (err) {
      alert(err.response?.data?.error || 'Error enviando el mensaje');
    } finally {
      setSendingMessage(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.4fr' : '1fr', gap: 20 }}>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
            {conversations.filter(c => !funnelFilter || c.funnel_stage === funnelFilter).length} conversaciones
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              onClick={() => setFunnelFilter('')}
              style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontWeight: 500,
                border: funnelFilter === '' ? '2px solid #7C3AED' : '1px solid var(--border)',
                background: funnelFilter === '' ? '#EDE9FE' : 'var(--bg)', color: funnelFilter === '' ? '#7C3AED' : 'var(--text-muted)'
              }}
            >Todas</button>
            {FUNNEL_STAGES.map(s => (
              <button key={s.key} onClick={() => setFunnelFilter(funnelFilter === s.key ? '' : s.key)} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontWeight: 500,
                border: funnelFilter === s.key ? `2px solid ${s.color}` : '1px solid var(--border)',
                background: funnelFilter === s.key ? s.bg : 'var(--bg)', color: funnelFilter === s.key ? s.color : 'var(--text-muted)'
              }}>{s.label}</button>
            ))}
          </div>
        </div>
        {loading ? (
          <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 14 }}>Cargando...</p>
        ) : conversations.length === 0 ? (
          <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>
            Todavía no hay conversaciones
          </p>
        ) : (
          <ul className="conv-list" style={{ padding: '0 16px' }}>
            {conversations.filter(c => !funnelFilter || c.funnel_stage === funnelFilter).map(conv => (
              <li
                key={conv.id}
                className="conv-item"
                onClick={() => loadMessages(conv)}
                style={{
                  background: selected?.id === conv.id ? '#F5F3FF' : 'transparent',
                  borderRadius: 8,
                  padding: '12px 8px',
                  borderBottom: '1px solid var(--border)'
                }}
              >
                <div className="conv-avatar">
                  {(conv.customer_name || conv.customer_phone)[0].toUpperCase()}
                </div>
                <div className="conv-info">
                  <div className="conv-name" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ChannelLogo channel={conv.channel} size={13} style={{ borderRadius: 3 }} />
                    {conv.customer_name || conv.customer_phone}
                  </div>
                  <div className="conv-last">{conv.last_message || '—'}</div>
                  {conv.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {conv.tags.map(tag => (
                        <span key={tag} style={{
                          fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 500,
                          background: getTagStyle(tag).bg, color: getTagStyle(tag).color
                        }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className={`conv-badge ${conv.status === 'bot' ? 'badge-bot' : 'badge-human'}`}>
                    {conv.status === 'bot' ? '🤖' : '👤'}
                  </span>
                  {conv.funnel_stage && conv.funnel_stage !== 'nuevo' && (() => {
                    const fs = getFunnelStyle(conv.funnel_stage);
                    return (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500, background: fs.bg, color: fs.color }}>
                        {fs.label}
                      </span>
                    );
                  })()}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {conv.message_count} msg
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="conv-avatar" style={{ width: 32, height: 32, fontSize: 14 }}>
              {(selected.customer_name || selected.customer_phone)[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{selected.customer_name || selected.customer_phone}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selected.customer_phone}</div>
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
              {selected.status === 'bot' ? (
                <button
                  onClick={() => toggleStatus('human')}
                  disabled={togglingStatus}
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: '6px 12px', width: 'auto' }}
                >
                  👤 Tomar control
                </button>
              ) : (
                <button
                  onClick={() => toggleStatus('bot')}
                  disabled={togglingStatus}
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: '6px 12px', width: 'auto' }}
                >
                  🤖 Devolver al bot
                </button>
              )}
            </div>

            <button
              onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}
            >×</button>
          </div>

          {selected.status === 'human' && (
            <div style={{ padding: '8px 20px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', fontSize: 12, color: '#92400E' }}>
              👤 Estás en control de esta conversación — el bot no va a responder hasta que la devuelvas.
            </div>
          )}

          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {(selected.tags || []).map(tag => (
                <span key={tag} style={{
                  fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: getTagStyle(tag).bg, color: getTagStyle(tag).color
                }}>
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    disabled={savingTags}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13, padding: 0, lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {SUGGESTED_TAGS.filter(t => !(selected.tags || []).includes(t)).map(tag => (
                <button
                  key={tag}
                  onClick={() => addTag(tag)}
                  disabled={savingTags}
                  style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)',
                    background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'pointer'
                  }}
                >+ {tag}</button>
              ))}
              <input
                placeholder="Tag personalizado..."
                value={newTagInput}
                onChange={e => setNewTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTag(newTagInput); }}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)', width: 140, outline: 'none' }}
              />
            </div>

            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                🎯 Etapa del embudo
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {FUNNEL_STAGES.map(s => {
                  const isActive = (selected.funnel_stage || 'nuevo') === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => changeFunnelStage(s.key)}
                      disabled={savingFunnel}
                      style={{
                        fontSize: 11, padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600,
                        border: isActive ? `2px solid ${s.color}` : '1px solid var(--border)',
                        background: isActive ? s.bg : 'var(--bg)',
                        color: isActive ? s.color : 'var(--text-muted)',
                        opacity: savingFunnel ? 0.6 : 1
                      }}
                    >{s.label}</button>
                  );
                })}
              </div>
            </div>

            {contactVariables.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  📋 Datos detectados por el bot
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {contactVariables.map(v => (
                    <span key={v.field_name} style={{
                      fontSize: 12, padding: '4px 10px', borderRadius: 8, background: '#EFF6FF',
                      border: '1px solid #BFDBFE', color: '#1D4ED8'
                    }}>
                      <strong>{v.field_name}:</strong> {v.field_value}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-start' : 'flex-end'
                }}
              >
                <div style={{
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: msg.role === 'user' ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                  background: msg.role === 'user' ? 'white' : 'var(--green-light)',
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  lineHeight: 1.5
                }}>
                  {msg.content}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                    {new Date(msg.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {selected.is_typing && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  padding: '8px 14px', borderRadius: '12px 4px 12px 12px',
                  background: 'var(--green-light)', border: '1px solid var(--border)',
                  fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic'
                }}>
                  🤖 escribiendo...
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              placeholder="Escribir mensaje manual..."
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !sendingMessage) sendManualMessage(); }}
              disabled={sendingMessage}
              style={{ flex: 1, padding: '8px 11px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none' }}
            />
            <button
              onClick={sendManualMessage}
              disabled={sendingMessage || !messageInput.trim()}
              className="btn btn-primary"
              style={{ width: 'auto', padding: '8px 14px' }}
            >
              {sendingMessage ? '...' : 'Enviar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
