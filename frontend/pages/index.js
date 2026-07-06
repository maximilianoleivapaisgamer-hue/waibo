import { useRouter } from 'next/router';
import Image from 'next/image';

const PURPLE = '#7C3AED';
const PURPLE_DARK = '#5B21B6';
const PURPLE_LIGHT = '#EDE9FE';

const features = [
  { icon: '🤖', title: 'IA que entiende tu negocio', desc: 'Entrenás al bot con la info de tu negocio y responde igual que vos, las 24 horas.' },
  { icon: '📱', title: 'WhatsApp + Instagram + Facebook', desc: 'Un solo panel para atender todos tus canales sin perder ningún mensaje.' },
  { icon: '🛍️', title: 'Mercado Libre y Tiendanube', desc: 'Responde consultas de tus publicaciones y tienda online automáticamente.' },
  { icon: '📅', title: 'Agenda de turnos', desc: 'Los clientes reservan turnos solos por WhatsApp, sin que tengas que intervenir.' },
  { icon: '📊', title: 'Reportes y estadísticas', desc: 'Sabés exactamente cuántos mensajes atendió tu bot y cuándo necesitó ayuda.' },
  { icon: '👥', title: 'Multi-agente', desc: 'Agregá a tu equipo para que vean y respondan las conversaciones desde el panel.' },
];

const steps = [
  { n: '1', title: 'Registrá tu negocio', desc: 'Creás tu cuenta en 2 minutos. Sin tarjeta de crédito.' },
  { n: '2', title: 'Configurá tu bot', desc: 'Le contás a la IA sobre tu negocio, horarios, precios y servicios.' },
  { n: '3', title: 'Conectá tus canales', desc: 'Vinculás WhatsApp, Instagram o los canales que uses.' },
  { n: '4', title: 'Listo, atendé solo', desc: 'Tu bot empieza a responder. Vos solo intervenís cuando es necesario.' },
];

const plans = [
  {
    name: 'Estándar', price: '59.999', period: 'mes',
    desc: 'Ideal para negocios que quieren automatizar su atención al cliente.',
    features: ['WhatsApp Business', 'Instagram + Facebook', 'Base de conocimiento', 'Agenda de turnos', 'Estadísticas básicas', 'Soporte por email'],
    highlight: false,
  },
  {
    name: 'E-Commerce Pro', price: '129.999', period: 'mes',
    desc: 'Para tiendas online que venden en múltiples plataformas.',
    features: ['Todo el plan Estándar', 'Mercado Libre', 'Tiendanube', 'Catálogo dinámico', 'Estadísticas avanzadas', 'Soporte prioritario'],
    highlight: true,
  },
];

const channels = [
  { name: 'WhatsApp', color: '#25D366', icon: '💬' },
  { name: 'Instagram', color: '#E1306C', icon: '📸' },
  { name: 'Facebook', color: '#1877F2', icon: '👍' },
  { name: 'Mercado Libre', color: '#FFE600', dark: true, icon: '🛒' },
  { name: 'Tiendanube', color: '#2D2DFF', icon: '☁️' },
];

export default function Landing() {
  const router = useRouter();

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: '#1A1A2E', overflowX: 'hidden' }}>

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #F3F4F6', padding: '0 5%', display: 'flex', alignItems: 'center', height: 64 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <Image src="/waibo-icon.png" alt="Waibo" width={32} height={32} style={{ borderRadius: 8 }} />
          <span style={{ fontWeight: 900, fontSize: 20, color: PURPLE }}>Waibo</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => router.push('/login')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontWeight: 500, fontSize: 14, padding: '8px 16px' }}>
            Iniciar sesión
          </button>
          <button onClick={() => router.push('/register')} style={{ background: PURPLE, color: 'white', border: 'none', borderRadius: 10, padding: '9px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Empezar gratis →
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #EFF6FF 50%, #F0FDF4 100%)', padding: '80px 5% 100px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'white', border: `1px solid ${PURPLE_LIGHT}`, borderRadius: 100, padding: '6px 16px', marginBottom: 24, fontSize: 13, color: PURPLE, fontWeight: 600 }}>
          🎉 14 días de prueba gratuita — sin tarjeta
        </div>
        <h1 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 900, lineHeight: 1.1, margin: '0 auto 20px', maxWidth: 800, color: '#0F0A1E' }}>
          Tu PyME atendiendo clientes{' '}
          <span style={{ background: `linear-gradient(135deg, ${PURPLE}, #2563EB)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            24/7 con IA
          </span>
        </h1>
        <p style={{ fontSize: 18, color: '#6B7280', maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.7 }}>
          Waibo automatiza la atención al cliente de tu negocio en WhatsApp, Instagram, Facebook, Mercado Libre y Tiendanube. Sin código, sin complicaciones.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/register')} style={{ background: PURPLE, color: 'white', border: 'none', borderRadius: 12, padding: '15px 32px', fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: `0 8px 32px ${PURPLE}40` }}>
            Empezar 14 días gratis →
          </button>
          <button onClick={() => document.getElementById('como-funciona').scrollIntoView({ behavior: 'smooth' })} style={{ background: 'white', color: PURPLE, border: `2px solid ${PURPLE_LIGHT}`, borderRadius: 12, padding: '15px 32px', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>
            Ver cómo funciona
          </button>
        </div>

        {/* Channels */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 56 }}>
          {channels.map(ch => (
            <div key={ch.name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', borderRadius: 100, padding: '8px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', fontSize: 13, fontWeight: 600, color: ch.dark ? '#333' : ch.color }}>
              <span>{ch.icon}</span> {ch.name}
            </div>
          ))}
        </div>

        {/* Mock dashboard preview */}
        <div style={{ maxWidth: 800, margin: '56px auto 0', background: 'white', borderRadius: 20, boxShadow: '0 24px 80px rgba(124,58,237,0.15)', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FCA5A5' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FDE68A' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#A7F3D0' }} />
            <div style={{ flex: 1, background: '#E5E7EB', borderRadius: 6, height: 20, marginLeft: 12, maxWidth: 300 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: 280 }}>
            <div style={{ background: 'white', borderRight: '1px solid #F3F4F6', padding: '16px 0' }}>
              {['Panel principal', 'Conversaciones', 'WhatsApp', 'Instagram', 'Configurar bot'].map((item, i) => (
                <div key={item} style={{ padding: '8px 16px', fontSize: 12, color: i === 0 ? PURPLE : '#9CA3AF', background: i === 0 ? PURPLE_LIGHT : 'none', fontWeight: i === 0 ? 700 : 400, borderRadius: i === 0 ? '0 8px 8px 0' : 0, marginRight: i === 0 ? 8 : 0 }}>
                  {item}
                </div>
              ))}
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
                {[{ l: 'Convs. hoy', v: '24', c: '#5B21B6' }, { l: 'Mensajes', v: '187', c: '#1A1A2E' }, { l: 'Resueltos IA', v: '96%', c: '#059669' }, { l: 'Activos ahora', v: '3', c: '#D97706' }].map(s => (
                  <div key={s.l} style={{ background: '#F9FAFB', borderRadius: 10, padding: 12, border: '1px solid #E5E7EB' }}>
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 4 }}>{s.l}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: s.c }}>{s.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#F9FAFB', borderRadius: 10, padding: 14, border: '1px solid #E5E7EB' }}>
                {[{ name: 'María García', msg: '¿Tienen turno disponible para mañana?', time: 'hace 2m', bot: true },
                  { name: 'Carlos López', msg: 'Genial, confirmo el turno a las 10hs', time: 'hace 5m', bot: true },
                  { name: 'Ana Martínez', msg: 'Necesito hablar con alguien urgente', time: 'hace 12m', bot: false }].map(c => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: PURPLE_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: PURPLE, flexShrink: 0 }}>{c.name[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.msg}</div>
                    </div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{c.time}</div>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, background: c.bot ? '#EDE9FE' : '#FEF3C7', color: c.bot ? PURPLE : '#92400E', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.bot ? '🤖 Bot' : '👤 Humano'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '80px 5%', background: 'white' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <span style={{ color: PURPLE, fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Funcionalidades</span>
            <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, margin: '12px 0 16px' }}>Todo lo que necesita tu negocio</h2>
            <p style={{ color: '#6B7280', fontSize: 16, maxWidth: 500, margin: '0 auto' }}>Una plataforma completa para automatizar tu atención al cliente sin complicaciones.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {features.map(f => (
              <div key={f.title} style={{ padding: 28, borderRadius: 16, border: '1px solid #F3F4F6', background: '#FAFAFA', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = PURPLE_LIGHT; e.currentTarget.style.background = '#FEFEFF'; e.currentTarget.style.boxShadow = `0 8px 32px ${PURPLE}12`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#F3F4F6'; e.currentTarget.style.background = '#FAFAFA'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ fontSize: 36, marginBottom: 14 }}>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>{f.title}</div>
                <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="como-funciona" style={{ padding: '80px 5%', background: 'linear-gradient(135deg, #F5F3FF, #EFF6FF)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <span style={{ color: PURPLE, fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Proceso</span>
            <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, margin: '12px 0 16px' }}>Listo en menos de 10 minutos</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
            {steps.map((s, i) => (
              <div key={s.n} style={{ background: 'white', borderRadius: 16, padding: 28, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', position: 'relative' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: PURPLE, color: 'white', fontWeight: 900, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>{s.n}</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{s.title}</div>
                <p style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
                {i < steps.length - 1 && (
                  <div style={{ position: 'absolute', right: -14, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: PURPLE_LIGHT, display: 'none' }}>→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ padding: '80px 5%', background: 'white' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <span style={{ color: PURPLE, fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Precios</span>
            <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, margin: '12px 0 16px' }}>Simple y transparente</h2>
            <p style={{ color: '#6B7280', fontSize: 16 }}>14 días de prueba gratuita en todos los planes. Sin tarjeta de crédito.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'start' }}>
            {plans.map(p => (
              <div key={p.name} style={{
                borderRadius: 20, padding: 32, border: p.highlight ? `2px solid ${PURPLE}` : '1px solid #E5E7EB',
                background: p.highlight ? `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DARK})` : 'white',
                color: p.highlight ? 'white' : '#1A1A2E', position: 'relative',
                boxShadow: p.highlight ? `0 16px 48px ${PURPLE}30` : 'none',
              }}>
                {p.highlight && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#059669', color: 'white', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                    ⭐ MÁS POPULAR
                  </div>
                )}
                <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, opacity: 0.7 }}>$</span>
                  <span style={{ fontSize: 40, fontWeight: 900, lineHeight: 1 }}>{Number(p.price).toLocaleString('es-AR')}</span>
                  <span style={{ fontSize: 14, opacity: 0.7 }}>/{p.period}</span>
                </div>
                <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 24, lineHeight: 1.6 }}>{p.desc}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                  {p.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                      <span style={{ color: p.highlight ? '#A7F3D0' : '#059669', fontWeight: 700 }}>✓</span>
                      {f}
                    </div>
                  ))}
                </div>
                <button onClick={() => router.push('/register')} style={{
                  width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 15,
                  background: p.highlight ? 'white' : PURPLE,
                  color: p.highlight ? PURPLE : 'white',
                }}>
                  Empezar 14 días gratis →
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ padding: '80px 5%', background: '#F9FAFB' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 'clamp(24px,4vw,38px)', fontWeight: 900, margin: 0 }}>Lo que dicen nuestros clientes</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {[
              { name: 'Pizzería La Loba', role: 'Gastronomía · Buenos Aires', text: 'Antes me perdía pedidos a toda hora. Ahora el bot los toma solo y yo reviso todo desde el panel. Increíble.', stars: 5 },
              { name: 'TuCuerpo Estrella', role: 'Gimnasio · Córdoba', text: 'Los turnos se reservan solos. Mis clientes reciben confirmación al instante y yo dejé de estar pegado al teléfono.', stars: 5 },
              { name: 'Concesionaria SVA', role: 'Automotriz · Rosario', text: 'Consultas de Mercado Libre respondidas automáticamente. Subió mucho nuestra reputación en la plataforma.', stars: 5 },
            ].map(t => (
              <div key={t.name} style={{ background: 'white', borderRadius: 16, padding: 28, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                <div style={{ color: '#F59E0B', fontSize: 16, marginBottom: 14 }}>{'★'.repeat(t.stars)}</div>
                <p style={{ fontSize: 15, lineHeight: 1.7, color: '#374151', marginBottom: 16 }}>"{t.text}"</p>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{ padding: '80px 5%', background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DARK})`, textAlign: 'center' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>🚀</div>
          <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 900, color: 'white', margin: '0 0 16px' }}>
            Empezá a automatizar hoy
          </h2>
          <p style={{ color: '#DDD6FE', fontSize: 17, marginBottom: 36, lineHeight: 1.7 }}>
            14 días gratis, sin tarjeta de crédito. Cancelás cuando querés.
          </p>
          <button onClick={() => router.push('/register')} style={{
            background: 'white', color: PURPLE, border: 'none', borderRadius: 14,
            padding: '16px 40px', fontWeight: 900, fontSize: 17, cursor: 'pointer',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            Crear mi cuenta gratis →
          </button>
          <div style={{ marginTop: 20, color: '#DDD6FE', fontSize: 13 }}>
            ¿Ya tenés cuenta?{' '}
            <span onClick={() => router.push('/login')} style={{ color: 'white', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
              Iniciá sesión
            </span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#0F0A1E', color: '#9CA3AF', padding: '40px 5%', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
          <Image src="/waibo-icon.png" alt="Waibo" width={24} height={24} style={{ borderRadius: 6 }} />
          <span style={{ fontWeight: 700, color: 'white', fontSize: 16 }}>Waibo</span>
        </div>
        <p style={{ fontSize: 13, margin: '0 0 12px' }}>El asistente de IA para PyMEs argentinas.</p>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', fontSize: 13 }}>
          <span onClick={() => router.push('/register')} style={{ cursor: 'pointer', color: '#9CA3AF' }}>Registrarse</span>
          <span onClick={() => router.push('/login')} style={{ cursor: 'pointer', color: '#9CA3AF' }}>Iniciar sesión</span>
        </div>
        <p style={{ fontSize: 12, marginTop: 24, color: '#4B5563' }}>© 2026 Waibo. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}
