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

function fmt(n) { return Number(n || 0).toLocaleString('es-AR'); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-AR') : '—'; }
function fmtMoney(n) { return `$${fmt(n)}`; }

const CHANNEL_COLORS = {
  whatsapp: '#25D366', instagram: '#E1306C', facebook: '#1877F2',
  mercadolibre: '#FFE600', tiendanube: '#2D2DFF', tiktok: '#010101',
};
const CHANNEL_LABELS = {
  whatsapp: 'WA', instagram: 'IG', facebook: 'FB',
  mercadolibre: 'ML', tiendanube: 'TN', tiktok: 'TT',
};

function ChannelDot({ channel, active }) {
  return (
    <span title={channel} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, borderRadius: 6, fontSize: 9, fontWeight: 700,
      background: active ? CHANNEL_COLORS[channel] : '#F3F4F6',
      color: active ? (channel === 'mercadolibre' ? '#333' : 'white') : '#9CA3AF',
    }}>{CHANNEL_LABELS[channel]}</span>
  );
}

function StatCard({ label, value, sub, color, small }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, padding: small ? '14px 16px' : '18px 20px', border: '1px solid #E5E7EB' }}>
      <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: small ? 22 : 28, fontWeight: 700, marginTop: 4, color: color || '#1A1A2E' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function Admin() {
  const [key, setKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState('clients');
  const [stats, setStats] = useState(null);
  const [clients, setClients] = useState([]);
  const [deletions, setDeletions] = useState([]);
  const [activity, setActivity] = useState(null);
  const [health, setHealth] = useState(null);
  const [growth, setGrowth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [planModal, setPlanModal] = useState(null); // { id, name, plan, amount, next_due }
  const [savingPlan, setSavingPlan] = useState(false);

  const PLANS = [
    { key: 'estandar', label: 'Estándar', amount: 59999 },
    { key: 'ecommerce_pro', label: 'E-Commerce Pro', amount: 129999 },
  ];

  const headers = { 'x-admin-key': key };

  useEffect(() => {
    const saved = localStorage.getItem('waibo_admin_key');
    if (saved) { setKey(saved); setAuthed(true); }
  }, []);

  useEffect(() => { if (authed) loadAll(); }, [authed]);

  async function login(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await axios.get(`${API}/api/admin/stats`, { headers: { 'x-admin-key': key } });
      localStorage.setItem('waibo_admin_key', key);
      setAuthed(true);
    } catch { setError('Clave incorrecta'); }
    finally { setLoading(false); }
  }

  async function loadAll() {
    setLoading(true);
    setError('');
    const h = { 'x-admin-key': key || localStorage.getItem('waibo_admin_key') };
    const safe = async (fn) => { try { return await fn(); } catch(e) { return null; } };
    const [s, c, d, a, hl, gr] = await Promise.all([
      safe(() => axios.get(`${API}/api/admin/stats`, { headers: h })),
      safe(() => axios.get(`${API}/api/admin/clients`, { headers: h })),
      safe(() => axios.get(`${API}/api/admin/deletion-requests`, { headers: h })),
      safe(() => axios.get(`${API}/api/admin/activity`, { headers: h })),
      safe(() => axios.get(`${API}/api/admin/health`, { headers: h })),
      safe(() => axios.get(`${API}/api/admin/growth`, { headers: h })),
    ]);
    if (s) setStats(s.data); else setError('Error cargando stats');
    if (c) setClients(c.data); else setError(e => e || 'Error cargando clientes');
    if (d) setDeletions(d.data);
    if (a) setActivity(a.data);
    if (hl) setHealth(hl.data);
    if (gr) setGrowth(gr.data);
    setLoading(false);
  }

  async function toggleClient(id, active) {
    await axios.post(`${API}/api/admin/clients/${id}/${active ? 'suspend' : 'activate'}`, {}, { headers });
    setClients(cs => cs.map(c => c.id === id ? { ...c, active: !active, billing_status: active ? 'suspended' : 'active' } : c));
  }

  async function notifyPayment(id, email) {
    if (!confirm(`¿Enviar aviso de cobro a ${email}?`)) return;
    try {
      await axios.post(`${API}/api/admin/clients/${id}/notify-payment`, {}, { headers });
      alert(`✅ Aviso enviado a ${email}`);
    } catch (e) {
      alert('Error al enviar: ' + (e.response?.data?.error || e.message));
    }
  }

  async function savePlan() {
    if (!planModal) return;
    setSavingPlan(true);
    try {
      await axios.put(`${API}/api/admin/clients/${planModal.id}/plan`, {
        plan: planModal.plan,
        amount: planModal.amount ? parseFloat(planModal.amount) : null,
        next_due: planModal.next_due || null,
      }, { headers });
      setClients(cs => cs.map(c => c.id === planModal.id
        ? { ...c, plan: planModal.plan, amount: planModal.amount, next_due: planModal.next_due }
        : c));
      setPlanModal(null);
    } catch (e) {
      alert('Error al guardar: ' + (e.response?.data?.error || e.message));
    } finally {
      setSavingPlan(false);
    }
  }

  async function resolveDeletion(id) {
    await axios.put(`${API}/api/admin/deletion-requests/${id}/resolve`, {}, { headers });
    setDeletions(ds => ds.map(d => d.id === id ? { ...d, status: 'processed' } : d));
  }

  const filtered = clients.filter(c => {
    const matchSearch = !search || [c.name, c.email, c.business_name].some(f => f?.toLowerCase().includes(search.toLowerCase()));
    const inTrial = c.trial_ends_at && new Date(c.trial_ends_at) > new Date() && !['estandar','ecommerce_pro'].includes(c.plan);
    const matchStatus = filterStatus === 'all'
      || (filterStatus === 'active' && c.active)
      || (filterStatus === 'suspended' && !c.active)
      || (filterStatus === 'trial' && inTrial);
    return matchSearch && matchStatus;
  });

  const pendingDeletions = deletions.filter(d => d.status === 'pending').length;
  const healthIssues = health ? (health.no_channels.length + health.no_activity_7d.length + health.no_bot_config.length) : 0;

  const TABS = [
    { key: 'clients', label: `👥 Clientes (${clients.length})` },
    { key: 'plans', label: '💳 Planes' },
    { key: 'activity', label: '📡 Actividad' },
    { key: 'health', label: `🏥 Salud${healthIssues ? ` (${healthIssues})` : ''}` },
    { key: 'stats', label: '📊 Métricas' },
    { key: 'deletions', label: `🗑 Bajas${pendingDeletions ? ` (${pendingDeletions})` : ''}` },
  ];

  // LOGIN
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
        <div style={{ background: 'white', borderRadius: 20, padding: 48, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Image src="/waibo-logo.png" alt="Waibo" width={64} height={64} style={{ borderRadius: 16, marginBottom: 12 }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Panel Admin</h1>
            <p style={{ color: '#6B7280', fontSize: 14, marginTop: 4 }}>Solo para el equipo de Waibo</p>
          </div>
          {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <form onSubmit={login}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Clave de administrador</label>
            <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="••••••••••••" required
              style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: 13, background: '#7C3AED', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F8FA', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: '#1A1A2E' }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #E5E7EB', padding: '0 28px', display: 'flex', alignItems: 'center', gap: 14, height: 58, position: 'sticky', top: 0, zIndex: 100 }}>
        <Image src="/waibo-logo.png" alt="Waibo" width={26} height={26} style={{ borderRadius: 7 }} />
        <span style={{ fontWeight: 700, fontSize: 16 }}>Waibo Admin</span>
        {loading && <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 8 }}>Cargando...</span>}
        {error && <span style={{ fontSize: 12, color: '#DC2626', marginLeft: 8 }}>⚠️ {error}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={loadAll} style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#6B7280' }}>↻ Actualizar</button>
        <button onClick={() => { localStorage.removeItem('waibo_admin_key'); setAuthed(false); setKey(''); }}
          style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer' }}>Salir</button>
      </div>

      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 20px' }}>

        {/* Stat cards principales */}
        {stats && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
              <StatCard label="Clientes activos" value={fmt(stats.active_clients)} sub={`de ${fmt(stats.total_clients)} totales`} color="#7C3AED" />
              <StatCard label="Nuevos esta semana" value={fmt(stats.new_clients_week)} sub={`${fmt(stats.new_clients_month)} este mes`} color="#7C3AED" />
              <StatCard label="Churn rate" value={`${stats.churn_rate}%`} sub={`${fmt(stats.suspended_clients)} suspendidos`} color={stats.churn_rate > 20 ? '#DC2626' : '#1A1A2E'} />
              <StatCard label="MRR estimado" value={fmtMoney(stats.monthly_revenue)} sub="ARS mensual" color="#059669" />
              <StatCard label="Msgs hoy" value={fmt(stats.messages_today)} sub={`${fmt(stats.messages_week)} esta semana`} />
              <StatCard label="Msgs este mes" value={fmt(stats.messages_month)} sub={`${fmt(stats.total_messages)} histórico`} />
              <StatCard label="Convs hoy" value={fmt(stats.conversations_today)} sub={`${fmt(stats.conversations_week)} esta semana`} />
              <StatCard label="Convs este mes" value={fmt(stats.conversations_month)} sub={`${fmt(stats.total_conversations)} históricas`} />
            </div>

            {/* Canal más usado */}
            {stats.channel_distribution?.length > 0 && (
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#6B7280' }}>Distribución de canales:</span>
                {stats.channel_distribution.map(ch => {
                  const total = stats.channel_distribution.reduce((a, b) => a + parseInt(b.count), 0);
                  const pct = total > 0 ? Math.round(parseInt(ch.count) / total * 100) : 0;
                  return (
                    <div key={ch.channel} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <ChannelDot channel={ch.channel} active />
                      <span style={{ fontSize: 13 }}>{ch.channel}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#5B21B6' }}>{pct}%</span>
                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>({fmt(ch.count)})</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              background: tab === t.key ? '#7C3AED' : 'white',
              color: tab === t.key ? 'white' : '#6B7280',
              boxShadow: '0 1px 3px rgba(0,0,0,0.07)'
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── TAB CLIENTES ── */}
        {tab === 'clients' && (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input placeholder="Buscar por nombre, email o negocio..."
                value={search} onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }} />
              {['all', 'active', 'trial', 'suspended'].map(f => (
                <button key={f} onClick={() => setFilterStatus(f)} style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: filterStatus === f ? '#7C3AED' : '#F3F4F6',
                  color: filterStatus === f ? 'white' : '#6B7280', fontWeight: 500
                }}>{{ all: 'Todos', active: 'Activos', trial: '🕐 En prueba', suspended: 'Suspendidos' }[f]}</button>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    {['Negocio', 'Email', 'Canales', 'Plan / Billing', 'Trial', 'Actividad', 'Msgs mes', 'Bot', 'Próx. venc.', 'Alertas', 'Registrado', ''].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6', background: c.active ? 'white' : '#FFFBFB' }}>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{c.business_name || c.name}</div>
                        <div style={{ color: '#9CA3AF', fontSize: 11 }}>{c.phone_number || '—'}</div>
                      </td>
                      <td style={{ padding: '11px 14px', color: '#6B7280', fontSize: 12 }}>{c.email}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          <ChannelDot channel="whatsapp" active={!!(c.has_whatsapp_qr || c.whatsapp_api_key)} />
                          <ChannelDot channel="instagram" active={c.has_instagram} />
                          <ChannelDot channel="facebook" active={c.has_facebook} />
                          <ChannelDot channel="mercadolibre" active={c.has_ml} />
                          <ChannelDot channel="tiendanube" active={c.has_tiendanube} />
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>{c.plan || 'básico'}</span>
                          <button onClick={() => setPlanModal({ id: c.id, name: c.business_name || c.name, plan: c.plan || 'estandar', amount: c.amount || '', next_due: c.next_due ? c.next_due.slice(0,10) : '' })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#9CA3AF', padding: 0 }} title="Editar plan">✏️</button>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                            background: c.active ? '#D1FAE5' : '#FEE2E2',
                            color: c.active ? '#065F46' : '#DC2626'
                          }}>{c.billing_status || (c.active ? 'activo' : 'suspendido')}</span>
                        </div>
                        {c.amount && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{fmtMoney(c.amount)}/mes</div>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 11 }}>
                        {c.trial_ends_at ? (() => {
                          const days = Math.ceil((new Date(c.trial_ends_at) - new Date()) / 86400000);
                          const expired = days <= 0;
                          return (
                            <span style={{ padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                              background: expired ? '#FEE2E2' : days <= 3 ? '#FEF3C7' : '#EDE9FE',
                              color: expired ? '#DC2626' : days <= 3 ? '#92400E' : '#5B21B6' }}>
                              {expired ? 'Venció' : `${days}d`}
                            </span>
                          );
                        })() : <span style={{ color: '#9CA3AF' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px', color: '#6B7280', fontSize: 12 }}>
                        <div>{fmt(c.total_conversations)} convs</div>
                        <div style={{ color: '#9CA3AF' }}>{timeAgo(c.last_activity)}</div>
                      </td>
                      <td style={{ padding: '11px 14px', fontWeight: 600, color: parseInt(c.msgs_this_month) > 0 ? '#5B21B6' : '#9CA3AF' }}>
                        {fmt(c.msgs_this_month)}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span>{c.bot_configured ? '✅ Prompt' : '⚠️ Sin prompt'}</span>
                          <span style={{ color: '#9CA3AF' }}>{fmt(c.knowledge_entries)} docs</span>
                          <span style={{ color: '#9CA3AF' }}>{c.has_tested_bot ? '✅ Probado' : '—'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: c.next_due && new Date(c.next_due) < new Date() ? '#DC2626' : '#6B7280' }}>
                        {fmtDate(c.next_due)}
                        {c.last_payment && <div style={{ color: '#9CA3AF' }}>Últ. pago: {fmtDate(c.last_payment)}</div>}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        {parseInt(c.open_alerts) > 0
                          ? <span style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>🔔 {c.open_alerts}</span>
                          : <span style={{ color: '#9CA3AF', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px', color: '#9CA3AF', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(c.created_at)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <button onClick={() => toggleClient(c.id, c.active)} style={{
                            padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                            background: c.active ? '#FEE2E2' : '#EDE9FE',
                            color: c.active ? '#DC2626' : '#5B21B6'
                          }}>{c.active ? 'Suspender' : 'Activar'}</button>
                          <button onClick={() => notifyPayment(c.id, c.email)} style={{
                            padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                            background: '#FEF3C7', color: '#92400E'
                          }}>✉️ Avisar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>No hay clientes{search ? ' que coincidan' : ''}.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB PLANES ── */}
        {tab === 'plans' && (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>💳 Gestión de planes por cliente</span>
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>Hacé clic en ✏️ para editar</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    {['Negocio', 'Email', 'Plan actual', 'Monto/mes', 'Estado billing', 'Próx. vencimiento', 'Últ. pago', ''].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6', background: c.active ? 'white' : '#FFFBFB' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 600 }}>{c.business_name || c.name}</td>
                      <td style={{ padding: '11px 14px', color: '#6B7280', fontSize: 12 }}>{c.email}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>
                          {PLANS.find(p => p.key === c.plan)?.label || c.plan || 'básico'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', fontWeight: 600, color: c.amount ? '#059669' : '#9CA3AF' }}>
                        {c.amount ? fmtMoney(c.amount) : '—'}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                          background: c.billing_status === 'active' ? '#D1FAE5' : c.billing_status === 'suspended' ? '#FEE2E2' : '#FEF3C7',
                          color: c.billing_status === 'active' ? '#065F46' : c.billing_status === 'suspended' ? '#DC2626' : '#92400E',
                        }}>{c.billing_status || '—'}</span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: c.next_due && new Date(c.next_due) < new Date() ? '#DC2626' : '#6B7280' }}>
                        {fmtDate(c.next_due)}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#9CA3AF' }}>{fmtDate(c.last_payment)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <button onClick={() => setPlanModal({ id: c.id, name: c.business_name || c.name, plan: c.plan || 'estandar', amount: c.amount || '', next_due: c.next_due ? c.next_due.slice(0,10) : '' })}
                          style={{ padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: '#EDE9FE', color: '#5B21B6' }}>
                          ✏️ Editar plan
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB ACTIVIDAD ── */}
        {tab === 'activity' && activity && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
            {/* Conversaciones recientes */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', fontWeight: 600, fontSize: 14 }}>📡 Últimas 30 conversaciones — toda la plataforma</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    {['Canal', 'Cliente final', 'Negocio', 'Estado', 'Mensajes', 'Última actividad'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.recent_conversations.map(cv => (
                    <tr key={cv.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '10px 14px' }}><ChannelDot channel={cv.channel} active /></td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 500 }}>{cv.customer_name || cv.customer_phone}</div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{cv.customer_phone}</div>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#6B7280' }}>{cv.business_name || cv.client_name}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: cv.status === 'bot' ? '#EDE9FE' : '#FEF3C7', color: cv.status === 'bot' ? '#5B21B6' : '#92400E' }}>
                          {cv.status === 'bot' ? '🤖 Bot' : '👤 Humano'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#6B7280' }}>{fmt(cv.message_count)}</td>
                      <td style={{ padding: '10px 14px', color: '#9CA3AF', fontSize: 12 }}>{timeAgo(cv.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Nuevos registros */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', fontWeight: 600, fontSize: 14 }}>🆕 Últimos registros</div>
              {activity.recent_registrations.map(c => (
                <div key={c.id} style={{ padding: '12px 18px', borderBottom: '1px solid #F3F4F6' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.business_name || c.name}</div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>{c.email}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>{c.plan || 'básico'}</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{timeAgo(c.created_at)}</span>
                  </div>
                </div>
              ))}
              {activity.recent_registrations.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Sin registros recientes.</div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB SALUD ── */}
        {tab === 'health' && health && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              {
                icon: '📡', title: `Sin canal conectado (${health.no_channels.length})`,
                desc: 'Clientes activos que nunca conectaron ningún canal. Pueden necesitar ayuda para arrancar.',
                list: health.no_channels, color: '#DC2626', bg: '#FEF2F2',
              },
              {
                icon: '😴', title: `Sin actividad en +7 días (${health.no_activity_7d.length})`,
                desc: 'Clientes activos sin conversaciones recientes. Alto riesgo de cancelación.',
                list: health.no_activity_7d, color: '#D97706', bg: '#FFFBEB',
                extra: c => c.last_activity ? `Última actividad: ${timeAgo(c.last_activity)}` : 'Nunca tuvieron actividad',
              },
              {
                icon: '🤖', title: `Bot sin configurar (${health.no_bot_config.length})`,
                desc: 'Clientes que nunca cargaron un prompt útil para el bot.',
                list: health.no_bot_config, color: '#7C3AED', bg: '#F5F3FF',
              },
            ].map(section => (
              <div key={section.title} style={{ background: 'white', borderRadius: 12, border: `1px solid #E5E7EB`, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', background: section.bg, borderBottom: '1px solid #E5E7EB' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: section.color }}>{section.icon} {section.title}</div>
                  <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{section.desc}</div>
                </div>
                {section.list.length === 0 ? (
                  <div style={{ padding: '20px 20px', color: '#6B7280', fontSize: 13 }}>✅ Ningún cliente en esta categoría.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                        {['Negocio', 'Email', 'Info', 'Registrado'].map(h => (
                          <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.list.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{c.business_name || c.name}</td>
                          <td style={{ padding: '10px 14px', color: '#6B7280' }}>{c.email}</td>
                          <td style={{ padding: '10px 14px', color: '#9CA3AF', fontSize: 12 }}>
                            {section.extra ? section.extra(c) : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#9CA3AF', fontSize: 12 }}>{fmtDate(c.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── TAB MÉTRICAS ── */}
        {tab === 'stats' && stats && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>👥 Clientes</div>
              {[
                ['Total registrados', fmt(stats.total_clients)],
                ['Activos', fmt(stats.active_clients)],
                ['Suspendidos', fmt(stats.suspended_clients)],
                ['Nuevos esta semana', fmt(stats.new_clients_week)],
                ['Nuevos este mes', fmt(stats.new_clients_month)],
                ['Churn rate', `${stats.churn_rate}%`],
                ['Tasa de activación', `${stats.total_clients > 0 ? Math.round(stats.active_clients / stats.total_clients * 100) : 0}%`],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F3F4F6', fontSize: 14 }}>
                  <span style={{ color: '#6B7280' }}>{l}</span>
                  <span style={{ fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>💬 Mensajes y conversaciones</div>
              {[
                ['Conversaciones hoy', fmt(stats.conversations_today)],
                ['Conversaciones esta semana', fmt(stats.conversations_week)],
                ['Conversaciones este mes', fmt(stats.conversations_month)],
                ['Total histórico', fmt(stats.total_conversations)],
                ['Mensajes hoy', fmt(stats.messages_today)],
                ['Mensajes esta semana', fmt(stats.messages_week)],
                ['Mensajes este mes', fmt(stats.messages_month)],
                ['Total mensajes histórico', fmt(stats.total_messages)],
                ['Prom. msgs/conversación', stats.total_conversations > 0 ? fmt(Math.round(stats.total_messages / stats.total_conversations)) : '—'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F3F4F6', fontSize: 14 }}>
                  <span style={{ color: '#6B7280' }}>{l}</span>
                  <span style={{ fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>💰 Facturación</div>
              {[
                ['MRR estimado (ARS)', fmtMoney(stats.monthly_revenue)],
                ['Solicitudes de baja pendientes', fmt(stats.pending_deletion_requests)],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F3F4F6', fontSize: 14 }}>
                  <span style={{ color: '#6B7280' }}>{l}</span>
                  <span style={{ fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
            {growth && (
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24, gridColumn: '1 / -1' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>📈 Crecimiento — últimos 6 meses</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                  {/* Nuevos clientes */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 12 }}>Nuevos clientes por mes</div>
                    {growth.client_growth.length === 0
                      ? <p style={{ color: '#9CA3AF', fontSize: 13 }}>Sin datos aún</p>
                      : (() => {
                          const max = Math.max(...growth.client_growth.map(r => parseInt(r.new_clients)), 1);
                          return growth.client_growth.map(r => (
                            <div key={r.month} style={{ marginBottom: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                <span style={{ color: '#6B7280' }}>{r.month}</span>
                                <span style={{ fontWeight: 700 }}>{r.new_clients} clientes</span>
                              </div>
                              <div style={{ height: 8, borderRadius: 4, background: '#F3F4F6' }}>
                                <div style={{ height: '100%', width: `${Math.round(parseInt(r.new_clients) / max * 100)}%`, background: '#7C3AED', borderRadius: 4 }} />
                              </div>
                            </div>
                          ));
                        })()
                    }
                  </div>
                  {/* Revenue por mes */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 12 }}>Revenue cobrado por mes (ARS)</div>
                    {growth.revenue_by_month.length === 0
                      ? <p style={{ color: '#9CA3AF', fontSize: 13 }}>Sin pagos registrados aún</p>
                      : (() => {
                          const max = Math.max(...growth.revenue_by_month.map(r => parseFloat(r.revenue)), 1);
                          return growth.revenue_by_month.map(r => (
                            <div key={r.month} style={{ marginBottom: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                <span style={{ color: '#6B7280' }}>{r.month}</span>
                                <span style={{ fontWeight: 700 }}>{fmtMoney(r.revenue)} <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({r.paying_clients} clientes)</span></span>
                              </div>
                              <div style={{ height: 8, borderRadius: 4, background: '#F3F4F6' }}>
                                <div style={{ height: '100%', width: `${Math.round(parseFloat(r.revenue) / max * 100)}%`, background: '#059669', borderRadius: 4 }} />
                              </div>
                            </div>
                          ));
                        })()
                    }
                  </div>
                </div>
              </div>
            )}

            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>📡 Canales más usados</div>
              {stats.channel_distribution.map(ch => {
                const total = stats.channel_distribution.reduce((a, b) => a + parseInt(b.count), 0);
                const pct = total > 0 ? Math.round(parseInt(ch.count) / total * 100) : 0;
                return (
                  <div key={ch.channel} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ChannelDot channel={ch.channel} active />{ch.channel}
                      </span>
                      <span style={{ fontWeight: 700 }}>{pct}% <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({fmt(ch.count)})</span></span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: '#F3F4F6', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: CHANNEL_COLORS[ch.channel] || '#7C3AED', borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB BAJAS ── */}
        {tab === 'deletions' && (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Solicitudes de eliminación de datos (Ley 25.326)</span>
              {pendingDeletions > 0 && <span style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>{pendingDeletions} pendientes</span>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {['Teléfono', 'Nombre', 'Motivo', 'Fecha solicitud', 'Estado', 'Procesada el', ''].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deletions.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #F3F4F6', opacity: d.status === 'processed' ? 0.5 : 1 }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600 }}>{d.phone}</td>
                    <td style={{ padding: '11px 14px' }}>{d.name}</td>
                    <td style={{ padding: '11px 14px', color: '#6B7280', maxWidth: 220 }}>{d.reason || '—'}</td>
                    <td style={{ padding: '11px 14px', color: '#9CA3AF', fontSize: 12 }}>{fmtDate(d.requested_at)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600,
                        background: d.status === 'pending' ? '#FEF3C7' : '#EDE9FE',
                        color: d.status === 'pending' ? '#92400E' : '#5B21B6'
                      }}>{d.status === 'pending' ? '⏳ Pendiente' : '✅ Procesada'}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: '#9CA3AF', fontSize: 12 }}>{fmtDate(d.processed_at)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      {d.status === 'pending' && (
                        <button onClick={() => resolveDeletion(d.id)} style={{
                          padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                          background: '#EDE9FE', color: '#5B21B6'
                        }}>Marcar procesada</button>
                      )}
                    </td>
                  </tr>
                ))}
                {deletions.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>No hay solicitudes de baja.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL EDITAR PLAN ── */}
      {planModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 32, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>✏️ Editar plan</h2>
            <p style={{ margin: '0 0 24px', color: '#6B7280', fontSize: 14 }}>{planModal.name}</p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Plan</label>
              <select value={planModal.plan} onChange={e => {
                const p = PLANS.find(pl => pl.key === e.target.value);
                setPlanModal(m => ({ ...m, plan: e.target.value, amount: p ? p.amount : m.amount }));
              }} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14 }}>
                {PLANS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                <option value="custom">Personalizado</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Monto mensual (ARS)</label>
              <input type="number" value={planModal.amount} onChange={e => setPlanModal(m => ({ ...m, amount: e.target.value }))}
                placeholder="Ej: 59999"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Próximo vencimiento</label>
              <input type="date" value={planModal.next_due} onChange={e => setPlanModal(m => ({ ...m, next_due: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={savePlan} disabled={savingPlan} style={{
                flex: 1, padding: 12, background: '#7C3AED', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer'
              }}>{savingPlan ? 'Guardando...' : 'Guardar cambios'}</button>
              <button onClick={() => setPlanModal(null)} style={{
                padding: 12, background: '#F3F4F6', color: '#6B7280', border: 'none', borderRadius: 10, fontSize: 15, cursor: 'pointer'
              }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
