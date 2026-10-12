import { useEffect, useState } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL;

const ESPERAS = [
  { h: 1, l: '1 hora' }, { h: 2, l: '2 horas' }, { h: 4, l: '4 horas' }, { h: 8, l: '8 horas' },
  { h: 24, l: '1 día' }, { h: 48, l: '2 días' }, { h: 72, l: '3 días' }, { h: 120, l: '5 días' },
  { h: 168, l: '7 días' }, { h: 336, l: '14 días' }
];

const GUIA_EJEMPLO = `- Si se calló después de la info general o del video y todavía no vio el precio, mandale el precio para ver si le llama la atención.
- Si ya vio el precio y no contestó, preguntale corto si le quedó alguna duda.
- Si dijo que lo piensa, que lo habla con el socio o que escribe en unos días, esperá unos días antes de escribirle.
- Si dio una fecha (lo quiere para cuando cobra, el viernes, a fin de mes), escribile ese día.
- Si dijo que no le interesa, no es cliente o ya se despidió del todo, no le escribas más.`;

function fecha(ts) {
  return new Date(ts).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Recontacto de clientes que dejaron de contestar: la IA lee cada chat y decide según el
// caso si escribirle, esperar a la fecha que dio el cliente o no escribirle más.
export default function RecontactPanel() {
  const [cfg, setCfg] = useState(null);
  const [esperando, setEsperando] = useState([]);
  const [recientes, setRecientes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });
  const flash = (setter, msg) => { setter(msg); setTimeout(() => setter(''), 4000); };

  const load = async () => {
    try {
      const r = await axios.get(`${API}/api/bot/recontact`, { headers: getHeaders() });
      const c = r.data.config;
      setCfg({
        enabled: !!c.recontact_enabled,
        schedule: c.recontact_schedule?.length ? c.recontact_schedule : [4, 24, 72],
        guide: c.recontact_guide || '',
        start_hour: c.recontact_start_hour ?? 9,
        end_hour: c.recontact_end_hour ?? 21,
        daily_limit: c.recontact_daily_limit ?? 40
      });
      setEsperando(r.data.esperando || []);
      setRecientes(r.data.recientes || []);
    } catch (e) {
      setError('No se pudo cargar el seguimiento');
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await axios.put(`${API}/api/bot/recontact`, cfg, { headers: getHeaders() });
      flash(setSuccess, 'Seguimiento guardado');
    } catch (e) {
      flash(setError, e.response?.data?.error || 'No se pudo guardar');
    }
    setBusy(false);
  };

  const frenar = async (id) => {
    await axios.put(`${API}/api/bot/conversations/${id}/recontact`, { action: 'stop' }, { headers: getHeaders() });
    load();
  };

  if (!cfg) return <div className="card">Cargando…</div>;

  const setIntento = (i, h) => setCfg({ ...cfg, schedule: cfg.schedule.map((x, j) => (j === i ? Number(h) : x)) });

  return (
    <div>
      {success && <div className="success-msg">✅ {success}</div>}
      {error && <div className="error-msg">❌ {error}</div>}

      <div className="card">
        <div className="card-title">🔁 Seguimiento de clientes</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Cuando un cliente deja de contestar, la IA lee la charla y decide según el caso: le vuelve a escribir, espera a la fecha que dio
          (por ejemplo "el viernes que cobro") o no le escribe más si se despidió. Si el cliente contesta, el seguimiento arranca de cero.
          No toca chats que atendés vos, derivados a vos ni archivados. Funciona en WhatsApp.
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} style={{ width: 'auto' }} />
          Hacer seguimiento automático
        </label>

        <div className="form-group">
          <label>Intentos (cuánto espera desde nuestro último mensaje sin respuesta)</label>
          {cfg.schedule.map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ minWidth: 76, fontSize: 13 }}>Intento {i + 1}</span>
              <select value={h} onChange={e => setIntento(i, e.target.value)} style={{ width: 'auto' }}>
                {ESPERAS.map(o => <option key={o.h} value={o.h}>{o.l}</option>)}
                {!ESPERAS.some(o => o.h === h) && <option value={h}>{h} horas</option>}
              </select>
              {cfg.schedule.length > 1 && (
                <button type="button" onClick={() => setCfg({ ...cfg, schedule: cfg.schedule.filter((_, j) => j !== i) })}
                  className="btn btn-secondary" style={{ width: 'auto', padding: '4px 10px' }}>🗑️</button>
              )}
            </div>
          ))}
          {cfg.schedule.length < 6 && (
            <button type="button" onClick={() => setCfg({ ...cfg, schedule: [...cfg.schedule, 168] })}
              className="btn btn-secondary" style={{ width: 'auto', padding: '4px 12px', fontSize: 13 }}>➕ Agregar intento</button>
          )}
          <small style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginTop: 4 }}>
            Si el cliente dio una fecha o pidió tiempo, la IA espera hasta esa fecha en vez de seguir estos tiempos.
          </small>
        </div>

        <div className="form-group">
          <label>Cómo hacer el seguimiento según cada caso</label>
          <textarea style={{ minHeight: 150 }} value={cfg.guide} onChange={e => setCfg({ ...cfg, guide: e.target.value })} placeholder={GUIA_EJEMPLO} />
          {!cfg.guide && (
            <button type="button" onClick={() => setCfg({ ...cfg, guide: GUIA_EJEMPLO })} className="btn btn-secondary"
              style={{ width: 'auto', padding: '4px 12px', fontSize: 13, marginTop: 6 }}>Usar el ejemplo</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ minWidth: 140 }}>
            <label>Desde las</label>
            <select value={cfg.start_hour} onChange={e => setCfg({ ...cfg, start_hour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 140 }}>
            <label>Hasta las</label>
            <select value={cfg.end_hour} onChange={e => setCfg({ ...cfg, end_hour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h + 1} value={h + 1}>{h + 1}:00</option>)}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 160 }}>
            <label>Máximo por día</label>
            <input type="number" min={1} max={200} value={cfg.daily_limit} onChange={e => setCfg({ ...cfg, daily_limit: e.target.value })} />
          </div>
        </div>
        <small style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginBottom: 12 }}>
          Manda de a uno, como mucho uno cada 5 minutos por línea. Con WhatsApp por QR conviene no pasar de 40 por día para que no restrinjan la línea.
          Con la API de Meta solo puede escribir dentro de las 24 horas del último mensaje del cliente.
        </small>

        <button type="button" onClick={save} disabled={busy} className="btn btn-primary" style={{ width: 'auto', padding: '10px 22px' }}>
          {busy ? 'Guardando…' : '💾 Guardar seguimiento'}
        </button>
      </div>

      <div className="card">
        <div className="card-title">📅 Esperando la fecha que dieron ({esperando.length})</div>
        {!esperando.length && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nadie por ahora.</p>}
        {esperando.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <div>
              <strong>{c.customer_name || c.customer_phone}</strong> · se le escribe el {fecha(c.recontact_hold_until)}
              {c.recontact_note && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.recontact_note}</div>}
            </div>
            <button type="button" onClick={() => frenar(c.id)} className="btn btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}>No escribirle</button>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">📨 Últimos seguimientos enviados</div>
        {!recientes.length && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Todavía no se mandó ninguno.</p>}
        {recientes.map((m, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <strong>{m.customer_name || m.customer_phone}</strong> · {fecha(m.timestamp)} · intento {m.recontact_count}
            <div style={{ color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{m.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
