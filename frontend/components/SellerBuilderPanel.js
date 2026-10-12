import { useEffect, useState } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL;

const FUENTES = [
  { k: 'template', icon: '🗂️', t: 'Desde una plantilla', d: 'Elegí tu rubro y arrancá de una plantilla lista, que completás vos o con ayuda de la IA.' },
  { k: 'chats', icon: '💬', t: 'Desde mis chats', d: 'La IA lee tus conversaciones de WhatsApp guardadas en Waibo y aprende cómo vendés.' },
  { k: 'doc', icon: '📄', t: 'Desde un documento', d: 'Pegá o subí un texto o PDF con cómo vendés, precios y preguntas frecuentes.' },
  { k: 'questions', icon: '📝', t: 'Respondiendo preguntas', d: 'Contestá unas preguntas cortas sobre tu negocio y la IA arma el resto.' }
];

const PREGUNTAS = [
  '¿Qué vendés y a quién? (rubro, tipo de cliente)',
  '¿Cómo se llama quien atiende y cómo saluda?',
  '¿Cuáles son tus precios o planes?',
  '¿Cómo es tu venta paso a paso? (qué mandás primero, cuándo pasás el precio, cómo cerrás)',
  '¿Qué te preguntan siempre y qué contestás?',
  '¿Qué cosas NO hay que decir nunca?',
  '¿En qué casos querés que el bot te pase el chat a vos?',
  '¿Cómo seguís a los que dejan de contestar?',
  'Horarios, zona, formas de pago, envíos u otros datos'
];

const PARTES = [
  { k: 'name', t: 'Nombre del bot' },
  { k: 'prompt', t: 'Instrucciones del bot' },
  { k: 'steps', t: 'Pasos de venta' },
  { k: 'labels', t: 'Reglas de etiquetas' },
  { k: 'recontact', t: 'Reglas de seguimiento (queda apagado hasta que lo prendas)' },
  { k: 'delay', t: 'Demora antes de contestar' }
];

function esperaTxt(h) {
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} día${h >= 48 ? 's' : ''}`;
}

// Arma toda la configuración del vendedor con IA a partir de chats, un documento o
// preguntas. Muestra la propuesta, se puede editar y se aplica lo que el dueño elija.
export default function SellerBuilderPanel() {
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [parts, setParts] = useState(PARTES.map(p => p.k));
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState('');

  useEffect(() => {
    axios.get(`${API}/api/seller-builder/templates`, { headers: getHeaders() })
      .then(r => setTemplates(r.data.templates || []))
      .catch(() => {});
  }, []);

  const usarPlantilla = async () => {
    setError('');
    try {
      const r = await axios.get(`${API}/api/seller-builder/templates/${template}`, { headers: getHeaders() });
      setProposal(r.data.proposal);
      setApplied(false);
    } catch (e) {
      setError('No se pudo cargar la plantilla');
    }
  };

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  const proponer = async () => {
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('source', source === 'template' ? 'doc' : source);
      if (source === 'template') { fd.append('template', template); fd.append('text', text); }
      if (source === 'doc') { fd.append('text', text); if (file) fd.append('file', file); }
      if (source === 'questions') fd.append('answers', JSON.stringify(answers));
      const r = await axios.post(`${API}/api/seller-builder/propose`, fd, { headers: getHeaders(), timeout: 300000 });
      setProposal(r.data.proposal);
      setApplied(false);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo armar. Probá de nuevo.');
    }
    setLoading(false);
  };

  const aplicar = async () => {
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API}/api/seller-builder/apply`, { proposal, parts }, { headers: getHeaders() });
      setApplied(true);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo aplicar');
    }
    setLoading(false);
  };

  const editStep = (i, field, value) => setProposal({ ...proposal, sales_steps: proposal.sales_steps.map((s, j) => (j === i ? { ...s, [field]: value } : s)) });
  const toggle = (k) => setParts(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
  const puedeArmar = (source === 'template' && template && text.trim().length > 150) || source === 'chats' || (source === 'doc' && (text.trim().length > 50 || file)) || (source === 'questions' && Object.values(answers).join('').length > 80);

  if (applied) {
    const archivos = (proposal.sales_steps || []).map((s, i) => s.needs_file ? `Paso ${i + 1} (${s.title}): ${s.needs_file}` : null).filter(Boolean);
    return (
      <div className="card">
        <div className="card-title">✅ Tu vendedor quedó configurado</div>
        <p style={{ fontSize: 14 }}>Ahora:</p>
        <ol style={{ fontSize: 14, lineHeight: 1.8 }}>
          <li>Probalo en <a href="/test-chat">🧪 Modo prueba</a> haciéndote pasar por un cliente.</li>
          {archivos.length > 0 && (
            <li>Subí estos archivos en <strong>📎 Recursos y etiquetas</strong> y elegilos en cada paso de <strong>🪜 Pasos de venta</strong>:
              <ul>{archivos.map(a => <li key={a}>{a}</li>)}</ul>
            </li>
          )}
          {proposal.missing?.length > 0 && (
            <li>Completá en las instrucciones lo que falta: {proposal.missing.join(', ')}.</li>
          )}
          <li>Retocá lo que quieras en cada pestaña. Siempre podés volver a armarlo acá.</li>
        </ol>
        <button type="button" onClick={() => { setProposal(null); setApplied(false); }} className="btn btn-secondary" style={{ width: 'auto', padding: '8px 16px' }}>Armar de nuevo</button>
      </div>
    );
  }

  if (proposal) {
    return (
      <div>
        {error && <div className="error-msg">❌ {error}</div>}
        <div className="card">
          <div className="card-title">✨ Esto armó la IA</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            Revisalo y corregí lo que quieras. Elegí qué partes aplicar: reemplazan lo que tenés hoy en cada una.
          </p>
          {proposal.missing?.length > 0 && (
            <div style={{ background: '#FFF7D6', border: '1px solid #F5D76E', borderRadius: 10, padding: 12, fontSize: 13, marginBottom: 14 }}>
              ⚠️ <strong>Faltan datos que conviene completar:</strong> {proposal.missing.join(', ')}.
            </div>
          )}

          <div className="form-group">
            <label><input type="checkbox" checked={parts.includes('name')} onChange={() => toggle('name')} style={{ width: 'auto', marginRight: 6 }} />Nombre del bot</label>
            <input value={proposal.bot_name || ''} onChange={e => setProposal({ ...proposal, bot_name: e.target.value })} />
          </div>

          <div className="form-group">
            <label><input type="checkbox" checked={parts.includes('prompt')} onChange={() => toggle('prompt')} style={{ width: 'auto', marginRight: 6 }} />Instrucciones del bot</label>
            <textarea style={{ minHeight: 260, fontSize: 13 }} value={proposal.system_prompt || ''} onChange={e => setProposal({ ...proposal, system_prompt: e.target.value })} />
          </div>

          <div className="form-group">
            <label><input type="checkbox" checked={parts.includes('steps')} onChange={() => toggle('steps')} style={{ width: 'auto', marginRight: 6 }} />Pasos de venta</label>
            {(proposal.sales_steps || []).map((s, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <input value={s.title} onChange={e => editStep(i, 'title', e.target.value)} style={{ fontWeight: 600, marginBottom: 6 }} />
                <textarea style={{ minHeight: 60, fontSize: 13 }} value={s.instruction || ''} onChange={e => editStep(i, 'instruction', e.target.value)} />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {s.needs_file && <>📎 Archivo sugerido: {s.needs_file} · </>}
                  {s.label && <>🏷️ {s.label}</>}
                </div>
              </div>
            ))}
          </div>

          <div className="form-group">
            <label><input type="checkbox" checked={parts.includes('labels')} onChange={() => toggle('labels')} style={{ width: 'auto', marginRight: 6 }} />Reglas de etiquetas</label>
            <textarea style={{ minHeight: 90, fontSize: 13 }} value={proposal.label_instructions || ''} onChange={e => setProposal({ ...proposal, label_instructions: e.target.value })} />
          </div>

          <div className="form-group">
            <label><input type="checkbox" checked={parts.includes('recontact')} onChange={() => toggle('recontact')} style={{ width: 'auto', marginRight: 6 }} />
              Reglas de seguimiento {Array.isArray(proposal.recontact_schedule) && `(intentos a ${proposal.recontact_schedule.map(esperaTxt).join(', ')})`}
            </label>
            <textarea style={{ minHeight: 90, fontSize: 13 }} value={proposal.recontact_guide || ''} onChange={e => setProposal({ ...proposal, recontact_guide: e.target.value })} />
            <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>Queda cargado pero apagado: lo prendés vos en 🔁 Seguimiento.</small>
          </div>

          <div className="form-group">
            <label><input type="checkbox" checked={parts.includes('delay')} onChange={() => toggle('delay')} style={{ width: 'auto', marginRight: 6 }} />
              Demora antes de contestar: {proposal.reply_delay_seconds} segundos
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={aplicar} disabled={loading || !parts.length} className="btn btn-primary" style={{ width: 'auto', padding: '10px 22px' }}>
              {loading ? 'Aplicando…' : '✅ Aplicar lo marcado'}
            </button>
            <button type="button" onClick={() => setProposal(null)} disabled={loading} className="btn btn-secondary" style={{ width: 'auto', padding: '10px 18px' }}>Volver</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="error-msg">❌ {error}</div>}
      <div className="card">
        <div className="card-title">✨ Armá tu vendedor con IA</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px' }}>
          Contale a la IA cómo vendés y arma todo junto: cómo habla el bot, qué no dice nunca, tus pasos de venta, las etiquetas,
          el seguimiento y cuándo te pasa el chat. Después lo revisás antes de aplicarlo.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
          {FUENTES.map(f => (
            <button key={f.k} type="button" onClick={() => setSource(f.k)}
              style={{
                textAlign: 'left', padding: 14, borderRadius: 12, cursor: 'pointer', background: source === f.k ? '#F5F3FF' : 'var(--bg)',
                border: source === f.k ? '2px solid #7C3AED' : '1px solid var(--border)'
              }}>
              <div style={{ fontSize: 22 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, margin: '4px 0' }}>{f.t}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.d}</div>
            </button>
          ))}
        </div>

        {source === 'template' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 14 }}>
              {templates.map(t => (
                <button key={t.id} type="button" onClick={() => setTemplate(t.id)} title={t.description}
                  style={{
                    textAlign: 'left', padding: 10, borderRadius: 10, cursor: 'pointer', background: template === t.id ? '#F5F3FF' : 'var(--bg)',
                    border: template === t.id ? '2px solid #7C3AED' : '1px solid var(--border)'
                  }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.icon} {t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.description}</div>
                </button>
              ))}
            </div>
            {template && (
              <>
                <button type="button" onClick={usarPlantilla} className="btn btn-secondary" style={{ width: 'auto', padding: '8px 16px', marginBottom: 14 }}>
                  Ver la plantilla y completarla yo
                </button>
                <div className="form-group">
                  <label>O contale a la IA sobre tu negocio y la completa por vos</label>
                  <textarea style={{ minHeight: 140 }} value={text} onChange={e => setText(e.target.value)}
                    placeholder="Nombre del negocio, quién atiende, qué vendés, precios, zona, horarios, formas de pago, cómo vendés..." />
                </div>
              </>
            )}
          </div>
        )}

        {source === 'chats' && (
          <p style={{ fontSize: 13 }}>Va a leer hasta 200 de tus chats más recientes donde contestaste vos. Necesitás tener WhatsApp conectado y los chats importados.</p>
        )}

        {source === 'doc' && (
          <div>
            <div className="form-group">
              <label>Subí un archivo (PDF, TXT o MD)</label>
              <input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" onChange={e => setFile(e.target.files[0] || null)} />
            </div>
            <div className="form-group">
              <label>O pegá el texto acá</label>
              <textarea style={{ minHeight: 180 }} value={text} onChange={e => setText(e.target.value)}
                placeholder="Cómo vendés, precios, qué mandás primero, qué te preguntan siempre, qué no se dice..." />
            </div>
          </div>
        )}

        {source === 'questions' && PREGUNTAS.map(q => (
          <div key={q} className="form-group">
            <label>{q}</label>
            <textarea style={{ minHeight: 60 }} value={answers[q] || ''} onChange={e => setAnswers({ ...answers, [q]: e.target.value })} />
          </div>
        ))}

        {source && (
          <button type="button" onClick={proponer} disabled={loading || !puedeArmar} className="btn btn-primary" style={{ width: 'auto', padding: '10px 22px' }}>
            {loading ? '⏳ La IA está armando tu vendedor (1 a 3 minutos)…' : (source === 'template' ? '✨ Completar la plantilla con IA' : '✨ Armar mi vendedor')}
          </button>
        )}
      </div>
    </div>
  );
}
