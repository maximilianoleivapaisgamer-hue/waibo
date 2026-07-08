import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Config() {
  const router = useRouter();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/login'); return; }

    axios.get(`${API}/api/bot/config`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      setConfig(res.data);
    }).catch(err => {
      if (err.response?.status === 401) router.push('/login');
      else setError('Error al cargar la configuración. Recargá la página.');
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccess('');
    setError('');
    const token = localStorage.getItem('whabot_token');
    try {
      await axios.put(`${API}/api/bot/config`, config, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess('¡Configuración guardada correctamente!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Error al guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) return (
    <div className="dashboard">
      <Sidebar active="config" />
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando configuración...</p>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      <Sidebar active="config" />
      <div className="main-content">
        <div className="page-header">
          <h1>⚙️ Configurar bot</h1>
          <p>Personalizá cómo responde tu asistente de WhatsApp</p>
        </div>

        <form onSubmit={handleSave}>
          {success && <div className="success-msg">✅ {success}</div>}
          {error && <div className="error-msg">{error}</div>}

          <div className="card">
            <div className="card-title">🏪 Información del negocio</div>
            <div className="form-group">
              <label>Descripción del negocio</label>
              <textarea
                style={{ minHeight: 140 }}
                placeholder="Ej: Somos una pizzería en Buenos Aires abierta de lunes a sábado de 11hs a 23hs. Vendemos pizzas, empanadas y bebidas. Hacemos delivery a Palermo, Villa Crespo y Almagro. Nuestro teléfono es 11-1234-5678."
                value={config.business_info || ''}
                onChange={e => setConfig({ ...config, business_info: e.target.value })}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                💡 Cuanta más info pongas, mejor responderá el bot. Incluí horarios, precios, zona de cobertura, etc.
              </small>
            </div>
          </div>

          <div className="card">
            <div className="card-title">🎭 Personalidad del bot</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Nombre del bot</label>
                <input
                  placeholder="Asistente, Mati, Sofia..."
                  value={config.bot_name || ''}
                  onChange={e => setConfig({ ...config, bot_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Tono de voz</label>
                <select
                  value={config.bot_tone || 'amigable'}
                  onChange={e => {
                    const defaults = {
                      amigable: 'Usá un tono amigable, cálido y cercano. Usá voseo argentino.',
                      profesional: 'Usá un tono profesional y formal, pero sin ser frío.',
                      vendedor: 'Sos un vendedor experto, persuasivo y enfocado en el cierre. Rebatí objeciones con seguridad.',
                      casual: 'Sé muy casual y relajado, como si hablaras con un amigo. Podés usar emojis con frecuencia.',
                    };
                    setConfig({ ...config, bot_tone: e.target.value, bot_tone_custom: config.bot_tone_custom || defaults[e.target.value] });
                  }}
                >
                  <option value="amigable">😊 Amigable (voseo argentino)</option>
                  <option value="profesional">💼 Profesional y formal</option>
                  <option value="vendedor">🔥 Vendedor agresivo (cierre)</option>
                  <option value="casual">😎 Casual y relajado</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 8 }}>
              <label>Instrucciones de tono personalizadas</label>
              <textarea
                style={{ minHeight: 80 }}
                placeholder={(() => {
                  const defaults = {
                    amigable: 'Usá un tono amigable, cálido y cercano. Usá voseo argentino.',
                    profesional: 'Usá un tono profesional y formal, pero sin ser frío.',
                    vendedor: 'Sos un vendedor experto, persuasivo y enfocado en el cierre. Rebatí objeciones con seguridad.',
                    casual: 'Sé muy casual y relajado, como si hablaras con un amigo. Podés usar emojis con frecuencia.',
                  };
                  return defaults[config.bot_tone || 'amigable'];
                })()}
                value={config.bot_tone_custom || ''}
                onChange={e => setConfig({ ...config, bot_tone_custom: e.target.value })}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Podés editar o reemplazar las instrucciones del preset seleccionado. Si lo dejás vacío, se usa el comportamiento por defecto del tono elegido.
              </small>
            </div>
            <div className="form-group">
              <label>Instrucciones adicionales para la IA</label>
              <textarea
                style={{ minHeight: 120 }}
                placeholder="Ej: Siempre ofrecé la promo del mes. Si preguntan por delivery, pedí la dirección. Ofrecé 10% descuento si mencionan Instagram."
                value={config.system_prompt || ''}
                onChange={e => setConfig({ ...config, system_prompt: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="checkbox"
                id="voice"
                checked={config.voice_enabled ?? true}
                onChange={e => setConfig({ ...config, voice_enabled: e.target.checked })}
                style={{ width: 'auto' }}
              />
              <label htmlFor="voice" style={{ marginBottom: 0 }}>
                🎙️ Transcribir notas de voz automáticamente (requiere OpenAI API Key)
              </label>
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Mensaje de bienvenida</label>
              <input
                placeholder="¡Hola! ¿En qué puedo ayudarte hoy?"
                value={config.welcome_message || ''}
                onChange={e => setConfig({ ...config, welcome_message: e.target.value })}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Se envía automáticamente cuando alguien escribe por primera vez.
              </small>
            </div>
          </div>

          <div className="card">
            <div className="card-title">🤖 Modelo de IA</div>
            <div className="form-group">
              <label>Modelo de IA</label>
              <select
                value={config.ai_model || 'claude-haiku-4-5-20251001'}
                onChange={e => setConfig({ ...config, ai_model: e.target.value })}
              >
                <option value="claude-haiku-4-5-20251001">⚡ Rápido y económico (recomendado)</option>
                <option value="claude-sonnet-4-6">🧠 Avanzado (mejor para casos complejos, mayor costo)</option>
              </select>
              <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                El modelo avanzado entiende mejor objeciones complejas y conversaciones largas, pero cuesta más por mensaje. Para la mayoría de los negocios, la opción económica funciona perfecto.
              </small>
            </div>
          </div>

          <div className="card">
            <div className="card-title">🕐 Horario de atención</div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="checkbox"
                id="business_hours"
                checked={config.business_hours_enabled ?? false}
                onChange={e => setConfig({ ...config, business_hours_enabled: e.target.checked })}
                style={{ width: 'auto' }}
              />
              <label htmlFor="business_hours" style={{ marginBottom: 0 }}>
                Activar horario de atención (fuera de este horario, el bot avisa que va a responder más tarde en vez de seguir vendiendo)
              </label>
            </div>

            {config.business_hours_enabled && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
                  <div className="form-group">
                    <label>Atendemos desde</label>
                    <select
                      value={config.business_hours_start ?? 9}
                      onChange={e => setConfig({ ...config, business_hours_start: parseInt(e.target.value) })}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{h}:00 hs</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Hasta</label>
                    <select
                      value={config.business_hours_end ?? 21}
                      onChange={e => setConfig({ ...config, business_hours_end: parseInt(e.target.value) })}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{h}:00 hs</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Días de atención</label>
                  <input
                    value={config.business_hours_days || ''}
                    onChange={e => setConfig({ ...config, business_hours_days: e.target.value })}
                    placeholder="lunes,martes,miercoles,jueves,viernes,sabado"
                  />
                  <small style={{ fontSize: 12, color: 'var(--text-muted)' }}>Separados por coma, en minúsculas sin tildes.</small>
                </div>
                <div className="form-group">
                  <label>Mensaje fuera de horario</label>
                  <textarea
                    style={{ minHeight: 70 }}
                    value={config.after_hours_message || ''}
                    onChange={e => setConfig({ ...config, after_hours_message: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-title">📅 Recordatorios por fecha pedida</div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="checkbox"
                id="scheduling"
                checked={config.smart_scheduling_enabled ?? false}
                onChange={e => setConfig({ ...config, smart_scheduling_enabled: e.target.checked })}
                style={{ width: 'auto' }}
              />
              <label htmlFor="scheduling" style={{ marginBottom: 0 }}>
                Si un cliente dice "contactame el lunes" o "escribime en 15 días", el bot programa el recordatorio solo y retoma la charla ese día
              </label>
            </div>
            <small style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 8 }}>
              No se puede usar al mismo tiempo que la toma de pedidos ni los datos automáticos de clientes — elegí el que más le sirva a tu negocio.
            </small>
          </div>

          <div className="card">
            <div className="card-title">📋 Datos automáticos de clientes</div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="checkbox"
                id="variables"
                checked={config.variables_enabled ?? false}
                onChange={e => setConfig({ ...config, variables_enabled: e.target.checked })}
                style={{ width: 'auto' }}
              />
              <label htmlFor="variables" style={{ marginBottom: 0 }}>
                Que el bot detecte y guarde automáticamente datos útiles del cliente (presupuesto, zona, fecha de interés, cantidad de invitados, etc.) sin tener que preguntarlos de nuevo
              </label>
            </div>
            <small style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 8 }}>
              Los datos detectados aparecen en cada conversación dentro del panel de "Conversaciones". No se puede usar al mismo tiempo que la toma de pedidos.
            </small>
          </div>

          <div className="card">
            <div className="card-title">📲 Notificaciones a tu WhatsApp personal</div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="checkbox"
                id="owner_notif"
                checked={config.owner_notifications_enabled ?? false}
                onChange={e => setConfig({ ...config, owner_notifications_enabled: e.target.checked })}
                style={{ width: 'auto' }}
              />
              <label htmlFor="owner_notif" style={{ marginBottom: 0 }}>
                Avisarme por WhatsApp cuando llegue un pedido nuevo, un cliente pida hablar con una persona, o algo necesite mi atención
              </label>
            </div>
            {config.owner_notifications_enabled && (
              <div className="form-group" style={{ marginTop: 12 }}>
                <label>Tu número de WhatsApp personal</label>
                <input
                  placeholder="+54 9 11 1234-5678"
                  value={config.owner_notification_phone || ''}
                  onChange={e => setConfig({ ...config, owner_notification_phone: e.target.value })}
                />
                <small style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Puede ser distinto al número de WhatsApp Business de tu negocio — este es para que TE lleguen los avisos a vos.
                </small>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">🔔 Seguimiento de consultas abandonadas</div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="checkbox"
                id="followup"
                checked={config.followup_enabled ?? false}
                onChange={e => setConfig({ ...config, followup_enabled: e.target.checked })}
                style={{ width: 'auto' }}
              />
              <label htmlFor="followup" style={{ marginBottom: 0 }}>
                Si un cliente preguntó algo y no volvió a responder, el bot le escribe de nuevo para recuperar la venta
              </label>
            </div>

            {config.followup_enabled && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
                  <div className="form-group">
                    <label>Esperar antes de hacer seguimiento</label>
                    <select
                      value={config.followup_wait_minutes ?? 60}
                      onChange={e => setConfig({ ...config, followup_wait_minutes: parseInt(e.target.value) })}
                    >
                      <option value={30}>30 minutos</option>
                      <option value={60}>1 hora</option>
                      <option value={120}>2 horas</option>
                      <option value={240}>4 horas</option>
                      <option value={1440}>1 día</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Cantidad máxima de seguimientos</label>
                    <select
                      value={config.followup_max_attempts ?? 1}
                      onChange={e => setConfig({ ...config, followup_max_attempts: parseInt(e.target.value) })}
                    >
                      <option value={1}>1 vez</option>
                      <option value={2}>2 veces</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Mensaje de seguimiento</label>
                  <textarea
                    style={{ minHeight: 70 }}
                    value={config.followup_message || ''}
                    onChange={e => setConfig({ ...config, followup_message: e.target.value })}
                  />
                  <small style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Se manda automáticamente si el cliente no responde en el tiempo configurado, sin importar el canal (WhatsApp, Instagram, Facebook o TikTok).
                  </small>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-title">👤 Transferencia a humano</div>
            <div className="form-group">
              <label>Palabra clave para hablar con una persona</label>
              <input
                placeholder="humano"
                value={config.human_handoff_keyword || ''}
                onChange={e => setConfig({ ...config, human_handoff_keyword: e.target.value })}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Si el cliente escribe esta palabra, el bot se detiene y notifica que viene una persona.
              </small>
            </div>
          </div>

          <div className="card">
            <div className="card-title">💳 Datos de pago</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={config.payment_enabled || false}
                  onChange={e => setConfig({ ...config, payment_enabled: e.target.checked })}
                />
                <span style={{ fontSize: 14 }}>Activar: el bot comparte estos datos cuando el cliente quiere pagar</span>
              </label>
            </div>
            {config.payment_enabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label>Alias</label>
                  <input
                    placeholder="mi.negocio.mp"
                    value={config.payment_alias || ''}
                    onChange={e => setConfig({ ...config, payment_alias: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>CBU</label>
                  <input
                    placeholder="0000003100012345678901"
                    value={config.payment_cbu || ''}
                    onChange={e => setConfig({ ...config, payment_cbu: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Titular de la cuenta</label>
                  <input
                    placeholder="Juan Pérez"
                    value={config.payment_holder || ''}
                    onChange={e => setConfig({ ...config, payment_holder: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Link de MercadoPago (opcional)</label>
                  <input
                    placeholder="https://mpago.la/..."
                    value={config.payment_mp_link || ''}
                    onChange={e => setConfig({ ...config, payment_mp_link: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: 'auto', padding: '12px 32px' }}>
            {saving ? 'Guardando...' : '💾 Guardar configuración'}
          </button>
        </form>
      </div>
    </div>
  );
}
