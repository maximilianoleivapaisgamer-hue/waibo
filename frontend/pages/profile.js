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

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/'); return; }

    axios.get(`${API}/api/clients/me`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => setProfile(res.data)).catch(err => {
      if (err.response?.status === 401) router.push('/');
    });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const token = localStorage.getItem('whabot_token');
    try {
      await axios.put(`${API}/api/clients/me`, profile, {
        headers: { Authorization: `Bearer ${token}` }
      });
      localStorage.setItem('whabot_client', JSON.stringify(profile));
      setSuccess('¡Perfil actualizado!');
      setTimeout(() => setSuccess(''), 3000);
    } finally {
      setSaving(false);
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
          <p>Administrá tu perfil y credenciales de WhatsApp</p>
        </div>

        <form onSubmit={handleSave}>
          {success && <div className="success-msg">✅ {success}</div>}

          <div className="card">
            <div className="card-title">Datos personales</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Tu nombre</label>
                <input
                  value={profile.name || ''}
                  onChange={e => setProfile({ ...profile, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Nombre del negocio</label>
                <input
                  value={profile.business_name || ''}
                  onChange={e => setProfile({ ...profile, business_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input value={profile.email || ''} disabled style={{ background: '#F9FAFB' }} />
              </div>
              <div className="form-group">
                <label>Teléfono</label>
                <input
                  value={profile.phone_number || ''}
                  onChange={e => setProfile({ ...profile, phone_number: e.target.value })}
                  placeholder="+54911..."
                />
              </div>
            </div>
          </div>

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
                {process.env.NEXT_PUBLIC_API_URL}/webhook/whatsapp/{profile.id}
              </code>
              <br />
              <small style={{ color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>
                Copiá esta URL y configurala en el panel de 360dialog como tu webhook.
              </small>
            </div>
          </div>

          <div className="card" style={{ background: '#F8FAFC' }}>
            <div className="card-title">📋 Tu plan actual</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}>🚀</span>
              <div>
                <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{profile.plan || 'Basic'}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Activo desde {new Date(profile.created_at).toLocaleDateString('es-AR')}</div>
              </div>
            </div>
          </div>

          <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: 'auto', padding: '12px 32px' }}>
            {saving ? 'Guardando...' : '💾 Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  );
}
