import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL;

const RUBROS = [
  { id: 'gastronomia',  label: 'Gastronomía',         icon: '🍕', desc: 'Restaurantes, delivery, cafeterías' },
  { id: 'salud',        label: 'Salud y Estética',     icon: '💆', desc: 'Clínicas, spas, peluquerías' },
  { id: 'comercio',     label: 'Comercio',             icon: '🛍️', desc: 'Tiendas, retail, productos' },
  { id: 'servicios',    label: 'Servicios',            icon: '🔧', desc: 'Plomeros, abogados, consultores' },
  { id: 'educacion',    label: 'Educación',            icon: '📚', desc: 'Academias, cursos, tutorías' },
  { id: 'inmobiliaria', label: 'Inmobiliaria',         icon: '🏠', desc: 'Propiedades, alquileres, ventas' },
  { id: 'otro',         label: 'Otro',                 icon: '✨', desc: 'Mi negocio es diferente' },
];

const BOT_TASKS = [
  { id: 'consultas', label: 'Responder consultas', icon: '💬', desc: 'Preguntas sobre precios, disponibilidad y más' },
  { id: 'turnos',    label: 'Agendar turnos',      icon: '📅', desc: 'Reservas y citas automáticas' },
  { id: 'pedidos',   label: 'Tomar pedidos',       icon: '📦', desc: 'Registrar compras y delivery' },
  { id: 'ventas',    label: 'Cerrar ventas',       icon: '💰', desc: 'Calificar leads y convertir clientes' },
];

const PLATFORMS = [
  { id: 'whatsapp',     label: 'WhatsApp',        bg: '#25D366', color: '#fff' },
  { id: 'instagram',    label: 'Instagram',       bg: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)', color: '#fff' },
  { id: 'tiktok',       label: 'TikTok',          bg: '#010101', color: '#fff' },
  { id: 'mercadolibre', label: 'Mercado Libre',   bg: '#FFE600', color: '#111' },
  { id: 'tiendanube',   label: 'Tiendanube',      bg: '#00B2CC', color: '#fff' },
  { id: 'google',       label: 'Google Calendar', bg: '#4285F4', color: '#fff' },
];

const DAYS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const DAYS_SHORT = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

const TOTAL_STEPS = 6;

export default function Onboarding() {
  const router = useRouter();
  const [mode, setMode] = useState(null); // null | 'ai' | 'manual'

  // ── Manual state ──────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    rubro: '',
    business_name: '',
    business_description: '',
    bot_tasks: [],
    platforms: [],
    bot_tone: 'amigable',
    business_hours_enabled: false,
    business_hours_start: '09:00',
    business_hours_end: '18:00',
    business_hours_days: ['lunes','martes','miercoles','jueves','viernes'],
    system_prompt: '',
  });

  // ── AI state ──────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiConfig, setAiConfig] = useState(null); // generated config
  const [aiReview, setAiReview] = useState(false); // showing edit screen
  const chatEndRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const token = typeof window !== 'undefined' ? localStorage.getItem('whabot_token') : null;
  const clientName = typeof window !== 'undefined'
    ? (() => { try { return JSON.parse(localStorage.getItem('whabot_client'))?.name?.split(' ')[0] || ''; } catch { return ''; } })()
    : '';

  useEffect(() => {
    if (!token) { router.replace('/login'); }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, aiLoading]);

  // ── Guardar y terminar ─────────────────────────────────────
  async function save(data) {
    setSaving(true);
    try {
      await axios.post(`${API}/api/bot/onboarding-save`, data, {
        headers: { Authorization: `Bearer ${token}` }
      });
      router.push('/dashboard');
    } catch { setSaving(false); }
  }

  // ── AI chat ────────────────────────────────────────────────
  async function sendMessage(text) {
    if (!text.trim() || aiLoading) return;
    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setAiLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/bot/onboarding-ai`,
        { messages: newMessages },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      if (data.config) {
        setAiConfig(data.config);
        setAiReview(true);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Hubo un error, intentá de nuevo.' }]);
    } finally { setAiLoading(false); }
  }

  // ── Helpers ────────────────────────────────────────────────
  function toggleArr(arr, val) {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
  }

  function manualNext() {
    if (step < TOTAL_STEPS) setStep(s => s + 1);
    else save(form);
  }

  function canNext() {
    if (step === 1) return !!form.rubro;
    if (step === 2) return form.business_name.length >= 2 && form.business_description.length >= 20;
    if (step === 3) return form.bot_tasks.length > 0;
    if (step === 4) return form.platforms.length > 0;
    return true;
  }

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  if (!token) return null;

  // ── Choice screen ──────────────────────────────────────────
  if (!mode) return (
    <div style={s.page}>
      <Logo />
      <div style={s.card}>
        <div style={s.eyebrow}>✨ Bienvenido a Waibo{clientName ? `, ${clientName}` : ''}</div>
        <h1 style={s.h1}>¿Cómo querés configurar tu bot?</h1>
        <p style={s.sub}>Elegí el método que mejor se adapte a vos. En cualquier caso vas a poder editar todo después.</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:28 }}>
          <button style={s.modeCard} onClick={() => {
            setMode('ai');
            setTimeout(() => sendMessage(`Hola, me llamo ${clientName || 'nuevo cliente'} y quiero configurar mi Waibo`), 100);
          }}>
            <div style={{ fontSize:36, marginBottom:12 }}>🤖</div>
            <div style={s.modeTitle}>Configurar con IA</div>
            <div style={s.modeDesc}>La IA te hace preguntas y arma todo sola. Rápido y conversacional.</div>
            <div style={{ ...s.badge, background:'#EDE9FE', color:'#7C3AED', marginTop:12 }}>Recomendado</div>
          </button>
          <button style={s.modeCard} onClick={() => setMode('manual')}>
            <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
            <div style={s.modeTitle}>Paso a paso</div>
            <div style={s.modeDesc}>Completás cada campo a tu ritmo con un formulario guiado.</div>
            <div style={{ ...s.badge, background:'#F3F4F6', color:'#6B7280', marginTop:12 }}>Manual</div>
          </button>
        </div>
        <button style={s.skip} onClick={() => router.push('/dashboard')}>Configurar más tarde →</button>
      </div>
    </div>
  );

  // ── AI mode ────────────────────────────────────────────────
  if (mode === 'ai') {
    // Review/edit screen
    if (aiReview && aiConfig) {
      const cfg = aiConfig;
      return (
        <div style={s.page}>
          <Logo />
          <div style={{ ...s.card, maxWidth:640 }}>
            <div style={s.eyebrow}>✅ Configuración lista</div>
            <h1 style={{ ...s.h1, fontSize:24 }}>Revisá y editá si querés</h1>
            <p style={s.sub}>La IA generó esta configuración. Podés cambiar cualquier campo antes de guardar.</p>

            <div style={s.fieldGroup}>
              <label style={s.label}>Nombre del negocio</label>
              <input style={s.input} value={cfg.business_name || ''} onChange={e => setAiConfig({...cfg, business_name: e.target.value})} />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Descripción</label>
              <textarea style={{ ...s.input, height:80, resize:'vertical' }} value={cfg.business_description || ''} onChange={e => setAiConfig({...cfg, business_description: e.target.value})} />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Tono del bot</label>
              <div style={{ display:'flex', gap:10 }}>
                {['formal','amigable','vendedor'].map(t => (
                  <button key={t} style={{ ...s.pill, ...(cfg.bot_tone === t ? s.pillActive : {}) }} onClick={() => setAiConfig({...cfg, bot_tone: t})}>{t}</button>
                ))}
              </div>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Tareas del bot</label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {BOT_TASKS.map(t => (
                  <button key={t.id} style={{ ...s.pill, ...(cfg.bot_tasks?.includes(t.id) ? s.pillActive : {}) }}
                    onClick={() => setAiConfig({...cfg, bot_tasks: toggleArr(cfg.bot_tasks || [], t.id)})}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Plataformas</label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {PLATFORMS.map(p => (
                  <button key={p.id} style={{ ...s.pill, ...(cfg.platforms?.includes(p.id) ? s.pillActive : {}) }}
                    onClick={() => setAiConfig({...cfg, platforms: toggleArr(cfg.platforms || [], p.id)})}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Instrucciones del bot (system prompt)</label>
              <textarea style={{ ...s.input, height:120, resize:'vertical', fontSize:13 }} value={cfg.system_prompt || ''} onChange={e => setAiConfig({...cfg, system_prompt: e.target.value})} />
            </div>

            <div style={{ display:'flex', gap:12, marginTop:8 }}>
              <button style={s.btnSecondary} onClick={() => { setAiReview(false); setAiConfig(null); }}>← Volver al chat</button>
              <button style={{ ...s.btnPrimary, flex:1 }} disabled={saving} onClick={() => save({
                business_name: cfg.business_name,
                business_description: cfg.business_description,
                bot_tasks: cfg.bot_tasks || [],
                platforms: cfg.platforms || [],
                bot_tone: cfg.bot_tone,
                business_hours_enabled: cfg.business_hours_enabled,
                business_hours_start: cfg.business_hours_start,
                business_hours_end: cfg.business_hours_end,
                business_hours_days: cfg.business_hours_days || [],
                system_prompt: cfg.system_prompt,
              })}>
                {saving ? 'Guardando...' : '¡Empezar con Waibo →'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Chat screen
    return (
      <div style={s.page}>
        <Logo />
        <div style={{ ...s.card, maxWidth:600, padding:0, overflow:'hidden' }}>
          <div style={s.chatHeader}>
            <div style={s.chatAvatar}>W</div>
            <div>
              <div style={{ fontWeight:700, fontSize:15 }}>Waibo IA</div>
              <div style={{ fontSize:12, color:'#a3e635' }}>● Configurando tu bot</div>
            </div>
          </div>

          <div style={s.chatBody}>
            {messages.length === 0 && (
              <div style={{ textAlign:'center', color:'#9CA3AF', fontSize:14, marginTop:40 }}>Iniciando conversación...</div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display:'flex', justifyContent: m.role==='user' ? 'flex-end' : 'flex-start', marginBottom:12 }}>
                {m.role === 'assistant' && <div style={s.chatBotDot}>W</div>}
                <div style={m.role === 'user' ? s.bubbleUser : s.bubbleBot}>{m.content}</div>
              </div>
            ))}
            {aiLoading && (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={s.chatBotDot}>W</div>
                <div style={{ ...s.bubbleBot, padding:'12px 16px' }}>
                  <span style={s.dot1}>●</span><span style={s.dot2}>●</span><span style={s.dot3}>●</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={s.chatInput}>
            <input
              style={s.chatField}
              placeholder="Escribí tu respuesta..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
              disabled={aiLoading}
            />
            <button style={s.sendBtn} onClick={() => sendMessage(input)} disabled={aiLoading || !input.trim()}>
              →
            </button>
          </div>
        </div>
        <button style={s.skip} onClick={() => setMode('manual')}>Prefiero el modo paso a paso</button>
      </div>
    );
  }

  // ── Manual mode ────────────────────────────────────────────
  return (
    <div style={s.page}>
      <Logo />
      <div style={{ ...s.card, maxWidth:580 }}>
        {/* Progress */}
        <div style={s.progress}>
          <div style={{ fontSize:13, color:'#7C3AED', fontWeight:600 }}>Paso {step} de {TOTAL_STEPS}</div>
          <div style={s.progressBar}>
            <div style={{ ...s.progressFill, width: `${(step/TOTAL_STEPS)*100}%` }} />
          </div>
        </div>

        {/* Step 1 — Rubro */}
        {step === 1 && <>
          <div style={s.eyebrow}>🏢 Tu negocio</div>
          <h2 style={s.h2}>¿A qué rubro pertenecés?</h2>
          <p style={s.sub}>Esto nos ayuda a adaptar el bot para tu tipo de negocio.</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:20 }}>
            {RUBROS.map(r => (
              <button key={r.id} style={{ ...s.optionCard, ...(form.rubro === r.id ? s.optionCardActive : {}) }}
                onClick={() => setForm({...form, rubro: r.id})}>
                <span style={{ fontSize:24 }}>{r.icon}</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:14 }}>{r.label}</div>
                  <div style={{ fontSize:12, color:'#6B7280' }}>{r.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </>}

        {/* Step 2 — Negocio */}
        {step === 2 && <>
          <div style={s.eyebrow}>📋 Información</div>
          <h2 style={s.h2}>Contanos tu negocio</h2>
          <p style={s.sub}>El bot va a usar esta info para responder preguntas de tus clientes.</p>
          <div style={{ ...s.fieldGroup, marginTop:20 }}>
            <label style={s.label}>Nombre del negocio</label>
            <input style={s.input} placeholder="Ej: Pizzería La Loba" value={form.business_name}
              onChange={e => setForm({...form, business_name: e.target.value})} />
          </div>
          <div style={s.fieldGroup}>
            <label style={s.label}>¿A qué se dedica tu negocio?</label>
            <textarea style={{ ...s.input, height:100, resize:'vertical' }}
              placeholder="Ej: Somos una pizzería en Palermo. Hacemos delivery y también se puede comer en el local. Abrimos de lunes a sábado."
              value={form.business_description}
              onChange={e => setForm({...form, business_description: e.target.value})} />
            <div style={{ fontSize:12, color: form.business_description.length < 20 ? '#EF4444' : '#9CA3AF', textAlign:'right', marginTop:4 }}>
              {form.business_description.length}/400
            </div>
          </div>
        </>}

        {/* Step 3 — Tareas */}
        {step === 3 && <>
          <div style={s.eyebrow}>🤖 Funciones</div>
          <h2 style={s.h2}>¿Qué querés que haga el bot?</h2>
          <p style={s.sub}>Podés elegir varias opciones. Todo se puede cambiar después.</p>
          <div style={{ display:'grid', gap:10, marginTop:20 }}>
            {BOT_TASKS.map(t => {
              const active = form.bot_tasks.includes(t.id);
              return (
                <button key={t.id} style={{ ...s.optionCard, ...(active ? s.optionCardActive : {}), padding:'14px 18px' }}
                  onClick={() => setForm({...form, bot_tasks: toggleArr(form.bot_tasks, t.id)})}>
                  <span style={{ fontSize:22 }}>{t.icon}</span>
                  <div style={{ flex:1, textAlign:'left' }}>
                    <div style={{ fontWeight:700, fontSize:14 }}>{t.label}</div>
                    <div style={{ fontSize:12, color:'#6B7280' }}>{t.desc}</div>
                  </div>
                  {active && <span style={{ color:'#7C3AED', fontSize:18 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </>}

        {/* Step 4 — Plataformas */}
        {step === 4 && <>
          <div style={s.eyebrow}>📱 Canales</div>
          <h2 style={s.h2}>¿En qué plataformas te escriben?</h2>
          <p style={s.sub}>Las vas a conectar después en el panel. Por ahora elegí las que usás.</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:20 }}>
            {PLATFORMS.map(p => {
              const active = form.platforms.includes(p.id);
              return (
                <button key={p.id}
                  style={{ ...s.optionCard, ...(active ? s.optionCardActive : {}), alignItems:'center', padding:'14px 16px' }}
                  onClick={() => setForm({...form, platforms: toggleArr(form.platforms, p.id)})}>
                  <div style={{ width:28, height:28, borderRadius:8, background:p.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <PlatformIcon id={p.id} />
                  </div>
                  <span style={{ fontWeight:600, fontSize:14 }}>{p.label}</span>
                  {active && <span style={{ marginLeft:'auto', color:'#7C3AED' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </>}

        {/* Step 5 — Horarios */}
        {step === 5 && <>
          <div style={s.eyebrow}>🕐 Horarios</div>
          <h2 style={s.h2}>¿Atendés en horarios específicos?</h2>
          <p style={s.sub}>Fuera del horario el bot puede avisarle al cliente cuándo lo van a atender.</p>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:20 }}>
            {[
              { val: false, label: 'No, atendemos 24/7', desc: 'El bot responde siempre', icon: '🌙' },
              { val: true,  label: 'Sí, tengo horario',  desc: 'Configurá los días y horas', icon: '🕐' },
            ].map(o => (
              <button key={String(o.val)} style={{ ...s.optionCard, ...(form.business_hours_enabled === o.val ? s.optionCardActive : {}), padding:'16px 18px' }}
                onClick={() => setForm({...form, business_hours_enabled: o.val})}>
                <span style={{ fontSize:22 }}>{o.icon}</span>
                <div style={{ textAlign:'left' }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{o.label}</div>
                  <div style={{ fontSize:12, color:'#6B7280' }}>{o.desc}</div>
                </div>
              </button>
            ))}
          </div>
          {form.business_hours_enabled && <>
            <div style={{ marginTop:20 }}>
              <label style={s.label}>Días de atención</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                {DAYS.map((d, i) => {
                  const active = form.business_hours_days.includes(d);
                  return (
                    <button key={d} style={{ ...s.dayBtn, ...(active ? s.dayBtnActive : {}) }}
                      onClick={() => setForm({...form, business_hours_days: toggleArr(form.business_hours_days, d)})}>
                      {DAYS_SHORT[i]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:16 }}>
              <div>
                <label style={s.label}>Desde</label>
                <input type="time" style={s.input} value={form.business_hours_start}
                  onChange={e => setForm({...form, business_hours_start: e.target.value})} />
              </div>
              <div>
                <label style={s.label}>Hasta</label>
                <input type="time" style={s.input} value={form.business_hours_end}
                  onChange={e => setForm({...form, business_hours_end: e.target.value})} />
              </div>
            </div>
          </>}
        </>}

        {/* Step 6 — Instrucciones */}
        {step === 6 && <>
          <div style={s.eyebrow}>✨ Instrucciones</div>
          <h2 style={s.h2}>Dale indicaciones a tu bot</h2>
          <p style={s.sub}>Escribí reglas simples sobre cómo debe hablar y qué debe evitar. Es opcional.</p>
          <div style={{ background:'#F5F3FF', borderRadius:10, padding:'12px 16px', marginTop:16, fontSize:13, color:'#5B21B6' }}>
            <strong>Ejemplos:</strong><br/>
            • Responder con frases cortas y amigables<br/>
            • No prometer precios sin confirmar con el equipo<br/>
            • Si no sabe algo, pedir los datos del cliente
          </div>
          <div style={{ marginTop:16 }}>
            <label style={s.label}>Tono del bot</label>
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              {[
                { id:'formal',   label:'👔 Formal' },
                { id:'amigable', label:'😊 Amigable' },
                { id:'vendedor', label:'🔥 Vendedor' },
              ].map(t => (
                <button key={t.id} style={{ ...s.pill, flex:1, ...(form.bot_tone === t.id ? s.pillActive : {}) }}
                  onClick={() => setForm({...form, bot_tone: t.id})}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ ...s.fieldGroup, marginTop:16 }}>
            <label style={s.label}>Instrucciones adicionales (opcional)</label>
            <textarea style={{ ...s.input, height:110, resize:'vertical' }}
              placeholder="Ej: Responder siempre con un tono cercano, ofrecer el menú si preguntan por comida..."
              value={form.system_prompt}
              onChange={e => setForm({...form, system_prompt: e.target.value})} />
          </div>
        </>}

        {/* Nav buttons */}
        <div style={{ display:'flex', gap:12, marginTop:28 }}>
          {step > 1
            ? <button style={s.btnSecondary} onClick={() => setStep(s => s - 1)}>← Volver</button>
            : <button style={s.btnSecondary} onClick={() => setMode(null)}>← Volver</button>
          }
          {step >= 5 && (
            <button style={{ ...s.btnSecondary, color:'#9CA3AF' }} onClick={() => manualNext()}>
              {step === TOTAL_STEPS ? 'Omitir y terminar' : 'Omitir'}
            </button>
          )}
          <button style={{ ...s.btnPrimary, flex:1 }} disabled={!canNext() || saving} onClick={manualNext}>
            {saving ? 'Guardando...' : step === TOTAL_STEPS ? '¡Listo, empezar! →' : 'Continuar →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:32 }}>
      <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#7C3AED,#5B21B6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:18 }}>W</div>
      <span style={{ fontWeight:800, fontSize:20, color:'#1A1A2E' }}>Waibo</span>
    </div>
  );
}

function PlatformIcon({ id }) {
  const icons = {
    whatsapp:    <svg viewBox="0 0 24 24" fill="#fff" width="16" height="16"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
    instagram:   <svg viewBox="0 0 24 24" fill="#fff" width="14" height="14"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>,
    tiktok:      <svg viewBox="0 0 24 24" fill="#fff" width="14" height="14"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.19 8.19 0 004.79 1.54V6.84a4.85 4.85 0 01-1.02-.15z"/></svg>,
    mercadolibre:<svg viewBox="0 0 24 24" fill="#111" width="14" height="14"><path d="M12 0C5.374 0 0 5.373 0 12c0 6.628 5.374 12 12 12 6.628 0 12-5.372 12-12C24 5.373 18.628 0 12 0zm-.43 5.263l2.79 4.836 2.79-4.836h2.434L15.742 12l3.842 6.737h-2.434l-2.79-4.836-2.79 4.836H9.136L12.978 12 9.136 5.263h2.434z"/></svg>,
    tiendanube:  <svg viewBox="0 0 80 80" width="16" height="16"><text x="50%" y="60%" textAnchor="middle" fontSize="40" fontWeight="900" fill="#fff" fontFamily="Arial">TN</text></svg>,
    google:      <svg viewBox="0 0 24 24" width="14" height="14"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>,
  };
  return icons[id] || null;
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = {
  page:         { minHeight:'100vh', background:'#F7F6FB', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 16px', fontFamily:'system-ui,sans-serif' },
  card:         { background:'#fff', borderRadius:20, padding:36, width:'100%', maxWidth:520, boxShadow:'0 8px 40px -12px rgba(109,76,240,0.15)', border:'1px solid #EDE9FE' },
  eyebrow:      { fontSize:13, color:'#7C3AED', fontWeight:700, marginBottom:8 },
  h1:           { fontSize:28, fontWeight:800, color:'#1A1A2E', margin:'0 0 10px', lineHeight:1.2 },
  h2:           { fontSize:22, fontWeight:800, color:'#1A1A2E', margin:'0 0 8px', lineHeight:1.3 },
  sub:          { fontSize:15, color:'#6B7280', margin:'0 0 4px', lineHeight:1.5 },
  modeCard:     { background:'#fff', border:'2px solid #E5E7EB', borderRadius:16, padding:24, cursor:'pointer', textAlign:'center', transition:'border-color .2s,box-shadow .2s', display:'flex', flexDirection:'column', alignItems:'center' },
  modeTitle:    { fontWeight:700, fontSize:16, color:'#1A1A2E', marginBottom:6 },
  modeDesc:     { fontSize:13, color:'#6B7280', lineHeight:1.5 },
  badge:        { display:'inline-block', borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:600 },
  skip:         { marginTop:16, background:'none', border:'none', color:'#9CA3AF', fontSize:13, cursor:'pointer', textDecoration:'underline' },
  optionCard:   { display:'flex', alignItems:'center', gap:14, background:'#fff', border:'2px solid #E5E7EB', borderRadius:12, padding:'12px 16px', cursor:'pointer', textAlign:'left', transition:'border-color .15s,background .15s', width:'100%' },
  optionCardActive: { borderColor:'#7C3AED', background:'#F5F3FF' },
  fieldGroup:   { marginBottom:16 },
  label:        { display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:6 },
  input:        { width:'100%', padding:'10px 12px', borderRadius:10, border:'1.5px solid #E5E7EB', fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:'inherit', color:'#1A1A2E' },
  pill:         { padding:'8px 16px', borderRadius:20, border:'1.5px solid #E5E7EB', background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', color:'#374151' },
  pillActive:   { borderColor:'#7C3AED', background:'#EDE9FE', color:'#7C3AED' },
  dayBtn:       { width:44, height:44, borderRadius:10, border:'1.5px solid #E5E7EB', background:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', color:'#374151' },
  dayBtnActive: { borderColor:'#7C3AED', background:'#EDE9FE', color:'#7C3AED' },
  progress:     { marginBottom:24 },
  progressBar:  { height:4, background:'#EDE9FE', borderRadius:10, marginTop:8, overflow:'hidden' },
  progressFill: { height:'100%', background:'linear-gradient(90deg,#7C3AED,#5B21B6)', borderRadius:10, transition:'width .4s' },
  btnPrimary:   { padding:'13px 20px', borderRadius:12, background:'linear-gradient(135deg,#7C3AED,#5B21B6)', color:'#fff', border:'none', fontWeight:700, fontSize:15, cursor:'pointer' },
  btnSecondary: { padding:'13px 20px', borderRadius:12, background:'#F9FAFB', color:'#374151', border:'1.5px solid #E5E7EB', fontWeight:600, fontSize:14, cursor:'pointer' },
  // Chat
  chatHeader:   { background:'linear-gradient(135deg,#7C3AED,#5B21B6)', padding:'20px 24px', display:'flex', alignItems:'center', gap:14, color:'#fff' },
  chatAvatar:   { width:42, height:42, borderRadius:'50%', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:18 },
  chatBody:     { padding:'20px 24px', minHeight:340, maxHeight:420, overflowY:'auto', display:'flex', flexDirection:'column', gap:4 },
  chatInput:    { padding:'16px 24px', borderTop:'1px solid #F3F4F6', display:'flex', gap:10 },
  chatField:    { flex:1, padding:'10px 14px', borderRadius:12, border:'1.5px solid #E5E7EB', fontSize:14, outline:'none', fontFamily:'inherit' },
  sendBtn:      { padding:'10px 18px', borderRadius:12, background:'#7C3AED', color:'#fff', border:'none', fontWeight:700, fontSize:16, cursor:'pointer' },
  bubbleUser:   { background:'#7C3AED', color:'#fff', borderRadius:'18px 18px 4px 18px', padding:'10px 14px', maxWidth:'75%', fontSize:14, lineHeight:1.5 },
  bubbleBot:    { background:'#F3F4F6', color:'#1A1A2E', borderRadius:'18px 18px 18px 4px', padding:'10px 14px', maxWidth:'78%', fontSize:14, lineHeight:1.5, whiteSpace:'pre-wrap' },
  chatBotDot:   { width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#7C3AED,#5B21B6)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, marginRight:8, flexShrink:0, alignSelf:'flex-end' },
  dot1:         { animation:'blink 1.2s infinite', animationDelay:'0s', marginRight:2 },
  dot2:         { animation:'blink 1.2s infinite', animationDelay:'0.2s', marginRight:2 },
  dot3:         { animation:'blink 1.2s infinite', animationDelay:'0.4s' },
};
