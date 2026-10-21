import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

// El video, la foto o la nota de voz de la biblioteca, como le llega al cliente
function PruebaMedia({ media }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u = null;
    axios.get(`${API}/api/resources/${media.id}/file`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('whabot_token')}` }, responseType: 'blob', timeout: 120000
    }).then(r => { u = URL.createObjectURL(r.data); setUrl(u); }).catch(() => setUrl('error'));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [media.id]);
  if (url === 'error') return <div style={{ fontSize: 12, fontStyle: 'italic' }}>⚠️ No se pudo cargar {media.name}</div>;
  if (!url) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>⏳ Cargando {media.name}…</div>;
  const estilo = { display: 'block', maxWidth: 300, maxHeight: 360, borderRadius: 8, marginBottom: media.caption ? 6 : 0 };
  if (media.kind === 'image') return <img src={url} alt={media.name} style={estilo} />;
  if (media.kind === 'video') return <video controls src={url} style={estilo} />;
  if (media.kind === 'audio') return <audio controls src={url} style={{ width: 260, display: 'block', marginBottom: media.caption ? 6 : 0 }} />;
  return <a href={url} target="_blank" rel="noreferrer">📄 {media.name}</a>;
}

export default function TestChat() {
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [salesStep, setSalesStep] = useState(0);
  const [sentResources, setSentResources] = useState([]);
  const scrollRef = useRef(null);

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/login'); return; }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await axios.post(
        `${API}/api/bot/test-chat`,
        { message: text, history: messages.filter(m => !m.isNote && !m.isError).map(m => m.media ? { role: 'assistant', content: `📎 ${m.media.name}${m.content ? ' ' + m.content : ''}` } : { role: m.role, content: m.content }), sales_step: salesStep, sent_resources: sentResources },
        { headers: getHeaders() }
      );
      setSalesStep(res.data.sales_step ?? salesStep);
      setSentResources(res.data.sent_resources || sentResources);
      const archivos = (res.data.media || []).flatMap(m => [
        { role: 'assistant', media: m, content: m.caption || '' },
        ...(m.after_text ? [{ role: 'assistant', content: m.after_text }] : [])
      ]);
      setMessages(prev => [
        ...prev,
        ...(res.data.response ? [{ role: 'assistant', content: res.data.response }] : []),
        ...archivos,
        ...(res.data.notes || []).map(n => ({ role: 'assistant', content: n, isNote: true }))
      ]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ ' + (err.response?.data?.error || 'Error de conexión con el bot'),
        isError: true
      }]);
    } finally {
      setSending(false);
    }
  };

  const resetChat = () => {
    if (messages.length && !confirm('¿Borrar esta conversación de prueba?')) return;
    setMessages([]);
    setSalesStep(0);
    setSentResources([]);
  };

  return (
    <div className="dashboard">
      <Sidebar active="test-chat" />
      <div className="main-content">
        <div className="page-header">
          <h1>🧪 Modo prueba</h1>
          <p>Probá cómo responde tu bot antes de que hable con clientes reales — esto no usa WhatsApp ni gasta nada</p>
        </div>

        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: '#1D4ED8' }}>
          💡 Esta conversación es solo para vos. No queda guardada como un chat real, no manda nada por WhatsApp. Sigue tus pasos de venta como un cliente nuevo, y en amarillo ves lo que haría el bot (mandar un video, etiquetar, pasarte el chat).
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '65vh' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>🤖 Chat de prueba</div>
            <button onClick={resetChat} className="btn btn-secondary" style={{ width: 'auto', fontSize: 12, padding: '5px 12px' }}>
              🔄 Reiniciar
            </button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, background: '#ECE5DD' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 40 }}>
                Escribí algo como si fueras un cliente, para ver cómo responde tu bot 👇
              </div>
            )}
            {messages.map((msg, i) => msg.isNote ? (
              <div key={i} style={{ alignSelf: 'center', fontSize: 12, padding: '4px 12px', borderRadius: 8, background: '#FFF7D6', color: '#7C5E00', maxWidth: '85%', whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </div>
            ) : (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-start' : 'flex-end' }}>
                <div style={{
                  maxWidth: '78%',
                  padding: '8px 12px',
                  borderRadius: msg.role === 'user' ? '3px 10px 10px 10px' : '10px 3px 10px 10px',
                  background: msg.isError ? '#FEE2E2' : (msg.role === 'user' ? '#fff' : '#DCF8C6'),
                  boxShadow: '0 1px 2px rgba(0,0,0,.1)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap'
                }}>
                  {msg.media && <PruebaMedia media={msg.media} />}
                  {msg.content}
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ padding: '8px 12px', borderRadius: '10px 3px 10px 10px', background: '#DCF8C6', fontSize: 13, color: 'var(--text-muted)' }}>
                  escribiendo...
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              placeholder="Escribí como si fueras un cliente..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              disabled={sending}
              style={{ flex: 1, padding: '8px 11px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none' }}
            />
            <button onClick={send} disabled={sending || !input.trim()} className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px' }}>
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
