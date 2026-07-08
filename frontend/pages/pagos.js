import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';

export default function Pagos() {
  const router = useRouter();
  useEffect(() => {
    if (!localStorage.getItem('whabot_token')) router.push('/login');
  }, []);

  return (
    <div className="dashboard">
      <Sidebar active="pagos" />
      <div className="main-content">
        <div className="page-header">
          <h1>💳 Cobros por el bot</h1>
          <p>Configurá cómo tu bot maneja los pagos de tus clientes</p>
        </div>

        {/* Nivel 1 */}
        <div className="card" style={{ borderLeft: '4px solid var(--green)', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Nivel 1 — Datos de pago estáticos</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>El bot comparte tu alias, CBU o link de MP cuando el cliente quiere pagar</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 12px', borderRadius: 20, background: '#D1FAE5', color: '#065F46', fontWeight: 600 }}>Activo</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px' }}>
            Cuando un cliente escribe "quiero pagar", "cómo pago" o similar, el bot responde automáticamente con tus datos de pago. Sin intervención tuya.
          </p>
          <button
            className="btn btn-primary"
            style={{ width: 'auto', padding: '10px 20px' }}
            onClick={() => router.push('/config')}
          >
            ⚙️ Configurar datos de pago
          </button>
        </div>

        {/* Nivel 2 */}
        <div className="card" style={{ borderLeft: '4px solid #F59E0B', opacity: 0.85 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>⚡</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Nivel 2 — Links de pago dinámicos con MercadoPago</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>El bot genera un link de pago con el monto exacto de la compra, en tiempo real</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 12px', borderRadius: 20, background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>Próximamente</span>
          </div>

          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: '#92400E' }}>
            Con esta integración, el bot detecta el monto de la compra y genera un link único de MercadoPago para ese cliente. El comprador paga con tarjeta, débito o saldo MP — y vos recibís la confirmación automáticamente.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {[
              { icon: '🛒', title: 'El cliente dice "quiero comprarlo"', desc: 'El bot detecta la intención de compra y calcula el total' },
              { icon: '🔗', title: 'El bot genera el link al instante', desc: 'Crea una preferencia de pago en MercadoPago con el monto exacto' },
              { icon: '💳', title: 'El cliente paga con cualquier método', desc: 'Tarjeta, débito, saldo MP, cuotas sin interés' },
              { icon: '✅', title: 'Confirmación automática', desc: 'El bot avisa al vendedor y actualiza el estado del pedido' },
            ].map(step => (
              <div key={step.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{step.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{step.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: 14, fontSize: 13, color: '#5B21B6' }}>
            <strong>¿Querés activarlo?</strong> Requiere conectar tu cuenta de MercadoPago como vendedor. Escribinos a <strong>hola@waibochat.com</strong> y te avisamos cuando esté disponible.
          </div>
        </div>
      </div>
    </div>
  );
}
