import { useEffect, useState } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL;

const TONOS = [
  { v: 'amigable', t: 'Amigable (voseo)' },
  { v: 'profesional', t: 'Profesional' },
  { v: 'vendedor', t: 'Vendedor' },
  { v: 'casual', t: 'Casual' }
];

// Personalidad de un cerebro que no es el principal (Soporte, etc.)
export default function BrainPanel({ brainId, onChange }) {
  const [b, setB] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    setB(null);
    axios.get(`${API}/api/brains/${brainId}`, { headers: headers() })
      .then(r => setB(r.data))
      .catch(() => setMsg({ ok: false, t: 'No se pudo cargar el cerebro' }));
  }, [brainId]);

  if (!b) return <div className="card">{msg ? msg.t : 'Cargando…'}</div>;

  const campo = (k, v) => setB({ ...b, [k]: v });
  const guardar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { name, kind, bot_name, bot_tone, ai_model, system_prompt, business_info, label_instructions } = b;
      await axios.put(`${API}/api/brains/${brainId}`, { name, kind, bot_name, bot_tone, ai_model, system_prompt, business_info, label_instructions }, { headers: headers() });
      setMsg({ ok: true, t: 'Cerebro guardado' });
      onChange && onChange();
    } catch (e) {
      setMsg({ ok: false, t: e.response?.data?.error || 'No se pudo guardar' });
    }
    setBusy(false);
  };

  return (
    <div>
      {msg && <div className={msg.ok ? 'success-msg' : 'error-msg'}>{msg.ok ? '✅' : '❌'} {msg.t}</div>}
      <div className="card">
        <div className="card-title">🎭 Personalidad del cerebro "{b.name}"</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
            <label>Nombre del cerebro</label>
            <input value={b.name || ''} onChange={e => campo('name', e.target.value)} />
          </div>
          <div className="form-group" style={{ minWidth: 160 }}>
            <label>Tipo</label>
            <select value={b.kind} onChange={e => campo('kind', e.target.value)}>
              <option value="ventas">Ventas</option>
              <option value="soporte">Soporte</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
            <label>Nombre con el que se presenta</label>
            <input value={b.bot_name || ''} onChange={e => campo('bot_name', e.target.value)} placeholder="Ej: Maxi" />
          </div>
          <div className="form-group" style={{ minWidth: 180 }}>
            <label>Tono</label>
            <select value={b.bot_tone || 'amigable'} onChange={e => campo('bot_tone', e.target.value)}>
              {TONOS.map(t => <option key={t.v} value={t.v}>{t.t}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 220 }}>
            <label>Modelo</label>
            <select value={b.ai_model || ''} onChange={e => campo('ai_model', e.target.value || null)}>
              <option value="">El mismo del cerebro principal</option>
              <option value="claude-haiku-4-5-20251001">⚡ Rápido y económico</option>
              <option value="claude-sonnet-4-6">🧠 Avanzado</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Instrucciones (cómo atiende, qué no dice nunca, cuándo pasa el chat a una persona)</label>
          <textarea style={{ minHeight: 280, fontSize: 13 }} value={b.system_prompt || ''} onChange={e => campo('system_prompt', e.target.value)} />
          {b.kind === 'soporte' && (
            <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Para pasar el caso a una persona, el bot escribe [[derivar:tema]] y el chat queda en la cola del equipo de soporte.
            </small>
          )}
        </div>
        <div className="form-group">
          <label>Datos del negocio que necesita saber</label>
          <textarea style={{ minHeight: 100 }} value={b.business_info || ''} onChange={e => campo('business_info', e.target.value)}
            placeholder="Horarios de soporte, cómo se contacta, plazos, garantías..." />
        </div>
        <div className="form-group">
          <label>Reglas de etiquetas de este cerebro</label>
          <textarea style={{ minHeight: 80 }} value={b.label_instructions || ''} onChange={e => campo('label_instructions', e.target.value)}
            placeholder={'- "Reclamo": cuando el cliente está enojado\n- "Resuelto": cuando confirma que anda'} />
        </div>
        <button className="btn btn-primary" style={{ width: 'auto', padding: '10px 22px' }} onClick={guardar} disabled={busy}>
          {busy ? 'Guardando…' : '💾 Guardar cerebro'}
        </button>
      </div>
    </div>
  );
}
