import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Conversations() {
  const router = useRouter();
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

  const SUGGESTED_TAGS = ['Lead Caliente', 'Falta Pago', 'Turno Agendado'];
  const TAG_COLORS = {
    'Lead Caliente': { bg: '#FEE2E2', color: '#DC2626' },
    'Falta Pago': { bg: '#FEF3C7', color: '#92400E' },
    'Turno Agendado': { bg: '#DBEAFE', color: '#1D4ED8' },
  };
  const getTagStyle = (tag) => TAG_COLORS[tag] || { bg: '#F3F4F6', color: '#6B7280' };

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/'); return; }

    const refresh = async (isInitial) => {
      try {
        const convRes = await axios.get(`${API}/api/bot/conversations`, { headers: getHeaders() });
        setConversations(convRes.data);

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

  const downloadCSV = (rows, headers, filename) => {
    const escape = (val) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const csvContent = [
      headers.map(h => escape(h.label)).join(','),
      ...rows.map(row => headers.map(h => escape(h.get(row))).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportConversationsCSV = () => {
    downloadCSV(
      conversations,
      [
        { label: 'Cliente', get: c => c.customer_name || c.customer_phone },
        { label: 'Teléfono', get: c => c.customer_phone },
        { label: 'Canal', get: c => c.channel },
        { label: 'Estado', get: c => c.status === 'bot' ? 'Bot' : 'Humano' },
        { label: 'Tags', get: c => (c.tags || []).join('; ') },
        { label: 'Último mensaje', get: c => c.last_message },
        { label: 'Cantidad de mensajes', get: c => c.message_count },
        { label: 'Última actividad', get: c => new Date(c.updated_at).toLocaleString('es-AR') },
      ],
      `waibo-conversaciones-${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  const exportAllMessagesCSV = async () => {
    try {
      const res = await axios.get(`${API}/api/bot/export/messages`, { headers: getHeaders() });
      downloadCSV(
        res.data,
        [
          { label: 'Cliente', get: m => m.customer_name || m.customer_phone },
          { label: 'Teléfono', get: m => m.customer_phone },
          { label: 'Canal', get: m => m.channel },
          { label: 'Quién escribió', get: m => m.role === 'user' ? 'Cliente' : 'Bot/Negocio' },
          { label: 'Mensaje', get: m => m.content },
          { label: 'Fecha y hora', get: m => new Date(m.timestamp).toLocaleString('es-AR') },
        ],
        `waibo-mensajes-completo-${new Date().toISOString().slice(0, 10)}.csv`
      );
    } catch {
      alert('Error exportando los mensajes. Intentá de nuevo.');
    }
  };

  return (
    <div className="dashboard">
      <Sidebar active="conversations" />
      <div className="main-content">
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1>💬 Conversaciones</h1>
            <p>Historial de todos los chats de tus clientes</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportConversationsCSV} className="btn btn-secondary" style={{ width: 'auto', fontSize: 12, padding: '7px 14px' }}>
              📊 Exportar resumen (CSV)
            </button>
            <button onClick={exportAllMessagesCSV} className="btn btn-secondary" style={{ width: 'auto', fontSize: 12, padding: '7px 14px' }}>
              📄 Exportar todos los mensajes (CSV)
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.4fr' : '1fr', gap: 20 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 14 }}>
              {conversations.length} conversaciones
            </div>
            {loading ? (
              <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 14 }}>Cargando...</p>
            ) : conversations.length === 0 ? (
              <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>
                Todavía no hay conversaciones
              </p>
            ) : (
              <ul className="conv-list" style={{ padding: '0 16px' }}>
                {conversations.map(conv => (
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
                      <div className="conv-name">{conv.customer_name || conv.customer_phone}</div>
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
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span className={`conv-badge ${conv.status === 'bot' ? 'badge-bot' : 'badge-human'}`}>
                        {conv.status === 'bot' ? '🤖' : '👤'}
                      </span>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
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
      </div>
    </div>
  );
}
