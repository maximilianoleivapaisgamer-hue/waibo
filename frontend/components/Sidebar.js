import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import axios from 'axios';
import ChannelLogo from './ChannelLogo';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Sidebar({ active }) {
  const router = useRouter();
  const [trial, setTrial] = useState(null);
  const isEmployee = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('whabot_client') || '{}').role === 'employee'
    : false;

  useEffect(() => {
    if (isEmployee) return;
    const token = localStorage.getItem('whabot_token');
    if (!token) return;
    axios.get(`${API}/api/bot/trial`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (r.data.in_trial) setTrial(r.data); })
      .catch(() => {});
  }, []);

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
      {trial && (
        <div
          onClick={() => router.push('/billing')}
          style={{
            margin: '8px 10px', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
            background: trial.expired ? '#FEE2E2' : trial.ending_soon ? '#FEF3C7' : '#EDE9FE',
            border: `1px solid ${trial.expired ? '#FECACA' : trial.ending_soon ? '#FDE68A' : '#DDD6FE'}`,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: trial.expired ? '#DC2626' : trial.ending_soon ? '#92400E' : '#5B21B6', marginBottom: 3 }}>
            {trial.expired ? '🔴 Prueba vencida' : `🕐 Prueba: ${trial.days_left} día${trial.days_left !== 1 ? 's' : ''} restante${trial.days_left !== 1 ? 's' : ''}`}
          </div>
          <div style={{ fontSize: 10, color: trial.expired ? '#DC2626' : '#6B7280' }}>
            {trial.expired ? 'Activá tu plan →' : 'Clic para ver planes →'}
          </div>
        </div>
      )}
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={logout}>
          <span className="nav-icon">🚪</span>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
