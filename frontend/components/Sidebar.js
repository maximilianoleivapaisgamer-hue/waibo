import { useRouter } from 'next/router';
import Image from 'next/image';
import ChannelLogo from './ChannelLogo';

export default function Sidebar({ active }) {
  const router = useRouter();
  const isEmployee = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('whabot_client') || '{}').role === 'employee'
    : false;

  const logout = () => {
    localStorage.removeItem('whabot_token');
    localStorage.removeItem('whabot_client');
    router.push('/');
  };

  const allSections = [
    {
      label: 'Principal',
      onlyOwner: false,
      items: [
        { key: 'dashboard', label: 'Panel principal', icon: '📊', href: '/dashboard', onlyOwner: true },
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
        { key: 'knowledge', label: 'Base de conocimiento', icon: '🧠', href: '/knowledge', onlyOwner: true },
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
        { key: 'billing', label: 'Mi plan', icon: '💳', href: '/billing' },
        { key: 'profile', label: 'Mi cuenta', icon: '👤', href: '/profile' },
      ]
    }
  ];

  const sections = allSections
    .filter(s => !isEmployee || !s.onlyOwner)
    .map(s => ({ ...s, items: s.items.filter(i => !isEmployee || !i.onlyOwner) }))
    .filter(s => s.items.length > 0);

  return (
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
  );
}
