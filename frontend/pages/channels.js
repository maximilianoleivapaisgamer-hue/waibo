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
  const [whatsappExpanded, setWhatsappExpanded] = useState(null); // 'cloud_api' | 'qr' | null
  const [qrStatus, setQrStatus] = useState(null);
  const [qrPolling, setQrPolling] = useState(null);

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
        if (res.data.whatsapp_mode === 'qr') setWhatsappExpanded('qr');
        else if (res.data.whatsapp_provider === 'cloud_api') setWhatsappExpanded('cloud_api');
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

  const startQR = async () => {
    try {
      await axios.post(`${API}/api/whatsapp-qr/connect`, {}, { headers: getHeaders() });
      setQrStatus({ status: 'starting', qr: null });
      const interval = setInterval(async () => {
        try {
          const res = await axios.get(`${API}/api/whatsapp-qr/status`, { headers: getHeaders() });
          setQrStatus(res.data);
          if (res.data.status === 'connected') {
            clearInterval(interval);
            setQrPolling(null);
            showSuccess('✅ WhatsApp conectado por QR');
            const meRes = await axios.get(`${API}/api/clients/me`, { headers: getHeaders() });
            setProfile(meRes.data);
          }
        } catch {}
      }, 3000);
      setQrPolling(interval);
      setTimeout(() => { clearInterval(interval); setQrPolling(null); }, 120000);
    } catch { showError('No se pudo iniciar la conexión QR. Verificá que el servicio esté activo.'); }
  };

  const disconnectQR = async () => {
    if (!confirm('¿Desconectar WhatsApp QR?')) return;
    if (qrPolling) { clearInterval(qrPolling); setQrPolling(null); }
    await axios.post(`${API}/api/whatsapp-qr/disconnect`, {}, { headers: getHeaders() });
    setQrStatus(null);
    const meRes = await axios.get(`${API}/api/clients/me`, { headers: getHeaders() });
    setProfile(meRes.data);
    showSuccess('WhatsApp QR desconectado');
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

  const isQRConnected = profile?.whatsapp_mode === 'qr';
  const isCloudAPIConnected = !!(profile?.whatsapp_api_key) && profile?.whatsapp_provider === 'cloud_api';
  const isConnected = isQRConnected || isCloudAPIConnected;
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
              background: isConnected ? '#EDE9FE' : '#FEF3C7',
              color: isConnected ? '#5B21B6' : '#92400E'
            }}>
              {isQRConnected ? '✅ WhatsApp Lite activo' : isCloudAPIConnected ? '✅ Cloud API activa' : '⚠️ Sin configurar'}
            </span>
          </div>

          {/* ── Opción 1: WhatsApp Lite (QR) ── */}
          <div style={{
            border: `2px solid ${whatsappExpanded === 'qr' ? '#F59E0B' : 'var(--border)'}`,
            borderRadius: 12, overflow: 'hidden', marginBottom: 12
          }}>
            <button
              onClick={() => setWhatsappExpanded(whatsappExpanded === 'qr' ? null : 'qr')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                background: whatsappExpanded === 'qr' ? '#FFFBEB' : 'var(--bg)',
                border: 'none', cursor: 'pointer', textAlign: 'left'
              }}
            >
              <span style={{ fontSize: 22 }}>📲</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  WhatsApp Lite (QR)
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>
                    ⚠️ Canal no oficial
                  </span>
                  {isQRConnected && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>
                      Activo
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Conectá tu número escaneando un QR · Sin trámites · Listo en segundos
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>{whatsappExpanded === 'qr' ? '▲' : '▼'}</span>
            </button>

            {whatsappExpanded === 'qr' && (
              <div style={{ padding: '0 16px 20px' }}>
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 12, margin: '14px 0', fontSize: 13, color: '#92400E' }}>
                  ⚠️ <strong>Canal no oficial.</strong> WhatsApp puede desconectar o bloquear el número en cualquier momento sin previo aviso, ya que esta modalidad no está avalada por Meta. Usala para empezar y testear mientras tramitás la Cloud API oficial. Tus conversaciones y la configuración del bot se conservan si después migrás.
                </div>

                {isQRConnected ? (
                  <div>
                    <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13 }}>
                      ✅ <strong>WhatsApp conectado por QR</strong> — el bot está activo en este número.
                    </div>
                    <button onClick={disconnectQR} className="btn btn-secondary" style={{ width: 'auto' }}>
                      🔌 Desconectar
                    </button>
                  </div>
                ) : qrStatus?.status === 'qr_ready' && qrStatus?.qr ? (
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <p style={{ fontSize: 13, marginBottom: 12 }}>
                      Abrí WhatsApp en tu celular → <strong>Configuración → Dispositivos vinculados → Vincular dispositivo</strong> y escaneá este código:
                    </p>
                    <img src={qrStatus.qr} alt="QR WhatsApp" style={{ width: 220, height: 220, borderRadius: 12, border: '2px solid var(--border)' }} />
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>El código expira en 60 segundos — si caduca, hacé clic en Conectar de nuevo.</p>
                  </div>
                ) : qrStatus?.status === 'starting' || qrStatus?.status === 'connecting' ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                    🔄 Generando código QR...
                  </div>
                ) : (
                  <button
                    onClick={startQR}
                    className="btn btn-primary"
                    style={{ width: 'auto', padding: '10px 20px', background: '#F59E0B', borderColor: '#F59E0B' }}
                  >
                    📲 Conectar por QR
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Opción 2: Cloud API (Oficial) ── */}
          <div style={{
            border: `2px solid ${whatsappExpanded === 'cloud_api' ? 'var(--green)' : 'var(--border)'}`,
            borderRadius: 12, overflow: 'hidden'
          }}>
            <button
              onClick={() => setWhatsappExpanded(whatsappExpanded === 'cloud_api' ? null : 'cloud_api')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                background: whatsappExpanded === 'cloud_api' ? '#F5F3FF' : 'var(--bg)',
                border: 'none', cursor: 'pointer', textAlign: 'left'
              }}
            >
              <span style={{ fontSize: 22 }}>🟢</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  WhatsApp Cloud API — Meta oficial
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#5B21B6', color: 'white', fontWeight: 600 }}>
                    ✅ Oficial
                  </span>
                  {isCloudAPIConnected && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>
                      Activo
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Gratis hasta 1.000 conversaciones/mes · Sin intermediarios · Estabilidad garantizada por Meta
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>{whatsappExpanded === 'cloud_api' ? '▲' : '▼'}</span>
            </button>

            {whatsappExpanded === 'cloud_api' && (
              <div style={{ padding: '0 16px 20px' }}>
                <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: 14, margin: '14px 0', fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, color: '#5B21B6' }}>📋 Cómo configurar — paso a paso</div>
                  <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
                    <li>Entrá a <strong>developers.facebook.com</strong> e iniciá sesión con tu cuenta de Facebook.</li>
                    <li>Necesitás una <strong>cuenta de Meta Business</strong>. Si no tenés, creala gratis en <strong>business.facebook.com</strong> → "Crear cuenta" → ingresá el nombre de tu empresa (ej: <em>"Panadería El Sol"</em>), tu nombre y tu email.</li>
                    <li>En developers.facebook.com → <strong>"Mis apps" → "Crear app"</strong>. Cuando te pregunte el tipo, elegí <strong>"Business"</strong>. Dale un nombre descriptivo (ej: <em>"Bot WhatsApp Mi Negocio"</em>) y seleccioná tu cuenta de Meta Business.</li>
                    <li>Dentro de la app, buscá el producto <strong>"WhatsApp"</strong> y hacé clic en <strong>"Configurar"</strong>. Aceptá las condiciones del servicio y seleccioná tu <strong>portfolio comercial</strong>. Hacé clic en <strong>"Continuar"</strong>.</li>
                    <li>Meta te da automáticamente un <strong>número de prueba gratuito</strong> — usalo primero para verificar que el bot funciona. Después agregás tu número real desde <strong>"Registra tu número de teléfono"</strong>.</li>
                    <li>En <strong>"Paso 1: Pruébalo"</strong>, vas a ver el <strong>Phone Number ID</strong> — copialo y pegalo en el campo de abajo.</li>
                    <li>Generá un <strong>token de acceso temporal</strong> (para testear) o, para producción, andá a <strong>Configuración → Usuarios del sistema</strong> y creá un token permanente con el permiso <code>whatsapp_business_messaging</code>.</li>
                    <li>Andá a <strong>"Paso 2: Configuración de producción" → "Configurar webhooks"</strong>. Pegá la URL del webhook de abajo, en el token de verificación escribí <code>whabot2024</code>, y hacé clic en <strong>"Verificar y guardar"</strong>. Después suscribite al evento <strong>messages</strong>.</li>
                  </ol>
                  <div style={{ marginTop: 10, padding: '8px 12px', background: '#EDE9FE', borderRadius: 8, fontSize: 12, color: '#5B21B6' }}>
                    💡 <strong>Empezá con el número de prueba.</strong> Meta te lo da gratis y podés mandar mensajes a hasta 5 números para testear. Cuando todo funcione, agregás tu número real.
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
    green: { background: '#EDE9FE', color: '#5B21B6' },
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
          <div key={f} style={{ fontSize: 13, background: '#F5F3FF', padding: '8px 12px', borderRadius: 8, border: '1px solid #DDD6FE' }}>
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
