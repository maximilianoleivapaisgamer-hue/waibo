import { useEffect, useState } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL;

const EJEMPLO = {
  question: 'Hola, cómo estás? Te consulto antes de pasarte la info, tenés local a la calle o vendés celulares por tu cuenta?',
  segments: [
    { name: 'Local', description: 'Tiene un local o casa de celulares a la calle, o las dos cosas', label: 'Local', route: 'sellers', seller_ids: [], close_message: '' },
    { name: 'Revendedor', description: 'Vende por su cuenta, a domicilio, por redes, o está por empezar', label: 'Revendedor', route: 'sellers', seller_ids: [], close_message: '' },
    { name: 'Particular', description: 'Es un consumidor final que quiere comprarse un celular en cuotas, no vende', label: 'Particular', route: 'close', seller_ids: [], close_message: 'Gracias por escribirnos. Nosotros no vendemos celulares: damos el sistema a los locales y revendedores para que puedan financiar. Cualquier cosa, acá estamos.' }
  ]
};

const RUTAS = [
  { v: 'sellers', t: 'A vendedores (por turno)' },
  { v: 'owner', t: 'A mí (pendientes)' },
  { v: 'close', t: 'Mensaje de cierre y archivar' }
];

// Recepción: el bot solo hace la pregunta de entrada, ubica al cliente en un segmento y lo
// deriva. Todo configurable por el negocio.
export default function ReceptionPanel() {
  const [cfg, setCfg] = useState(null);
  const [counts, setCounts] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    axios.get(`${API}/api/bot/reception`, { headers: headers() })
      .then(r => { setCfg({ enabled: r.data.enabled, question: r.data.question, segments: r.data.segments }); setCounts(r.data.counts || []); })
      .catch(() => setMsg({ ok: false, t: 'No se pudo cargar la recepción' }));
    axios.get(`${API}/api/bot/sellers`, { headers: headers() }).then(r => setSellers(r.data.sellers || [])).catch(() => {});
  }, []);

  if (!cfg) return <div className="card">Cargando…</div>;

  const setSeg = (i, campo, valor) => setCfg({ ...cfg, segments: cfg.segments.map((s, j) => (j === i ? { ...s, [campo]: valor } : s)) });
  const cuantos = (nombre) => counts.find(c => c.segment === nombre)?.n || 0;

  const guardar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await axios.put(`${API}/api/bot/reception`, cfg, { headers: headers() });
      setMsg({ ok: true, t: cfg.enabled ? 'Recepción guardada y activada' : 'Recepción guardada (apagada)' });
    } catch (e) {
      setMsg({ ok: false, t: e.response?.data?.error || 'No se pudo guardar' });
    }
    setBusy(false);
  };

  return (
    <div>
      {msg && <div className={msg.ok ? 'success-msg' : 'error-msg'}>{msg.ok ? '✅' : '❌'} {msg.t}</div>}
      <div className="card">
        <div className="card-title">📞 Recepción</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          El bot no vende: al cliente nuevo le hace tu pregunta de entrada, la IA ubica la respuesta en uno de tus segmentos
          (entiende la intención y también audios), le pone la etiqueta y lo deriva. Si la respuesta no queda clara, repregunta una vez;
          si sigue sin quedar claro, te lo pasa a vos. Después el bot no vuelve a escribir en ese chat: lo sigue una persona desde la Bandeja.
          Cuando la recepción está prendida, reemplaza a las respuestas del bot y a los pasos de venta.
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} style={{ width: 'auto' }} />
          Usar la recepción
        </label>

        <div className="form-group">
          <label>Pregunta de entrada</label>
          <textarea style={{ minHeight: 70 }} value={cfg.question} onChange={e => setCfg({ ...cfg, question: e.target.value })}
            placeholder="Ej: Hola, cómo estás? Te consulto antes de pasarte la info, tenés local o vendés por tu cuenta?" />
        </div>

        <div style={{ fontWeight: 600, fontSize: 14, margin: '6px 0 10px' }}>Segmentos</div>
        {!cfg.segments.length && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Todavía no hay segmentos.{' '}
            <button type="button" className="btn btn-secondary" style={{ width: 'auto', padding: '4px 12px', fontSize: 13 }}
              onClick={() => setCfg({ ...cfg, question: cfg.question || EJEMPLO.question, segments: EJEMPLO.segments })}>Cargar un ejemplo</button>
          </div>
        )}

        {cfg.segments.map((s, i) => (
          <div key={i} style={{ border: '1px solid var(--border, #E5E7EB)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <input value={s.name} onChange={e => setSeg(i, 'name', e.target.value)} placeholder="Nombre del segmento (ej: Local)" style={{ flex: 1, minWidth: 160, fontWeight: 600 }} />
              <input value={s.label || ''} onChange={e => setSeg(i, 'label', e.target.value)} placeholder="Etiqueta que se pone" style={{ width: 180 }} />
              {cuantos(s.name) > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cuantos(s.name)} chats</span>}
              <button type="button" className="btn btn-secondary" style={{ width: 'auto', padding: '6px 10px' }}
                onClick={() => setCfg({ ...cfg, segments: cfg.segments.filter((_, j) => j !== i) })}>🗑️</button>
            </div>
            <div className="form-group">
              <label>Cómo lo reconoce la IA</label>
              <textarea style={{ minHeight: 50 }} value={s.description} onChange={e => setSeg(i, 'description', e.target.value)}
                placeholder="Ej: tiene un local a la calle o una casa de celulares" />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div className="form-group" style={{ minWidth: 220 }}>
                <label>A dónde va</label>
                <select value={s.route} onChange={e => setSeg(i, 'route', e.target.value)}>
                  {RUTAS.map(r => <option key={r.v} value={r.v}>{r.t}</option>)}
                </select>
              </div>
              {s.route === 'sellers' && (
                <div className="form-group" style={{ flex: 1, minWidth: 220 }}>
                  <label>Vendedores de este segmento</label>
                  {!sellers.length
                    ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No tenés vendedores. Cargalos en Mi equipo; mientras tanto van a tus pendientes.</div>
                    : sellers.map(v => (
                      <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={(s.seller_ids || []).includes(v.id)}
                          onChange={e => setSeg(i, 'seller_ids', e.target.checked ? [...(s.seller_ids || []), v.id] : (s.seller_ids || []).filter(x => x !== v.id))} />
                        {v.name}
                      </label>
                    ))}
                  {sellers.length > 0 && <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>Si marcás varios, se reparten por turno (al que menos chats tiene).</small>}
                </div>
              )}
              {s.route === 'close' && (
                <div className="form-group" style={{ flex: 1, minWidth: 220 }}>
                  <label>Mensaje de cierre</label>
                  <textarea style={{ minHeight: 60 }} value={s.close_message || ''} onChange={e => setSeg(i, 'close_message', e.target.value)}
                    placeholder="Ej: Gracias por escribirnos, esto es solo para comercios..." />
                </div>
              )}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" style={{ width: 'auto', padding: '10px 18px' }} disabled={cfg.segments.length >= 12}
            onClick={() => setCfg({ ...cfg, segments: [...cfg.segments, { name: '', description: '', label: '', route: 'sellers', seller_ids: [], close_message: '' }] })}>
            ➕ Agregar segmento
          </button>
          <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '10px 22px' }} onClick={guardar} disabled={busy}>
            {busy ? 'Guardando…' : '💾 Guardar recepción'}
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          Lo que no entra en ningún segmento va a tus pendientes ("Te preguntaron y el bot no supo"). Para que funcione, el bot tiene que estar prendido en el canal.
        </p>
      </div>
    </div>
  );
}
