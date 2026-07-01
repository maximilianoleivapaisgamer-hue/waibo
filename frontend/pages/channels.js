import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Channels() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [tiendanube, setTiendanube] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [whatsappExpanded, setWhatsappExpanded] = useState(null); // 'cloud_api' | '360dialog' | null

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };
  const showError = (msg) => { setError(msg); setTimeout(() => setError(''), 4000); };

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/'); return; }

    const params = new URLSearchParams(window.location.search);
    if (params.get('tn_connected')) showSuccess(`✅ Tiendanube conectada: ${params.get('store')}`);
    if (params.get('tt_connected')) showSuccess(`✅ TikTok conectado: @${params.get('user')}`);
    if (params.get('tn_error') || params.get('tt_error')) showError('Error en la conexión. Intentá de nuevo.');
    if (params.toString()) window.history.replaceState({}, '', '/channels');

    axios.get(`${API}/api/clients/me`, { headers: getHeaders() })
      .then(res => {
        setProfile(res.data);
        if (res.data.whatsapp_provider) setWhatsappExpanded(res.data.whatsapp_provider);
      })
      .catch(err => { if (err.response?.status === 401) router.push('/'); });

    axios.get(`${API}/api/tiendanube/status`, { headers: getHeaders() })
      .then(res => setTiendanube(res.data))
      .catch(() => setTiendanube({ connected: false }));
  }, []);

  const handleSaveCloudAPI = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API}/api/clients/me`, {
        whatsapp_api_key: profile.whatsapp_api_key,
        whatsapp_phone_id: profile.whatsapp_phone_id,
        whatsapp_provider: 'cloud_api'
      }, { headers: getHeaders() });
      setProfile({ ...profile, whatsapp_provider: 'cloud_api' });
      showSuccess('✅ WhatsApp Cloud API configurado correctamente');
    } catch { showError('Error guardando. Verificá los datos e intentá de nuevo.'); }
    finally { setSaving(false); }
  };

  const handleSave360 = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API}/api/clients/me`, {
        whatsapp_api_key: profile.whatsapp_api_key,
        whatsapp_provider: '360dialog'
      }, { headers: getHeaders() });
      setProfile({ ...profile, whatsapp_provider: '360dialog' });
      showSuccess('✅ 360dialog configurado correctamente');
    } catch { showError('Error guardando. Verificá los datos e intentá de nuevo.'); }
    finally { setSaving(false); }
  };

  const connectChannel = async (channel) => {
    try {
      const res = await axios.get(`${API}/api/${channel}/connect`, { headers: getHeaders() });
      window.location.href = res.data.url;
    } catch { showError(`Error conectando ${channel}`); }
  };

  const disconnectChannel = async (channel, setter) => {
    if (!confirm(`¿Desconectar ${channel}?`)) return;
    await axios.delete(`${API}/api/${channel}/disconnect`, { headers: getHeaders() });
    setter({ connected: false });
    showSuccess(`${channel} desconectado`);
  };

  const syncTiendanube = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API}/api/tiendanube/sync`, {}, { headers: getHeaders() });
      showSuccess(`✅ ${res.data.synced} productos sincronizados`);
      const tnRes = await axios.get(`${API}/api/tiendanube/status`, { headers: getHeaders() });
      setTiendanube(tnRes.data);
    } catch { showError('Error sincronizando productos'); }
    finally { setSyncing(false); }
  };

  const isConnected = !!(profile?.whatsapp_api_key);
  const webhookUrl = `${API}/webhook/whatsapp/${profile?.id}`;

  if (!profile) return (
    <div className="dashboard">
      <Sidebar active="channels" />
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando canales...</p>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      <Sidebar active="channels" />
      <div className="main-content">
        <div className="page-header">
          <h1>📱 Canales</h1>
          <p>Conectá WhatsApp y Tiendanube — Instagram y Mercado Libre tienen su propia sección en el menú</p>
        </div>

        {success && <div className="success-msg">{success}</div>}
        {error && <div className="error-msg">{error}</div>}

        {/* ──────────────── WHATSAPP ──────────────── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 32 }}>📱</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>WhatsApp Business</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Elegí cómo conectar tu número de WhatsApp al bot</div>
            </div>
            <span style={{
              fontSize: 12, padding: '4px 14px', borderRadius: 20, fontWeight: 500,
              background: isConnected ? '#DCFCE7' : '#FEF3C7',
              color: isConnected ? '#15803D' : '#92400E'
            }}>
              {isConnected
                ? (profile.whatsapp_provider === 'cloud_api' ? '✅ Cloud API activa' : '✅ 360dialog activo')
                : '⚠️ Sin configurar'}
            </span>
          </div>

          {/* ── Opción 1: Cloud API (Recomendado) ── */}
          <div style={{
            border: `2px solid ${whatsappExpanded === 'cloud_api' ? 'var(--green)' : 'var(--border)'}`,
            borderRadius: 12, marginBottom: 12, overflow: 'hidden'
          }}>
            <button
              onClick={() => setWhatsappExpanded(whatsappExpanded === 'cloud_api' ? null : 'cloud_api')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                background: whatsappExpanded === 'cloud_api' ? '#F0FDF4' : 'var(--bg)',
                border: 'none', cursor: 'pointer', textAlign: 'left'
              }}
            >
              <span style={{ fontSize: 22 }}>🟢</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  WhatsApp Cloud API — Meta directo
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#15803D', color: 'white', fontWeight: 600 }}>
                    ✅ Recomendado
                  </span>
                  {profile.whatsapp_provider === 'cloud_api' && isConnected && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#DCFCE7', color: '#15803D', fontWeight: 600 }}>
                      Activo
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Gratis hasta 1.000 conversaciones/mes · Sin intermediarios · La opción oficial de Meta
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>{whatsappExpanded === 'cloud_api' ? '▲' : '▼'}</span>
            </button>

            {whatsappExpanded === 'cloud_api' && (
              <div style={{ padding: '0 16px 20px' }}>
                {/* Instrucciones */}
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: 14, margin: '14px 0', fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, color: '#15803D' }}>📋 Cómo configurar — paso a paso</div>
                  <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
                    <li>Entrá a <strong>developers.facebook.com</strong> e iniciá sesión con tu cuenta de Facebook.</li>
                    <li>Creá una nueva app → elegí tipo <strong>"Business"</strong> → dale un nombre.</li>
                    <li>Dentro de la app, buscá el producto <strong>"WhatsApp"</strong> y hacé clic en <strong>"Configurar"</strong>.</li>
                    <li>En el panel de WhatsApp, vas a ver tu <strong>Phone Number ID</strong> — copialo y pegalo abajo.</li>
                    <li>Creá un <strong>Token de acceso permanente</strong>: andá a Configuración → Avanzada → Token de acceso de sistema, o desde el panel de WhatsApp → generá un token con permisos <code>whatsapp_business_messaging</code>.</li>
                    <li>Pegá ese token en el campo <strong>"Access Token"</strong> de abajo.</li>
                    <li>En la sección <strong>Webhooks</strong> de tu app, configurá la URL de webhook que aparece más abajo y el token de verificación: <code>whabot2024</code>.</li>
                    <li>Suscribite al evento <strong>messages</strong> y ¡listo!</li>
                  </ol>
                  <div style={{ marginTop: 10, padding: '8px 12px', background: '#DCFCE7', borderRadius: 8, fontSize: 12, color: '#166534' }}>
                    💡 <strong>Meta aprueba números de forma gratuita.</strong> Primero podés usar el número de prueba que te da Meta para testear, y después agregás tu número real.
                  </div>
                </div>

                <form onSubmit={handleSaveCloudAPI}>
                  <div className="form-group">
                    <label>Phone Number ID</label>
                    <input
                      placeholder="Ej: 123456789012345"
                      value={profile.whatsapp_phone_id || ''}
                      onChange={e => setProfile({ ...profile, whatsapp_phone_id: e.target.value })}
                    />
                    <small style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lo encontrás en tu app de Meta → WhatsApp → Panel.</small>
                  </div>
                  <div className="form-group">
                    <label>Access Token (Token de acceso)</label>
                    <input
                      type="password"
                      placeholder="Tu token de acceso de WhatsApp"
                      value={profile.whatsapp_api_key || ''}
                      onChange={e => setProfile({ ...profile, whatsapp_api_key: e.target.value })}
                    />
                    <small style={{ fontSize: 12, color: 'var(--text-muted)' }}>El token permanente que generaste en tu app de Meta.</small>
                  </div>

                  <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 }}>
                    <strong>🔗 URL de Webhook para Meta:</strong>
                    <code style={{ display: 'block', marginTop: 6, padding: '6px 10px', background: 'white', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', wordBreak: 'break-all' }}>
                      {webhookUrl}
                    </code>
                    <div style={{ marginTop: 8, fontSize: 12, color: '#1D4ED8' }}>
                      Token de verificación: <code style={{ background: 'white', padding: '2px 6px', borderRadius: 4, border: '1px solid #BFDBFE' }}>whabot2024</code>
                    </div>
                  </div>

                  <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: 'auto', padding: '10px 24px' }}>
                    {saving ? 'Guardando...' : '💾 Guardar configuración Cloud API'}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* ── Opción 2: 360dialog ── */}
          <div style={{
            border: `2px solid ${whatsappExpanded === '360dialog' ? '#6366F1' : 'var(--border)'}`,
            borderRadius: 12, overflow: 'hidden'
          }}>
            <button
              onClick={() => setWhatsappExpanded(whatsappExpanded === '360dialog' ? null : '360dialog')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                background: whatsappExpanded === '360dialog' ? '#EEF2FF' : 'var(--bg)',
                border: 'none', cursor: 'pointer', textAlign: 'left'
              }}
            >
              <span style={{ fontSize: 22 }}>🔵</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  360dialog
                  {profile.whatsapp_provider === '360dialog' && isConnected && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#EEF2FF', color: '#4338CA', fontWeight: 600 }}>
                      Activo
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Intermediario oficial de WhatsApp · ~$8 USD/mes por número · Setup más rápido
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>{whatsappExpanded === '360dialog' ? '▲' : '▼'}</span>
            </button>

            {whatsappExpanded === '360dialog' && (
              <div style={{ padding: '0 16px 20px' }}>
                {/* Instrucciones */}
                <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 10, padding: 14, margin: '14px 0', fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, color: '#4338CA' }}>📋 Cómo configurar — paso a paso</div>
                  <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
                    <li>Entrá a <strong>360dialog.com</strong> y creá una cuenta.</li>
                    <li>Registrá tu número de WhatsApp Business siguiendo su proceso de verificación (necesitás una cuenta de Meta Business y verificar el número).</li>
                    <li>Una vez aprobado, andá a <strong>Panel → Integrations → API Keys</strong> y generá una API Key.</li>
                    <li>Copiá esa API Key y pegala en el campo de abajo.</li>
                    <li>En el panel de 360dialog, configurá el <strong>Webhook URL</strong> que aparece más abajo para que los mensajes lleguen a tu bot.</li>
                  </ol>
                  <div style={{ marginTop: 10, padding: '8px 12px', background: '#E0E7FF', borderRadius: 8, fontSize: 12, color: '#3730A3' }}>
                    💡 <strong>Costo aproximado:</strong> ~$8 USD/mes por número. El proceso de aprobación suele tardar 1-3 días hábiles.
                  </div>
                </div>

                <form onSubmit={handleSave360}>
                  <div className="form-group">
                    <label>API Key de 360dialog</label>
                    <input
                      type="password"
                      placeholder="Tu clave de 360dialog"
                      value={profile.whatsapp_api_key || ''}
                      onChange={e => setProfile({ ...profile, whatsapp_api_key: e.target.value })}
                    />
                    <small style={{ fontSize: 12, color: 'var(--text-muted)' }}>La encontrás en 360dialog → Panel → Integrations → API Keys.</small>
                  </div>

                  <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 }}>
                    <strong>🔗 URL de Webhook para 360dialog:</strong>
                    <code style={{ display: 'block', marginTop: 6, padding: '6px 10px', background: 'white', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', wordBreak: 'break-all' }}>
                      {webhookUrl}
                    </code>
                    <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: 6 }}>Copiá esta URL y configurala en el panel de 360dialog como tu webhook.</small>
                  </div>

                  <button className="btn btn-primary" type="submit" disabled={saving}
                    style={{ width: 'auto', padding: '10px 24px', background: '#6366F1', borderColor: '#6366F1' }}>
                    {saving ? 'Guardando...' : '💾 Guardar configuración 360dialog'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
        {/* ──────────────── FIN WHATSAPP ──────────────── */}

        <ChannelCard
          icon="🏪" title="Tiendanube" subtitle="Sincroniza catálogo y genera links de compra directa"
          connected={tiendanube?.connected}
          badge={tiendanube?.connected ? `✅ ${tiendanube.store_name}` : '⬜ Sin conectar'}
          badgeColor={tiendanube?.connected ? 'green' : 'gray'}
        >
          {tiendanube?.connected ? (
            <ConnectedInfo features={[
              `${tiendanube.product_count || 0} productos sincronizados`,
              'El bot consulta stock en tiempo real',
              'Genera links de checkout directo',
              'Se actualiza solo cuando cambian precios'
            ]}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <button
                  onClick={syncTiendanube}
                  className="btn btn-primary"
                  disabled={syncing}
                  style={{ width: 'auto', padding: '10px 20px' }}
                >
                  {syncing ? '🔄 Sincronizando...' : '🔄 Sincronizar productos'}
                </button>
                <button
                  onClick={() => router.push('/catalog')}
                  className="btn btn-secondary"
                  style={{ width: 'auto' }}
                >
                  👁 Ver catálogo
                </button>
                <button onClick={() => disconnectChannel('tiendanube', setTiendanube)} className="btn btn-secondary" style={{ width: 'auto' }}>
                  🔌 Desconectar
                </button>
              </div>
            </ConnectedInfo>
          ) : (
            <ConnectPrompt
              features={[
                'Catálogo sincronizado automáticamente',
                'El bot responde con precios reales',
                'Links de checkout directo por WhatsApp',
                'Stock actualizado sin intervención manual'
              ]}
              onConnect={() => connectChannel('tiendanube')}
              label="🏪 Conectar Tiendanube"
              note="Necesitás una tienda activa en Tiendanube."
            />
          )}
        </ChannelCard>

        <div className="card" style={{ opacity: 0.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>🎵</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>TikTok DMs</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Próximamente — Fase 4</div>
            </div>
            <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: '#F3F4F6', color: '#6B7280' }}>🔜 Próximamente</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelCard({ icon, title, subtitle, connected, badge, badgeColor, children }) {
  const badgeStyles = {
    green: { background: '#DCFCE7', color: '#15803D' },
    amber: { background: '#FEF3C7', color: '#92400E' },
    gray:  { background: '#F3F4F6', color: '#6B7280' },
  };
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 32 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{subtitle}</div>
        </div>
        <span style={{ fontSize: 12, padding: '4px 14px', borderRadius: 20, fontWeight: 500, flexShrink: 0, ...badgeStyles[badgeColor] }}>
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function ConnectedInfo({ features, children }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
        {features.map(f => (
          <div key={f} style={{ fontSize: 13, background: '#F0FDF4', padding: '8px 12px', borderRadius: 8, border: '1px solid #BBF7D0' }}>
            ✅ {f}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

function ConnectPrompt({ features, onConnect, label, note }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {features.map(f => (
          <span key={f} style={{ fontSize: 12, background: '#F3F4F6', padding: '4px 10px', borderRadius: 20 }}>✨ {f}</span>
        ))}
      </div>
      <button onClick={onConnect} className="btn btn-primary" style={{ width: 'auto', padding: '10px 24px' }}>
        {label}
      </button>
      {note && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{note}</p>}
    </div>
  );
}
