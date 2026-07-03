import { useRouter } from 'next/router';
import Image from 'next/image';

export default function Sidebar({ active }) {
  const router = useRouter();

  const logout = () => {
    localStorage.removeItem('whabot_token');
    localStorage.removeItem('whabot_client');
    router.push('/');
  };

  const sections = [
    {
      label: 'Principal',
      items: [
        { key: 'dashboard', label: 'Panel principal', icon: '📊', href: '/dashboard' },
        { key: 'conversations', label: 'Conversaciones', icon: '💬', href: '/conversations' },
      ]
    },
    {
      label: 'Integraciones',
      items: [
        { key: 'instagram', label: 'Instagram', icon: '📸', href: '/instagram' },
        { key: 'facebook', label: 'Facebook', icon: '👍', href: '/facebook' },
        { key: 'mercadolibre', label: 'Mercado Libre', icon: '🛒', href: '/mercadolibre' },
        { key: 'channels', label: 'Otros canales', icon: '📱', href: '/channels' },
      ]
    },
    {
      label: 'Herramientas',
      items: [
        { key: 'orders', label: 'Pedidos', icon: '🍕', href: '/orders' },
        { key: 'agenda', label: 'Agenda', icon: '📅', href: '/agenda' },
        { key: 'knowledge', label: 'Base de conocimiento', icon: '🧠', href: '/knowledge' },
        { key: 'catalog', label: 'Catálogo', icon: '🏪', href: '/catalog' },
        { key: 'test-chat', label: 'Modo prueba', icon: '🧪', href: '/test-chat' },
      ]
    },
    {
      label: 'Cuenta',
      items: [
        { key: 'config', label: 'Configurar bot', icon: '⚙️', href: '/config' },
        { key: 'billing', label: 'Mi plan', icon: '💳', href: '/billing' },
        { key: 'profile', label: 'Mi cuenta', icon: '👤', href: '/profile' },
      ]
    }
  ];

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
                <span className="nav-icon">{item.icon}</span>
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
