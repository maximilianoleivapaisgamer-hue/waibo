import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/forgot-password`, { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Ocurrió un error. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <Image src="/waibo-logo.png" alt="Waibo" width={80} height={80} style={{ borderRadius: 20, marginBottom: 8 }} />
          <h1>Waibo</h1>
          <p>Recuperar contraseña</p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>¡Revisá tu email!</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 }}>
              Si <strong>{email}</strong> está registrado, te mandamos un link para resetear tu contraseña. Revisá también la carpeta de spam.
            </p>
            <Link href="/" style={{ display: 'inline-block', marginTop: 20, color: 'var(--primary)', fontSize: 14, textDecoration: 'none', fontWeight: 500 }}>
              ← Volver al login
            </Link>
          </div>
        ) : (
          <>
            {error && <div className="error-msg">{error}</div>}
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
              Ingresá el email de tu cuenta y te mandamos un link para crear una nueva contraseña.
            </p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar link de recuperación'}
              </button>
            </form>
            <div className="auth-link">
              <Link href="/">← Volver al login</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
