import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function ResetPassword() {
  const router = useRouter();
  const { token } = router.query;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/api/auth/reset-password/validate?token=${token}`)
      .then(r => setTokenValid(r.data.valid))
      .catch(() => setTokenValid(false))
      .finally(() => setValidating(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('Las contraseñas no coinciden');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres');
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/reset-password`, { token, password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Error actualizando contraseña');
    } finally {
      setLoading(false);
    }
  };

  if (!token || validating) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>Verificando link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <Image src="/waibo-logo.png" alt="Waibo" width={80} height={80} style={{ borderRadius: 20, marginBottom: 8 }} />
          <h1>Waibo</h1>
          <p>Nueva contraseña</p>
        </div>

        {!tokenValid ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏰</div>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Link expirado o inválido</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 }}>
              Este link ya fue usado o expiró (duran 1 hora). Solicitá uno nuevo.
            </p>
            <Link href="/forgot-password" style={{ display: 'inline-block', marginTop: 20, color: 'var(--primary)', fontSize: 14, textDecoration: 'none', fontWeight: 500 }}>
              Solicitar nuevo link
            </Link>
          </div>
        ) : done ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>¡Contraseña actualizada!</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Ya podés ingresar con tu nueva contraseña.</p>
            <button className="btn btn-primary" onClick={() => router.push('/')} style={{ marginTop: 20 }}>
              Ir al login
            </button>
          </div>
        ) : (
          <>
            {error && <div className="error-msg">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nueva contraseña</label>
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Confirmá la contraseña</label>
                <input
                  type="password"
                  placeholder="Repetí la contraseña"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
