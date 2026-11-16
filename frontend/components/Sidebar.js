import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import ChannelLogo from './ChannelLogo';

export default function Sidebar({ active }) {
  const router = useRouter();
  const [trial, setTrial] = useState(null);
  const [isEmployee, setIsEmployee] = useState(false);
  // Modo Empresa: mismo panel sin Mercado Libre, Tiendanube, pedidos, agenda ni catálogo
  const [modo, setModo] = useState('completo');
  useEffect(() => {
    try { const m = localStorage.getItem('waibo_panel_mode'); if (m) setModo(m); } catch (_) {}
    const token = typeof window !== 'undefined' && localStorage.getItem('whabot_token');
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bot/panel`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.mode) { setModo(d.mode); try { localStorage.setItem('waibo_panel_mode', d.mode); } catch (_) {} } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const client = JSON.parse(localStorage.getItem('whabot_client') || '{}');
      if (client.role === 'employee') setIsEmployee(true);
      if (client.role === 'employee' || !client.trial_ends_at) return;
      const now = new Date();
      const ends = new Date(client.trial_ends_at);
      const daysLeft = Math.ceil((ends - now) / (1000 * 60 * 60 * 24));
      const hasPlan = client.plan && !['trial', 'basico', null, undefined].includes(client.plan);
      if (hasPlan) return;
      setTrial({
        in_trial: true,
        days_left: Math.max(0, daysLeft),
        expired: daysLeft <= 0,
        ending_soon: daysLeft > 0 && daysLeft <= 5,
      });
    } catch {}
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll('.main-content');
    els.forEach(el => { el.style.paddingTop = trial ? '68px' : ''; });
    return () => els.forEach(el => { el.style.paddingTop = ''; });
  }, [trial]);

  const logout = () => {
    localStorage.removeItem('whabot_token');
    localStorage.removeItem('whabot_client');
    router.push('/login');
  };

  const allSections = [
    {
      label: 'Principal',
      onlyOwner: false,
      items: [
        { key: 'dashboard', label: 'Panel principal', icon: '📊', href: '/dashboard', onlyOwner: true },
        { key: 'empresa', label: 'Waibo Empresa', icon: '🏢', href: '/empresa', onlyOwner: true },
        { key: 'inbox', label: 'Bandeja (WhatsApp)', icon: '📥', href: '/inbox' },
        { key: 'conversations', label: 'Conversaciones', icon: '💬', href: '/conversations' },
      ]
    },
    {
      label: 'Integraciones',
      onlyOwner: true,
      items: [
        { key: 'channels', label: 'WhatsApp', channel: 'whatsapp', href: '/channels' },
        { key: 'instagram', label: 'Instagram', channel: 'instagram', href: '/instagram' },
        { key: 'mercadolibre', label: 'Mercado Libre', channel: 'mercadolibre', href: '/mercadolibre' },
        { key: 'webchat', label: 'Chat web', channel: 'webchat', href: '/webchat' },
      ]
    },
    {
      label: 'Otros canales',
      onlyOwner: true,
      items: [
        { key: 'facebook', label: 'Facebook', channel: 'facebook', href: '/facebook' },
        { key: 'tiendanube', label: 'Tiendanube', channel: 'tiendanube', href: '/tiendanube' },
        { key: 'tiktok', label: 'TikTok', channel: 'tiktok', href: '/tiktok' },
      ]
    },
    {
      label: 'Herramientas',
      onlyOwner: false,
      items: [
        { key: 'reports', label: 'Reportes', icon: '📈', href: '/reports', onlyOwner: true },
        { key: 'campaigns', label: 'Campañas masivas', icon: '📣', href: '/campaigns', onlyOwner: true },
        { key: 'orders', label: 'Pedidos', icon: '🍕', href: '/orders' },
        { key: 'agenda', label: 'Agenda', icon: '📅', href: '/agenda' },
        { key: 'catalog', label: 'Catálogo', icon: '🏪', href: '/catalog', onlyOwner: true },
        { key: 'test-chat', label: 'Modo prueba', icon: '🧪', href: '/test-chat', onlyOwner: true },
      ]
    },
    {
      label: 'Cuenta',
      onlyOwner: true,
      items: [
        { key: 'team', label: 'Mi equipo', icon: '👥', href: '/team' },
        { key: 'config', label: 'Configurar bot', icon: '⚙️', href: '/config' },
        { key: 'pagos', label: 'Cobros por el bot', icon: '💰', href: '/pagos' },
        { key: 'billing', label: 'Mi plan', icon: '💳', href: '/billing' },
        { key: 'profile', label: 'Mi cuenta', icon: '👤', href: '/profile' },
      ]
    }
  ];

  const OCULTOS_EMPRESA = ['mercadolibre', 'tiendanube', 'orders', 'agenda', 'catalog', 'conversations', 'tiktok', 'pagos'];
  const seccionesEmpresa = [
    {
      label: 'Principal',
      onlyOwner: false,
      items: [
        { key: 'empresa', label: 'Resumen', icon: '📊', href: '/empresa', onlyOwner: true },
        { key: 'inbox', label: 'Bandeja', icon: '📥', href: '/inbox' },
        { key: 'lineas', label: 'Líneas de WhatsApp', icon: '📱', href: '/empresa?tab=lineas', onlyOwner: true },
        { key: 'equipo', label: 'Equipo', icon: '👥', href: '/empresa?tab=equipo', onlyOwner: true },
      ]
    },
    {
      label: 'Cerebro IA',
      onlyOwner: true,
      items: [
        { key: 'config', label: 'Instrucciones y bot', icon: '🧠', href: '/config' },
        { key: 'knowledge', label: 'Base de conocimiento', icon: '📚', href: '/config?tab=knowledge' },
        { key: 'resources', label: 'Archivos y etiquetas', icon: '📎', href: '/config?tab=resources' },
        { key: 'reception', label: 'Recepción', icon: '📞', href: '/config?tab=reception' },
        { key: 'steps', label: 'Pasos de venta', icon: '🪜', href: '/config?tab=steps' },
        { key: 'recontact', label: 'Seguimiento', icon: '🔁', href: '/config?tab=recontact' },
        { key: 'builder', label: 'Armá tu vendedor', icon: '✨', href: '/config?tab=builder' },
        { key: 'test-chat', label: 'Modo prueba', icon: '🧪', href: '/test-chat' },
      ]
    },
    ...allSections
      .filter(s => !['Principal', 'Herramientas', 'Cuenta'].includes(s.label))
      .map(s => ({ ...s, items: s.items.filter(i => !OCULTOS_EMPRESA.includes(i.key)) })),
    {
      label: 'Herramientas',
      onlyOwner: true,
      items: [
        { key: 'reports', label: 'Reportes', icon: '📈', href: '/reports' },
        { key: 'campaigns', label: 'Campañas masivas', icon: '📣', href: '/campaigns' },
      ]
    },
    {
      label: 'Cuenta',
      onlyOwner: true,
      items: [
        { key: 'team', label: 'Usuarios del equipo', icon: '🔑', href: '/team' },
        { key: 'billing', label: 'Mi plan', icon: '💳', href: '/billing' },
        { key: 'profile', label: 'Mi cuenta', icon: '👤', href: '/profile' },
      ]
    }
  ];

  const sections = (modo === 'empresa' ? seccionesEmpresa : allSections)
    .filter(s => !isEmployee || !s.onlyOwner)
    .map(s => ({ ...s, items: s.items.filter(i => !isEmployee || !i.onlyOwner) }))
    .filter(s => s.items.length > 0);

  return (
    <>
    {trial && (
      <div style={{
        position: 'fixed', top: 0, left: 240, right: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        padding: '12px 28px',
        background: trial.expired ? '#FEF2F2' : trial.ending_soon ? '#FFFBEB' : '#EFF6FF',
        borderBottom: `2px solid ${trial.expired ? '#FECACA' : trial.ending_soon ? '#FDE68A' : '#BFDBFE'}`,
      }}>
        <span style={{ fontSize: 20 }}>{trial.expired ? '🔴' : trial.ending_soon ? '⚠️' : '🕐'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: trial.expired ? '#DC2626' : trial.ending_soon ? '#92400E' : '#1D4ED8' }}>
            {trial.expired
              ? 'Tu período de prueba venció'
              : trial.ending_soon
                ? `Tu prueba vence en ${trial.days_left} día${trial.days_left !== 1 ? 's' : ''}`
                : `Período de prueba gratuita — ${trial.days_left} días restantes`}
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>
            {trial.expired
              ? 'Activá tu plan para seguir usando Waibo sin interrupciones.'
              : 'Activá tu plan antes de que venza para no perder ninguna conversación.'}
          </div>
        </div>
        <button
          onClick={() => router.push('/billing')}
          style={{
            padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
            background: trial.expired ? '#DC2626' : '#7C3AED', color: 'white',
          }}
        >
          {trial.expired ? 'Activar ahora' : 'Ver planes'}
        </button>
      </div>
    )}
    <div className="sidebar">
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Image src="/waibo-icon.png" alt="Waibo" width={32} height={32} style={{ borderRadius: 8 }} />
          <span style={{ fontWeight: 700, fontSize: 18 }}>Waibo</span>
        </div>
        <small>v1.0.0 — Panel de control</small>
      </div>
      <nav>
        {sections.map(section => (
          <div key={section.label}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em', padding: '12px 11px 4px'
            }}>{section.label}</div>
            {section.items.map(item => (
              <button
                key={item.key}
                className={`nav-item ${active === item.key ? 'active' : ''}`}
                onClick={() => router.push(item.href)}
              >
                {item.channel
                ? <ChannelLogo channel={item.channel} size={18} style={{ borderRadius: 4 }} />
                : <span className="nav-icon">{item.icon}</span>}
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={logout}>
          <span className="nav-icon">🚪</span>
          Cerrar sesión
        </button>
      </div>
    </div>
    </>
  );
}
