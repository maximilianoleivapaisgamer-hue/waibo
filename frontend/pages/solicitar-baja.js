import { useState } from 'react';
import axios from 'axios';
import Image from 'next/image';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function SolicitarBaja() {
  const [form, setForm] = useState({ phone: '', name: '', reason: '' });
  const [status, setStatus] = useState(null); // 'ok' | 'error' | null
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      await axios.post(`${API}/api/privacy/solicitar-baja`, form);
      setStatus('ok');
      setForm({ phone: '', name: '', reason: '' });
    } catch {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="auth-logo">
          <Image src="/waibo-logo.png" alt="Waibo" width={80} height={80} style={{ borderRadius: 20, marginBottom: 8 }} />
          <h1>Solicitud de baja de datos</h1>
          <p>Ejercé tu derecho de eliminación según la Ley 25.326</p>
        </div>

        {status === 'ok' && (
          <div className="success-msg" style={{ marginBottom: 16 }}>
            ✅ Solicitud recibida. Te contactaremos a la brevedad para confirmar la eliminación de tus datos.
          </div>
        )}

        {status === 'error' && (
          <div className="error-msg" style={{ marginBottom: 16 }}>
            ❌ Hubo un error al enviar tu solicitud. Por favor escribinos a{' '}
            <a href="mailto:privacidad@waibochat.com">privacidad@waibochat.com</a>.
          </div>
        )}

        {status !== 'ok' && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Número de teléfono</label>
              <input
                type="tel"
                placeholder="+549 11 XXXX XXXX"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                required
              />
              <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                El mismo número con el que interactuaste con el negocio por WhatsApp u otro canal.
              </small>
            </div>

            <div className="form-group">
              <label>Nombre completo</label>
              <input
                type="text"
                placeholder="Tu nombre y apellido"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Motivo (opcional)</label>
              <textarea
                placeholder="Podés indicar el motivo de tu solicitud si lo deseás."
                value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value })}
                style={{ minHeight: 90 }}
              />
            </div>

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Enviando...' : '📨 Enviar solicitud'}
            </button>
          </form>
        )}

        <div style={{ marginTop: 24, padding: '16px', background: 'var(--bg)', borderRadius: 10, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong>¿Qué datos se eliminan?</strong><br />
          Todos los mensajes, turnos, pedidos y datos de contacto asociados a tu número de teléfono en nuestra plataforma.
          El proceso puede demorar hasta 72 horas hábiles.
          Ante cualquier consulta: <a href="mailto:privacidad@waibochat.com" style={{ color: 'var(--green-dark)' }}>privacidad@waibochat.com</a>
        </div>
      </div>
    </div>
  );
}
