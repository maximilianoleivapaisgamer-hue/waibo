import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

const STATUS_FLOW = ['pendiente', 'preparando', 'listo', 'entregado'];
const STATUS_LABELS = { pendiente: '🆕 Pendiente', preparando: '👨‍🍳 Preparando', listo: '✅ Listo', entregado: '📦 Entregado', cancelado: '❌ Cancelado' };
const STATUS_COLORS = {
  pendiente: { bg: '#FEF3C7', color: '#92400E' },
  preparando: { bg: '#DBEAFE', color: '#1D4ED8' },
  listo: { bg: '#EDE9FE', color: '#5B21B6' },
  entregado: { bg: '#F3F4F6', color: '#6B7280' },
  cancelado: { bg: '#FEE2E2', color: '#DC2626' },
};

export default function Orders() {
  const router = useRouter();
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [config, setConfig] = useState(null);
  const [newItem, setNewItem] = useState({ name: '', description: '', price: '', category: '' });
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });
  const showSuccess = (m) => { setSuccess(m); setTimeout(() => setSuccess(''), 4000); };
  const showError = (m) => { setError(m); setTimeout(() => setError(''), 4000); };

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/login'); return; }
    loadAll();
    const interval = setInterval(() => loadOrders(), 10000);
    return () => clearInterval(interval);
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ordersRes, menuRes, configRes] = await Promise.all([
        axios.get(`${API}/api/orders`, { headers: getHeaders() }),
        axios.get(`${API}/api/orders/menu`, { headers: getHeaders() }),
        axios.get(`${API}/api/bot/config`, { headers: getHeaders() }),
      ]);
      setOrders(ordersRes.data);
      setMenu(menuRes.data);
      setConfig(configRes.data);
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    const res = await axios.get(`${API}/api/orders`, { headers: getHeaders() });
    setOrders(res.data);
  };

  const toggleOrdersEnabled = async (enabled) => {
    try {
      await axios.put(`${API}/api/bot/config`, { orders_enabled: enabled }, { headers: getHeaders() });
      setConfig({ ...config, orders_enabled: enabled });
      showSuccess(enabled ? '✅ Toma de pedidos activada' : 'Toma de pedidos desactivada');
    } catch { showError('Error guardando configuración'); }
  };

  const addMenuItem = async (e) => {
    e.preventDefault();
    if (!newItem.name || !newItem.price) return;
    try {
      await axios.post(`${API}/api/orders/menu`, newItem, { headers: getHeaders() });
      setNewItem({ name: '', description: '', price: '', category: '' });
      const res = await axios.get(`${API}/api/orders/menu`, { headers: getHeaders() });
      setMenu(res.data);
      showSuccess('✅ Producto agregado al menú');
    } catch { showError('Error agregando producto'); }
  };

  const toggleAvailable = async (item) => {
    await axios.put(`${API}/api/orders/menu/${item.id}`, { available: !item.available }, { headers: getHeaders() });
    setMenu(menu.map(m => m.id === item.id ? { ...m, available: !m.available } : m));
  };

  const deleteMenuItem = async (id) => {
    if (!confirm('¿Eliminar este producto del menú?')) return;
    await axios.delete(`${API}/api/orders/menu/${id}`, { headers: getHeaders() });
    setMenu(menu.filter(m => m.id !== id));
  };

  const advanceOrderStatus = async (order) => {
    const currentIdx = STATUS_FLOW.indexOf(order.status);
    const nextStatus = STATUS_FLOW[currentIdx + 1];
    if (!nextStatus) return;
    const res = await axios.put(`${API}/api/orders/${order.id}/status`, { status: nextStatus }, { headers: getHeaders() });
    setOrders(orders.map(o => o.id === order.id ? res.data : o));
  };

  const cancelOrder = async (order) => {
    if (!confirm('¿Cancelar este pedido?')) return;
    const res = await axios.put(`${API}/api/orders/${order.id}/status`, { status: 'cancelado' }, { headers: getHeaders() });
    setOrders(orders.map(o => o.id === order.id ? res.data : o));
  };

  const activeOrders = orders.filter(o => !['entregado', 'cancelado'].includes(o.status));
  const pastOrders = orders.filter(o => ['entregado', 'cancelado'].includes(o.status));

  if (loading) return (
    <div className="dashboard">
      <Sidebar active="orders" />
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      <Sidebar active="orders" />
      <div className="main-content">
        <div className="page-header">
          <h1>🍕 Pedidos</h1>
          <p>El bot toma pedidos por WhatsApp y los deja listos para preparar</p>
        </div>

        {success && <div className="success-msg">{success}</div>}
        {error && <div className="error-msg">{error}</div>}

        <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${config?.orders_enabled ? 'var(--green)' : '#E5E7EB'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 28 }}>🍕</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>Toma de pedidos por WhatsApp</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {config?.orders_enabled ? 'Activado — el bot identifica productos y cantidades automáticamente' : 'Desactivado — activalo para que el bot empiece a tomar pedidos estructurados'}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={config?.orders_enabled ?? false} onChange={e => toggleOrdersEnabled(e.target.checked)} style={{ width: 'auto' }} />
              <span style={{ fontSize: 13 }}>{config?.orders_enabled ? 'Activado' : 'Desactivado'}</span>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { key: 'orders', label: `📋 Pedidos activos (${activeOrders.length})` },
            { key: 'history', label: `📜 Historial (${pastOrders.length})` },
            { key: 'menu', label: `🍽 Menú (${menu.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: 'auto', padding: '8px 18px', fontSize: 13 }}>
              {t.label}
            </button>
          ))}
        </div>

        {(tab === 'orders' || tab === 'history') && (
          <div>
            {(tab === 'orders' ? activeOrders : pastOrders).length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                  {tab === 'orders' ? 'No hay pedidos activos en este momento.' : 'Todavía no hay pedidos en el historial.'}
                </p>
              </div>
            ) : (tab === 'orders' ? activeOrders : pastOrders).map(order => (
              <div key={order.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{order.customer_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>📞 {order.customer_phone} · {order.delivery_type === 'delivery' ? `🛵 Delivery — ${order.delivery_address}` : '🏪 Retiro en local'}</div>
                  </div>
                  <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600, background: STATUS_COLORS[order.status]?.bg, color: STATUS_COLORS[order.status]?.color }}>
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>

                <div style={{ background: 'var(--bg)', borderRadius: 9, padding: 12, marginBottom: 10 }}>
                  {(order.items || []).map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                      <span><strong>{item.quantity}x</strong> {item.name}</span>
                      <span>{item.subtotal ? `$${item.subtotal.toLocaleString('es-AR')}` : '—'}</span>
                    </div>
                  ))}
                  {order.total > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      <span>Total</span>
                      <span>${Number(order.total).toLocaleString('es-AR')}</span>
                    </div>
                  )}
                </div>

                {order.notes && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>📝 {order.notes}</div>
                )}

                {tab === 'orders' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {STATUS_FLOW.indexOf(order.status) < STATUS_FLOW.length - 1 && (
                      <button onClick={() => advanceOrderStatus(order)} className="btn btn-primary" style={{ width: 'auto', fontSize: 12, padding: '7px 14px' }}>
                        Marcar como "{STATUS_LABELS[STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1]]}"
                      </button>
                    )}
                    <button onClick={() => cancelOrder(order)} className="btn btn-secondary" style={{ width: 'auto', fontSize: 12, padding: '7px 14px', color: '#DC2626' }}>
                      Cancelar
                    </button>
                  </div>
                )}

                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                  {new Date(order.created_at).toLocaleString('es-AR')}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'menu' && (
          <div>
            <div className="card">
              <div className="card-title">➕ Agregar producto al menú</div>
              <form onSubmit={addMenuItem}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Nombre</label>
                    <input placeholder="Pizza Muzzarella" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Precio</label>
                    <input type="number" placeholder="3800" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Categoría</label>
                    <input placeholder="Pizzas" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label>Descripción (opcional)</label>
                  <input placeholder="Muzzarella, salsa de tomate, orégano" value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} />
                </div>
                <button className="btn btn-primary" type="submit" style={{ width: 'auto', marginTop: 12, padding: '10px 24px' }}>
                  ➕ Agregar
                </button>
              </form>
            </div>

            <div className="card">
              <div className="card-title">Productos del menú</div>
              {menu.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
                  Todavía no agregaste productos. El bot necesita el menú cargado para poder tomar pedidos.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {menu.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)', opacity: item.available ? 1 : 0.5 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name} {item.category && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {item.category}</span>}</div>
                        {item.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.description}</div>}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>${Number(item.price).toLocaleString('es-AR')}</div>
                      <button onClick={() => toggleAvailable(item)} className="btn btn-secondary" style={{ width: 'auto', fontSize: 11, padding: '5px 10px' }}>
                        {item.available ? '✅ Disponible' : '⛔ Sin stock'}
                      </button>
                      <button onClick={() => deleteMenuItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 16 }}>🗑</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
