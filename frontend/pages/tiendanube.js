import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import ChannelLogo from '../components/ChannelLogo';

const API = process.env.NEXT_PUBLIC_API_URL;

function fmt(n) { return Number(n || 0).toLocaleString('es-AR'); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-AR') : '—'; }

export default function TiendanubePage() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    if (!localStorage.getItem('whabot_token')) { router.push('/login'); return; }
    load();
    if (router.query.tn_connected) setMsg('✅ Tiendanube conectada correctamente');
    if (router.query.tn_error) setMsg('❌ Error al conectar Tiendanube. Intentá de nuevo.');
  }, [router.query]);

  async function load() {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        axios.get(`${API}/api/tiendanube/status`, { headers: headers() }),
        axios.get(`${API}/api/tiendanube/products`, { headers: headers() }).catch(() => ({ data: [] })),
      ]);
      setStatus(s.data);
      setProducts(p.data || []);
    } catch { setStatus(null); }
    setLoading(false);
  }

  async function connect() {
    try {
      const r = await axios.get(`${API}/api/tiendanube/connect`, { headers: headers() });
      window.location.href = r.data.url;
    } catch { setMsg('❌ Error al iniciar la conexión'); }
  }

  async function disconnect() {
    if (!confirm('¿Desconectar Tiendanube?')) return;
    await axios.delete(`${API}/api/tiendanube/disconnect`, { headers: headers() });
    setStatus(null); setProducts([]);
    setMsg('Tiendanube desconectada.');
  }

  async function sync() {
    setSyncing(true);
    try {
      await axios.post(`${API}/api/tiendanube/sync`, {}, { headers: headers() });
      setMsg('✅ Sincronización iniciada. Los productos se actualizarán en unos segundos.');
      setTimeout(load, 3000);
    } catch { setMsg('❌ Error al sincronizar'); }
    setSyncing(false);
  }

  const connected = status?.connected;

  return (
    <div className="dashboard">
      <Sidebar active="tiendanube" />
      <div className="main-content">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <ChannelLogo channel="tiendanube" size={40} style={{ borderRadius: 10 }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Tiendanube</h1>
            <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>Conectá tu tienda y el bot responde con tus productos</p>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: connected ? '#D1FAE5' : '#F3F4F6',
              color: connected ? '#065F46' : '#6B7280',
            }}>
              {connected ? '● Conectado' : '● Sin conectar'}
            </span>
          </div>
        </div>

        {msg && (
          <div style={{ background: msg.includes('❌') ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${msg.includes('❌') ? '#FCA5A5' : '#BBF7D0'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: msg.includes('❌') ? '#991B1B' : '#065F46' }}>
            {msg}
          </div>
        )}

        {loading ? (
          <div style={{ color: '#9CA3AF', padding: 32 }}>Cargando...</div>
        ) : !connected ? (
          /* Estado desconectado — paso a paso */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              {
                n: 1, title: 'Conectá tu tienda Tiendanube',
                desc: 'Hacé click en el botón para autorizar a Waibo a acceder a tu catálogo de productos.',
                content: (
                  <button onClick={connect} style={{ padding: '11px 24px', background: '#2D2DFF', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ChannelLogo channel="tiendanube" size={18} /> Conectar con Tiendanube
                  </button>
                ),
              },
              {
                n: 2, title: 'El bot sincroniza tu catálogo',
                desc: 'Una vez conectado, Waibo importa automáticamente tus productos, precios y stock.',
                content: (
                  <div style={{ fontSize: 13, color: '#6B7280', background: '#F9FAFB', borderRadius: 8, padding: '12px 16px' }}>
                    El bot podrá responder preguntas sobre productos, precios, disponibilidad y ayudar a tus clientes a comprar directamente por WhatsApp o Instagram.
                  </div>
                ),
              },
              {
                n: 3, title: '¡Listo! Tus clientes ya pueden comprar',
                desc: 'El bot detecta cuando alguien quiere comprar y lo guía por el proceso de checkout.',
                content: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {['Responde preguntas sobre productos y precios', 'Muestra disponibilidad de stock en tiempo real', 'Guía al cliente hasta la confirmación de compra', 'Sincroniza cambios de catálogo automáticamente'].map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
                        <span style={{ color: '#7C3AED', fontWeight: 700 }}>✓</span> {f}
                      </div>
                    ))}
                  </div>
                ),
              },
            ].map(step => (
              <div key={step.n} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#7C3AED', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{step.n}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{step.title}</div>
                    <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{step.desc}</div>
                  </div>
                </div>
                <div style={{ padding: '16px 20px' }}>{step.content}</div>
              </div>
            ))}
          </div>
        ) : (
          /* Estado conectado */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Info de la tienda */}
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{status.store_name || 'Mi tienda'}</div>
                  {status.store_url && <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{status.store_url}</div>}
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>Conectada el {fmtDate(status.connected_at)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={sync} disabled={syncing} style={{ padding: '8px 16px', background: '#EDE9FE', color: '#5B21B6', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    {syncing ? 'Sincronizando...' : '↻ Sincronizar'}
                  </button>
                  <button onClick={disconnect} style={{ padding: '8px 16px', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    Desconectar
                  </button>
                </div>
              </div>
            </div>

            {/* Productos */}
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Catálogo sincronizado ({fmt(products.length)} productos)</span>
                <a href="/catalog" style={{ fontSize: 13, color: '#7C3AED', textDecoration: 'none' }}>Ver catálogo completo →</a>
              </div>
              {products.length === 0 ? (
                <div style={{ padding: 24, color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>
                  Sin productos sincronizados. Hacé click en "Sincronizar" para importar tu catálogo.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                      {['Producto', 'Precio', 'Stock', 'URL'].map(h => (
                        <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.slice(0, 20).map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 500 }}>{p.name}</td>
                        <td style={{ padding: '10px 16px', color: '#059669', fontWeight: 600 }}>${fmt(p.price)}</td>
                        <td style={{ padding: '10px 16px', color: p.stock > 0 ? '#374151' : '#DC2626' }}>{p.stock ?? '—'}</td>
                        <td style={{ padding: '10px 16px' }}>
                          {p.url ? <a href={p.url} target="_blank" rel="noreferrer" style={{ color: '#7C3AED', fontSize: 12 }}>Ver →</a> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
