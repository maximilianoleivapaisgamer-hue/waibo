import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import ChannelLogo from '../components/ChannelLogo';
import ConversationsPanel from '../components/ConversationsPanel';

const API = process.env.NEXT_PUBLIC_API_URL;
const FB_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID;

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
  const [embeddedSignupLoading, setEmbeddedSignupLoading] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [pendingWaba, setPendingWaba] = useState(null); // { phone_number_id, waba_id }
  const [askPhone, setAskPhone] = useState(false); // pedir al usuario su número para identificarlo
  const [phoneInput, setPhoneInput] = useState('');
  const wabaDataRef = useRef({});

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };
  const showError = (msg) => { setError(msg); setTimeout(() => setError(''), 4000); };

  // Cargar el SDK de Facebook para Embedded Signup
  useEffect(() => {
    if (!FB_APP_ID) return;
    if (document.getElementById('facebook-jssdk')) {
      if (window.FB) window.FB.init({ appId: FB_APP_ID, version: 'v21.0', xfbml: false, cookie: false });
      return;
    }
    window.fbAsyncInit = function () {
      window.FB.init({ appId: FB_APP_ID, version: 'v21.0', xfbml: false, cookie: false });
    };
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/es_LA/sdk.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // Listen for WABA data sent by the Embedded Signup popup
  useEffect(() => {
    const handler = (event) => {
      if (typeof event.data !== 'object' || event.data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (event.data.event === 'FINISH') {
        wabaDataRef.current = {
          phone_number_id: event.data.data?.phone_number_id,
          waba_id: event.data.data?.waba_id
        };
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/login'); return; }

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
      .catch(err => { if (err.response?.status === 401) router.push('/login'); });

    axios.get(`${API}/api/tiendanube/status`, { headers: getHeaders() })
      .then(res => setTiendanube(res.data))
      .catch(() => setTiendanube({ connected: false }));
  }, []);

  const launchEmbeddedSignup = () => {
    if (!FB_APP_ID || !META_CONFIG_ID) { showError('Configuración de Meta no encontrada.'); return; }
    wabaDataRef.current = {};
    let connected = false;

    const connectToWaibo = ({ waba_id, phone_number_id } = {}) => {
      if (connected) return;
      connected = true;
      setEmbeddedSignupLoading(true);
      axios.post(`${API}/api/whatsapp/embedded-signup`,
        { ...(waba_id && { waba_id }), ...(phone_number_id && { phone_number_id }) },
        { headers: getHeaders() })
        .then(res => {
          if (res.data?.needs_phone) {
            // Hay varios números en el portfolio — pedimos el suyo para identificarlo
            setAskPhone(true);
            return null;
          }
          return axios.get(`${API}/api/clients/me`, { headers: getHeaders() });
        })
        .then(meRes => {
          if (meRes) { setProfile(meRes.data); showSuccess('✅ WhatsApp conectado correctamente'); }
        })
        .catch(err => { connected = false; showError(err.response?.data?.error || 'Error conectando WhatsApp. Intentá de nuevo.'); })
        .finally(() => setEmbeddedSignupLoading(false));
    };

    const onMessage = (event) => {
      if (typeof event.data !== 'object' || event.data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      console.log('[WA_EMBEDDED_SIGNUP]', JSON.stringify(event.data));
      if (event.data.event === 'FINISH') {
        window.removeEventListener('message', onMessage);
        clearInterval(pollClosed);
        connectToWaibo(event.data.data || {});
      }
    };
    window.addEventListener('message', onMessage);

    const extras = encodeURIComponent(JSON.stringify({ sessionInfoVersion: '3', version: 'v4' }));
    const url = `https://business.facebook.com/messaging/whatsapp/onboard/?app_id=${FB_APP_ID}&config_id=${META_CONFIG_ID}&extras=${extras}`;
    const width = 600, height = 700;
    const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
    const popup = window.open(url, 'WaiboEmbeddedSignup', `width=${width},height=${height},left=${left},top=${top}`);

    // fallback: si el popup se cierra sin postMessage, igual intentamos conectar
    const pollClosed = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(pollClosed);
        window.removeEventListener('message', onMessage);
        connectToWaibo(wabaDataRef.current);
      }
    }, 500);
  };

  const submitPhoneNumber = async () => {
    if (!phoneInput.trim()) { showError('Ingresá tu número de WhatsApp.'); return; }
    setEmbeddedSignupLoading(true);
    try {
      await axios.post(`${API}/api/whatsapp/embedded-signup`,
        { phone_number: phoneInput.trim() },
        { headers: getHeaders() });
      const meRes = await axios.get(`${API}/api/clients/me`, { headers: getHeaders() });
      setProfile(meRes.data);
      setAskPhone(false);
      setPhoneInput('');
      showSuccess('✅ WhatsApp conectado correctamente');
    } catch (err) {
      showError(err.response?.data?.error || 'Error conectando WhatsApp. Intentá de nuevo.');
    } finally {
      setEmbeddedSignupLoading(false);
    }
  };

  const disconnectCloudAPI = async () => {
    if (!confirm('¿Desconectar WhatsApp Cloud API?')) return;
    try {
      await axios.delete(`${API}/api/whatsapp/disconnect`, { headers: getHeaders() });
      const meRes = await axios.get(`${API}/api/clients/me`, { headers: getHeaders() });
      setProfile(meRes.data);
      showSuccess('WhatsApp Cloud API desconectado');
    } catch {
      showError('Error al desconectar. Intentá de nuevo.');
    }
  };

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
    try {
      await axios.delete(`${API}/api/${channel}/disconnect`, { headers: getHeaders() });
      setter({ connected: false });
      showSuccess(`${channel} desconectado`);
    } catch {
      showError(`Error al desconectar ${channel}. Intentá de nuevo.`);
    }
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
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ChannelLogo channel="whatsapp" size={28} /> WhatsApp</h1>
          <p>{isConnected ? 'Tus conversaciones de WhatsApp — la configuración está abajo de todo' : 'Conectá tu número de WhatsApp al bot'}</p>
        </div>

        {success && <div className="success-msg">{success}</div>}
        {error && <div className="error-msg">{error}</div>}

        {/* ──────────────── CONVERSACIONES (si está conectado) ──────────────── */}
        {isConnected && (
          <div style={{ marginBottom: 24 }}>
            <ConversationsPanel channel="whatsapp" />
          </div>
        )}

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

          {/* ── Opción 1: Cloud API (Oficial) ── */}
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
                {isCloudAPIConnected ? (
                  <div>
                    <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: 14, margin: '14px 0', fontSize: 13 }}>
                      <div style={{ fontWeight: 700, color: '#5B21B6', marginBottom: 6 }}>✅ WhatsApp Cloud API conectado</div>
                      {profile.whatsapp_phone_id && (
                        <div style={{ color: 'var(--text-muted)' }}>Phone Number ID: <code style={{ background: '#EDE9FE', padding: '2px 6px', borderRadius: 4 }}>{profile.whatsapp_phone_id}</code></div>
                      )}
                      {profile.waba_id && (
                        <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>WABA ID: <code style={{ background: '#EDE9FE', padding: '2px 6px', borderRadius: 4 }}>{profile.waba_id}</code></div>
                      )}
                    </div>
                    <button onClick={disconnectCloudAPI} className="btn btn-secondary" style={{ width: 'auto' }}>
                      🔌 Desconectar
                    </button>
                  </div>
                ) : (
                  <div>
                    {embeddedSignupLoading && (
                      <div style={{ background: '#FFF7ED', border: '2px solid #FB923C', borderRadius: 10, padding: 16, margin: '14px 0', textAlign: 'center', color: '#C2410C', fontWeight: 600 }}>
                        ⏳ Conectando tu WhatsApp con Waibo...
                      </div>
                    )}

                    {/* Primary: Embedded Signup */}
                    {FB_APP_ID && META_CONFIG_ID ? (
                      <div style={{ margin: '14px 0' }}>
                        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
                          <div style={{ fontWeight: 700, color: '#15803D', marginBottom: 6 }}>✨ Conectá en 2 minutos sin configuración técnica</div>
                          <p style={{ margin: '0 0 10px', color: '#166534' }}>
                            Hacé clic en el botón y seguí los pasos de Meta. En el paso de <strong>"Cuenta de WhatsApp Business"</strong> vas a ver dos opciones:
                          </p>
                          <ul style={{ margin: '0 0 4px', paddingLeft: 20, color: '#166534', fontSize: 13, lineHeight: 1.7 }}>
                            <li><strong>Si ya tenés WhatsApp Business instalado en el celular</strong> → elegí <em>"Conecta una app de WhatsApp Business"</em></li>
                            <li><strong>Si no tenés WhatsApp Business</strong> → elegí <em>"Crear una cuenta de WhatsApp Business"</em></li>
                          </ul>
                        </div>
                        <button
                          onClick={launchEmbeddedSignup}
                          disabled={embeddedSignupLoading}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 10,
                            padding: '12px 24px', borderRadius: 8, border: 'none', cursor: embeddedSignupLoading ? 'not-allowed' : 'pointer',
                            background: embeddedSignupLoading ? '#9CA3AF' : '#1877F2', color: 'white',
                            fontWeight: 700, fontSize: 15
                          }}
                        >
                          {embeddedSignupLoading ? (
                            '⏳ Conectando...'
                          ) : (
                            <>
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.99 3.66 9.12 8.44 9.88V14.89H7.9v-2.89h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.89h-2.34v6.99C18.34 21.12 22 17 22 12c0-5.52-4.48-10-10-10z"/></svg>
                              Conectar con Meta
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: 14, margin: '14px 0', fontSize: 13, color: '#92400E' }}>
                        ⚠️ <strong>Configuración pendiente:</strong> Para habilitar el botón de conexión directa con Meta, hay que agregar las variables <code>NEXT_PUBLIC_FACEBOOK_APP_ID</code> y <code>NEXT_PUBLIC_META_CONFIG_ID</code> en Vercel. Mientras tanto podés usar la configuración manual de abajo.
                      </div>
                    )}

                    {/* Confirmación de número: el cliente escribe el suyo y lo verificamos */}
                    {askPhone && (
                      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 16, margin: '14px 0' }}>
                        <div style={{ fontWeight: 700, color: '#1D4ED8', marginBottom: 8, fontSize: 14 }}>
                          📱 Confirmá tu número de WhatsApp
                        </div>
                        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#1E40AF' }}>
                          Escribí el número que acabás de vincular con Meta (con código de país y área):
                        </p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input
                            type="tel"
                            value={phoneInput}
                            onChange={e => setPhoneInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') submitPhoneNumber(); }}
                            placeholder="+54 9 11 1234-5678"
                            style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 8, border: '1px solid #93C5FD', fontSize: 14 }}
                          />
                          <button
                            onClick={submitPhoneNumber}
                            disabled={embeddedSignupLoading}
                            style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: embeddedSignupLoading ? '#9CA3AF' : '#1877F2', color: 'white', fontWeight: 700, fontSize: 14, cursor: embeddedSignupLoading ? 'not-allowed' : 'pointer' }}
                          >
                            {embeddedSignupLoading ? '⏳ Verificando...' : 'Conectar'}
                          </button>
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#6B7280' }}>
                          💡 Si lo acabás de vincular y no lo encuentra, esperá un minuto y volvé a intentar — Meta tarda un poco en registrarlo.
                        </p>
                        <button
                          onClick={() => { setAskPhone(false); setPhoneInput(''); }}
                          style={{ marginTop: 10, background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}

                    {/* Problemas frecuentes */}
                    <details style={{ margin: '20px 0 4px', fontSize: 13 }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-muted)', userSelect: 'none' }}>
                        ¿Tuviste algún problema? Ver soluciones frecuentes
                      </summary>
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                          {
                            error: '🔴 "Tu número ya está vinculado a eventos automáticos"',
                            fix: 'Abrí WhatsApp Business en tu celular → Herramientas empresariales → Etiquetas → desactivá las etiquetas automáticas. Después reiniciá el proceso.',
                          },
                          {
                            error: '🔴 El popup se cierra solo sin completar',
                            fix: 'Asegurate de que el navegador no esté bloqueando popups. En la barra de dirección aparece un ícono de popup bloqueado — permitilo y volvé a hacer clic en "Conectar con Meta".',
                          },
                          {
                            error: '🔴 "Este número ya existe en otra cuenta de WhatsApp Business"',
                            fix: 'El número ya está registrado en una WABA diferente. Entrá a business.facebook.com, buscá ese número en Cuentas de WhatsApp Business y transferilo a tu negocio actual, o usá un número diferente.',
                          },
                          {
                            error: '🔴 Me pide crear una cuenta nueva de WhatsApp y eliminar la existente',
                            fix: 'En el paso de selección de número, elegí la opción "Usar un número existente" en lugar de crear uno nuevo. Si Meta no lo muestra, asegurate de haber iniciado sesión con el Facebook del negocio correcto.',
                          },
                          {
                            error: '🔴 El proceso termina pero el banner de autorización no aparece',
                            fix: 'Hacé clic en "Conectar con Meta" otra vez. Si el proceso ya se completó en Meta, el botón "Autorizar acceso a Waibo" debería aparecer al cerrar el popup.',
                          },
                          {
                            error: '🔴 Sale error al hacer clic en "Autorizar acceso a Waibo"',
                            fix: 'Cerrá el banner con "Cancelar" y volvé a hacer clic en "Conectar con Meta" para reiniciar el proceso desde el principio.',
                          },
                        ].map((item, i) => (
                          <div key={i} style={{ background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>{item.error}</div>
                            <div style={{ color: '#6B7280' }}>→ {item.fix}</div>
                          </div>
                        ))}
                      </div>
                    </details>

                    {/* Separator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 12px' }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      <button
                        onClick={() => setShowManualForm(!showManualForm)}
                        style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {showManualForm ? 'Ocultar configuración manual' : '⚙️ Configuración manual (avanzado)'}
                      </button>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    </div>

                    {showManualForm && (
                      <form onSubmit={handleSaveCloudAPI}>
                        <div className="form-group">
                          <label>Phone Number ID</label>
                          <input
                            placeholder="Ej: 123456789012345"
                            value={profile.whatsapp_phone_id || ''}
                            onChange={e => setProfile({ ...profile, whatsapp_phone_id: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Access Token</label>
                          <input
                            type="password"
                            placeholder="Tu token de acceso permanente"
                            value={profile.whatsapp_api_key || ''}
                            onChange={e => setProfile({ ...profile, whatsapp_api_key: e.target.value })}
                          />
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
                          {saving ? 'Guardando...' : '💾 Guardar configuración'}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Opción 2: WhatsApp Lite (QR) ── */}
          <div style={{
            border: `2px solid ${whatsappExpanded === 'qr' ? '#F59E0B' : 'var(--border)'}`,
            borderRadius: 12, overflow: 'hidden', marginTop: 12
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
        </div>
        {/* ──────────────── FIN WHATSAPP ──────────────── */}
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
