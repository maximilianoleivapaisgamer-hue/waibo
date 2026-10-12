import { useEffect, useState } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL;

const KIND_ICON = { image: '🖼️', video: '🎬', document: '📄', link: '🔗', audio: '🎙️' };

const EJEMPLO = [
  { title: 'Saludo', instruction: 'Saludá, presentate y preguntá qué necesita.', resource_id: null, label: '' },
  { title: 'Video de cómo funciona', instruction: 'Cuando cuente qué busca, decile que le pasás un video cortito.', resource_id: null, label: 'Interesado' },
  { title: 'Precio', instruction: 'Preguntá si le quedó alguna duda y pasale el precio.', resource_id: null, label: 'Presupuesto enviado' }
];

// Embudo ordenado para el canal WhatsApp por QR: el bot hace un paso por respuesta y
// Waibo recuerda en qué paso va cada chat.
export default function SalesStepsPanel() {
  const [steps, setSteps] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [counts, setCounts] = useState([]);
  const [resources, setResources] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });
  const flash = (setter, msg) => { setter(msg); setTimeout(() => setter(''), 4000); };

  const load = async () => {
    try {
      const [s, r] = await Promise.all([
        axios.get(`${API}/api/bot/sales-steps`, { headers: getHeaders() }),
        axios.get(`${API}/api/resources`, { headers: getHeaders() })
      ]);
      setSteps(s.data.steps.map(p => ({ ...p, label: p.label || '' })));
      setEnabled(s.data.enabled);
      setCounts(s.data.counts || []);
      setResources(r.data);
    } catch (e) {
      setError('No se pudieron cargar los pasos');
    }
    setLoaded(true);
  };

  useEffect(() => {
    load();
    axios.get(`${API}/api/whatsapp-qr/labels`, { headers: getHeaders() })
      .then(r => setLabels((r.data.labels || r.data || []).map(l => l.name || l)))
      .catch(() => {});
  }, []);

  const update = (i, field, value) => setSteps(prev => prev.map((p, j) => (j === i ? { ...p, [field]: value } : p)));
  const move = (i, dir) => setSteps(prev => {
    const next = [...prev];
    const j = i + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = (i) => setSteps(prev => prev.filter((_, j) => j !== i));
  const add = () => setSteps(prev => [...prev, { title: '', instruction: '', resource_id: null, label: '' }]);

  const save = async () => {
    if (steps.some(p => !p.title.trim())) return flash(setError, 'Cada paso necesita un nombre');
    setBusy(true);
    try {
      const r = await axios.put(`${API}/api/bot/sales-steps`, { steps, enabled }, { headers: getHeaders() });
      setSteps(r.data.steps.map(p => ({ ...p, label: p.label || '' })));
      flash(setSuccess, 'Pasos guardados');
    } catch (e) {
      flash(setError, e.response?.data?.error || 'No se pudo guardar');
    }
    setBusy(false);
  };

  const enPaso = (i) => counts.find(c => Number(c.step) === i)?.total || 0;

  if (!loaded) return <div className="card">Cargando…</div>;

  return (
    <div>
      {success && <div className="success-msg">✅ {success}</div>}
      {error && <div className="error-msg">❌ {error}</div>}

      <div className="card">
        <div className="card-title">🪜 Pasos de venta</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          El bot sigue estos pasos en orden, uno por respuesta, y Waibo recuerda en qué paso va cada chat.
          El paso 1 es la apertura: solo va a quien nunca recibió un mensaje tuyo; los demás arrancan en el paso 2.
          Si el cliente pregunta otra cosa, el bot primero le contesta y después sigue con el paso. Funciona en WhatsApp conectado por QR.
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ width: 'auto' }} />
          Usar los pasos de venta
        </label>

        {!steps.length && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            Todavía no hay pasos.{' '}
            <button type="button" onClick={() => setSteps(EJEMPLO)} className="btn btn-secondary" style={{ width: 'auto', padding: '4px 12px', fontSize: 13 }}>
              Cargar un ejemplo
            </button>
          </div>
        )}

        {steps.map((p, i) => (
          <div key={i} style={{ border: '1px solid var(--border, #E5E7EB)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontWeight: 700, minWidth: 64 }}>Paso {i + 1}</span>
              <input value={p.title} onChange={e => update(i, 'title', e.target.value)} placeholder="Nombre del paso (ej: Saludo)" style={{ flex: 1 }} />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="btn btn-secondary" style={{ width: 'auto', padding: '6px 10px' }} title="Subir">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="btn btn-secondary" style={{ width: 'auto', padding: '6px 10px' }} title="Bajar">↓</button>
              <button type="button" onClick={() => remove(i)} className="btn btn-secondary" style={{ width: 'auto', padding: '6px 10px' }} title="Borrar">🗑️</button>
            </div>
            <div className="form-group">
              <label>Qué tiene que hacer el bot en este paso</label>
              <textarea style={{ minHeight: 60 }} value={p.instruction} onChange={e => update(i, 'instruction', e.target.value)}
                placeholder="Ej: Preguntale para qué local lo quiere y cuántos celulares vende por mes." />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                <label>Mandar en este paso</label>
                <select value={p.resource_id || ''} onChange={e => update(i, 'resource_id', e.target.value || null)}>
                  <option value="">— nada —</option>
                  {resources.map(r => <option key={r.id} value={r.id}>{KIND_ICON[r.kind] || '📎'} {r.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                <label>Etiqueta al completarlo</label>
                <input list="etiquetas-wa" value={p.label} onChange={e => update(i, 'label', e.target.value)} placeholder="— ninguna —" />
              </div>
            </div>
            {p.resource_id && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                  <label>Texto junto al archivo (opcional)</label>
                  <textarea style={{ minHeight: 50 }} value={p.caption || ''} onChange={e => update(i, 'caption', e.target.value)}
                    placeholder="Ej: Te paso los precios 👇" />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                  <label>Mensaje después del archivo (opcional)</label>
                  <textarea style={{ minHeight: 50 }} value={p.after_text || ''} onChange={e => update(i, 'after_text', e.target.value)}
                    placeholder="Ej: Comentame si te quedó alguna duda" />
                </div>
              </div>
            )}
            {enPaso(i) > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{enPaso(i)} chat{enPaso(i) === 1 ? '' : 's'} en este paso</div>
            )}
          </div>
        ))}
        <datalist id="etiquetas-wa">{labels.map(l => <option key={l} value={l} />)}</datalist>

        {steps.length > 0 && enPaso(steps.length) > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>✅ {enPaso(steps.length)} chats completaron todos los pasos</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={add} disabled={steps.length >= 15} className="btn btn-secondary" style={{ width: 'auto', padding: '10px 18px' }}>➕ Agregar paso</button>
          <button type="button" onClick={save} disabled={busy} className="btn btn-primary" style={{ width: 'auto', padding: '10px 22px' }}>
            {busy ? 'Guardando…' : '💾 Guardar pasos'}
          </button>
        </div>
        {!resources.length && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
            Para mandar un video o una imagen en un paso, primero subilo en "Recursos y etiquetas".
          </p>
        )}
      </div>
    </div>
  );
}
