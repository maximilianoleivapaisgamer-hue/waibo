import { useState, useEffect } from 'react';
import axios from 'axios';
import Image from 'next/image';

const API = process.env.NEXT_PUBLIC_API_URL;

function timeAgo(date) {
  if (!date) return '—';
  const mins = Math.floor((new Date() - new Date(date)) / 60000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins}m`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `hace ${hs}h`;
  return `hace ${Math.floor(hs / 24)}d`;
}

function fmt(n) {
  return Number(n || 0).toLocaleString('es-AR');
}

export default function Admin() {
  const [key, setKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState('clients');
  const [stats, setStats] = useState(null);
  const [clients, setClients] = useState([]);
  const [deletions, setDeletions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const headers = { 'x-admin-key': key };

  useEffect(() => {
    const saved = localStorage.getItem('waibo_admin_key');
    if (saved) { setKey(saved); setAuthed(true); }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadAll();
  }, [authed]);

  async function login(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axios.get(`${API}/api/admin/stats`, { headers: { 'x-admin-key': key } });
      localStorage.setItem('waibo_admin_key', key);
      setAuthed(true);
    } catch {
      setError('Clave incorrecta');
    } finally {
      setLoading(false);
    }
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [s, c, d] = await Promise.all([
        axios.get(`${API}/api/admin/stats`, { headers }),
        axios.get(`${API}/api/admin/clients`, { headers }),
        axios.get(`${API}/api/admin/deletion-requests`, { headers }),
      ]);
      setStats(s.data);
      setClients(c.data);
      setDeletions(d.data);
    } catch (err) {
      setError('Error cargando datos');
    } finally {
      setLoading(false);
    }
  }

  async function toggleClient(id, active) {
    const action = active ? 'suspend' : 'activate';
    await axios.post(`${API}/api/admin/clients/${id}/${action}`, {}, { headers });
    setClients(cs => cs.map(c => c.id === id ? { ...c, active: !active, billing_status: active ? 'suspended' : 'active' } : c));
  }

  async function resolveDeletion(id) {
    await axios.put(`${API}/api/admin/deletion-requests/${id}/resolve`, {}, { headers });
    setDeletions(ds => ds.map(d => d.id === id ? { ...d, status: 'processed' } : d));
  }

  function logout() {
    localStorage.removeItem('waibo_admin_key');
    setAuthed(false);
    setKey('');
  }

  const filtered = clients.filter(c =>
    !search || [c.name, c.email, c.business_name].some(f => f?.toLowerCase().includes(search.toLowerCase()))
  );

  const pendingDeletions = deletions.filter(d => d.status === 'pending');

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)' }}>
        <div style={{ background: 'white', borderRadius: 20, padding: 48, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Image src="/waibo-logo.png" alt="Waibo" width={64} height={64} style={{ borderRadius: 16, marginBottom: 12 }} />
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>Panel Admin</h1>
            <p style={{ color: '#6B7280', fontSize: 14, marginTop: 4 }}>Solo para el equipo de Waibo</p>
          </div>
          {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <form onSubmit={login}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Clave de administrador</label>
              <input
                type="password"
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="••••••••••••"
                required
                style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: 13, background: '#7C3AED', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const TABS = [
    { key: 'clients', label: `Clientes (${clients.length})` },
    { key: 'stats', label: 'Métricas' },
    { key: 'deletions', label: `Bajas${pendingDeletions.length ? ` (${pendingDeletions.length} pendientes)` : ''}` },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F7F8FA', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #E5E7EB', padding: '0 32px', display: 'flex', alignItems: 'center', gap: 16, height: 60 }}>
        <Image src="/waibo-logo.png" alt="Waibo" width={28} height={28} style={{ borderRadius: 8 }} />
        <span style={{ fontWeight: 700, fontSize: 16 }}>Waibo Admin</span>
        <div style={{ flex: 1 }} />
        <button onClick={loadAll} style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>↻ Actualizar</button>
        <button onClick={logout} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer' }}>Salir</button>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>

        {/* Stat cards rápidas */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
            {[
              { label: 'Clientes totales', value: fmt(stats.total_clients) },
              { label: 'Clientes activos', value: fmt(stats.active_clients), highlight: true },
              { label: 'Conversaciones', value: fmt(stats.total_conversations) },
              { label: 'Mensajes procesados', value: fmt(stats.total_messages) },
              { label: 'Solicitudes de baja', value: fmt(stats.pending_deletion_requests), warn: stats.pending_deletion_requests > 0 },
              { label: 'MRR estimado', value: `$${fmt(stats.monthly_revenue)}` },
            ].map(s => (
              <div key={s.label} style={{ background: 'white', borderRadius: 12, padding: '18px 20px', border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: s.highlight ? '#7C3AED' : s.warn ? '#DC2626' : '#1A1A2E' }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500,
              background: tab === t.key ? '#7C3AED' : 'white',
              color: tab === t.key ? 'white' : '#6B7280',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
            }}>{t.label}</button>
          ))}
        </div>

        {/* Tab: Clientes */}
        {tab === 'clients' && (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB' }}>
              <input
                placeholder="Buscar por nombre, email o negocio..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '9px 14px', border: '1.5px solid #E5E7EB', borderRadius: 9, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {['Negocio', 'Email', 'Plan', 'Facturación', 'Conversaciones', 'Último acceso', 'Registrado', 'Acción'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{c.business_name || c.name}</div>
                      <div style={{ color: '#9CA3AF', fontSize: 11 }}>{c.phone_number || '—'}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#6B7280' }}>{c.email}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>
                        {c.plan || 'básico'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600,
                        background: c.active ? '#EDE9FE' : '#FEE2E2',
                        color: c.active ? '#5B21B6' : '#DC2626'
                      }}>
                        {c.billing_status || (c.active ? 'activo' : 'suspendido')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#6B7280' }}>{fmt(c.total_conversations)}</td>
                    <td style={{ padding: '12px 16px', color: '#6B7280' }}>{timeAgo(c.last_activity)}</td>
                    <td style={{ padding: '12px 16px', color: '#9CA3AF', fontSize: 12 }}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => toggleClient(c.id, c.active)}
                        style={{
                          padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                          background: c.active ? '#FEE2E2' : '#EDE9FE',
                          color: c.active ? '#DC2626' : '#5B21B6'
                        }}
                      >
                        {c.active ? 'Suspender' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>No hay clientes{search ? ' que coincidan' : ''}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab: Métricas */}
        {tab === 'stats' && stats && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', padding: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Resumen global</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  ['Clientes registrados', fmt(stats.total_clients)],
                  ['Clientes activos', fmt(stats.active_clients)],
                  ['Tasa de activación', `${stats.total_clients > 0 ? Math.round(stats.active_clients / stats.total_clients * 100) : 0}%`],
                  ['Total conversaciones', fmt(stats.total_conversations)],
                  ['Total mensajes procesados', fmt(stats.total_messages)],
                  ['Prom. msgs por conversación', stats.total_conversations > 0 ? fmt(Math.round(stats.total_messages / stats.total_conversations)) : '—'],
                  ['MRR estimado (ARS)', `$${fmt(stats.monthly_revenue)}`],
                  ['Solicitudes de baja pendientes', fmt(stats.pending_deletion_requests)],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: '14px 18px', background: '#F9FAFB', borderRadius: 10 }}>
                    <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Solicitudes de baja */}
        {tab === 'deletions' && (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {['Teléfono', 'Nombre', 'Motivo', 'Fecha', 'Estado', 'Acción'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deletions.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #F3F4F6', opacity: d.status === 'processed' ? 0.5 : 1 }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{d.phone}</td>
                    <td style={{ padding: '12px 16px' }}>{d.name}</td>
                    <td style={{ padding: '12px 16px', color: '#6B7280', maxWidth: 200 }}>{d.reason || '—'}</td>
                    <td style={{ padding: '12px 16px', color: '#9CA3AF', fontSize: 12 }}>
                      {new Date(d.requested_at).toLocaleDateString('es-AR')}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600,
                        background: d.status === 'pending' ? '#FEF3C7' : '#EDE9FE',
                        color: d.status === 'pending' ? '#92400E' : '#5B21B6'
                      }}>
                        {d.status === 'pending' ? 'Pendiente' : 'Procesada'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {d.status === 'pending' && (
                        <button
                          onClick={() => resolveDeletion(d.id)}
                          style={{ padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: '#EDE9FE', color: '#5B21B6' }}
                        >
                          Marcar procesada
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {deletions.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>No hay solicitudes de baja.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
