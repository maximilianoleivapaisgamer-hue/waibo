import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Profile() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/login'); return; }
    axios.get(`${API}/api/clients/me`, { headers: getHeaders() })
      .then(res => setProfile(res.data))
      .catch(err => { if (err.response?.status === 401) router.push('/login'); });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await axios.put(`${API}/api/clients/me`, profile, { headers: getHeaders() });
      const updated = { ...profile, ...data };
      setProfile(updated);
      localStorage.setItem('whabot_client', JSON.stringify(updated));
      setSuccess('¡Perfil actualizado correctamente!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.next !== pwForm.confirm) { setPwError('Las contraseñas no coinciden.'); return; }
    if (pwForm.next.length < 6) { setPwError('La nueva contraseña debe tener al menos 6 caracteres.'); return; }
    setPwSaving(true);
    try {
      await axios.put(`${API}/api/clients/me/password`, {
        current_password: pwForm.current,
        new_password: pwForm.next,
      }, { headers: getHeaders() });
      setPwSuccess('¡Contraseña actualizada!');
      setPwForm({ current: '', next: '', confirm: '' });
      setTimeout(() => setPwSuccess(''), 4000);
    } catch (err) {
      setPwError(err.response?.data?.error || 'Error al cambiar la contraseña.');
    } finally {
      setPwSaving(false);
    }
  };

  if (!profile) return (
    <div className="dashboard">
      <Sidebar active="profile" />
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      <Sidebar active="profile" />
      <div className="main-content">
        <div className="page-header">
          <h1>👤 Mi cuenta</h1>
          <p>Administrá tu perfil y credenciales</p>
        </div>

        <form onSubmit={handleSave}>
          {success && <div className="success-msg">✅ {success}</div>}
          {error && <div className="error-msg">{error}</div>}

          <div className="card">
            <div className="card-title">Datos personales</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Tu nombre</label>
                <input value={profile.name || ''} onChange={e => setProfile({ ...profile, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Nombre del negocio</label>
                <input value={profile.business_name || ''} onChange={e => setProfile({ ...profile, business_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input value={profile.email || ''} disabled style={{ background: '#F9FAFB', color: 'var(--text-muted)' }} />
              </div>
              <div className="form-group">
                <label>Teléfono</label>
                <input value={profile.phone_number || ''} onChange={e => setProfile({ ...profile, phone_number: e.target.value })} placeholder="+549 11..." />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: 'auto', padding: '11px 28px', marginTop: 8 }}>
              {saving ? 'Guardando...' : '💾 Guardar cambios'}
            </button>
          </div>
        </form>

        <form onSubmit={handleChangePassword}>
          <div className="card">
            <div className="card-title">🔒 Cambiar contraseña</div>
            {pwSuccess && <div className="success-msg">✅ {pwSuccess}</div>}
            {pwError && <div className="error-msg">{pwError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Contraseña actual</label>
                <input type="password" value={pwForm.current} onChange={e => setPwForm({ ...pwForm, current: e.target.value })} required placeholder="••••••••" />
              </div>
              <div className="form-group">
                <label>Nueva contraseña</label>
                <input type="password" value={pwForm.next} onChange={e => setPwForm({ ...pwForm, next: e.target.value })} required placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="form-group">
                <label>Confirmar nueva</label>
                <input type="password" value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} required placeholder="Repetí la contraseña" />
              </div>
            </div>
            <button className="btn btn-secondary" type="submit" disabled={pwSaving} style={{ width: 'auto', padding: '11px 28px', marginTop: 8 }}>
              {pwSaving ? 'Cambiando...' : '🔑 Cambiar contraseña'}
            </button>
          </div>
        </form>

        <div className="card">
          <div className="card-title">🔑 Configuración de WhatsApp</div>
          <div className="form-group">
            <label>API Key de 360dialog</label>
            <input
              type="password"
              value={profile.whatsapp_api_key || ''}
              onChange={e => setProfile({ ...profile, whatsapp_api_key: e.target.value })}
              placeholder="Tu clave de 360dialog"
            />
            <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Obtené tu clave en <a href="https://360dialog.com" target="_blank" rel="noreferrer" style={{ color: 'var(--green-dark)' }}>360dialog.com</a> → Panel → API Keys
            </small>
          </div>
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 12, fontSize: 13 }}>
            <strong>⚠️ Tu webhook URL:</strong><br />
            <code style={{ fontSize: 12, background: '#F3F4F6', padding: '4px 8px', borderRadius: 4, display: 'inline-block', marginTop: 6 }}>
              {API}/webhook/whatsapp/{profile.id}
            </code>
            <br />
            <small style={{ color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>
              Copiá esta URL y configurala en el panel de 360dialog como tu webhook.
            </small>
          </div>
        </div>

        <div className="card" style={{ background: '#F8FAFC' }}>
          <div className="card-title">📋 Tu plan actual</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 32 }}>🚀</span>
            <div>
              <div style={{ fontWeight: 700, textTransform: 'capitalize', fontSize: 16 }}>{profile.plan || 'Prueba gratuita'}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Cuenta creada el {new Date(profile.created_at).toLocaleDateString('es-AR')}</div>
            </div>
            <button onClick={() => router.push('/billing')} className="btn btn-secondary" style={{ width: 'auto', marginLeft: 'auto' }}>
              Ver planes →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
