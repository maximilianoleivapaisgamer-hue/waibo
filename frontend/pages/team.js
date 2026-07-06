import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Team() {
  const router = useRouter();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [msg, setMsg] = useState(null);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/login'); return; }
    // Empleados no pueden entrar a esta página
    const client = JSON.parse(localStorage.getItem('whabot_client') || '{}');
    if (client.role === 'employee') { router.push('/conversations'); return; }
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/auth/employees`, { headers: headers() });
      setEmployees(r.data);
    } catch { setEmployees([]); }
    setLoading(false);
  }

  async function create(e) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return;
    setCreating(true);
    try {
      await axios.post(`${API}/api/auth/employees`, form, { headers: headers() });
      setMsg({ type: 'ok', text: `✅ Empleado ${form.name} creado. Ya puede iniciar sesión con ${form.email}.` });
      setForm({ name: '', email: '', password: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Error creando empleado' });
    }
    setCreating(false);
  }

  async function remove(id, name) {
    if (!confirm(`¿Eliminar a ${name}? Va a perder acceso al panel.`)) return;
    try {
      await axios.delete(`${API}/api/auth/employees/${id}`, { headers: headers() });
      setEmployees(prev => prev.filter(e => e.id !== id));
      setMsg({ type: 'ok', text: `Empleado ${name} eliminado.` });
    } catch {
      setMsg({ type: 'err', text: 'Error eliminando empleado' });
    }
  }

  return (
    <div className="dashboard">
      <Sidebar active="team" />
      <div className="main-content">

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>👥 Mi equipo</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6B7280' }}>
              Los empleados pueden ver Conversaciones, Pedidos y Agenda — sin acceso a configuración ni facturación.
            </p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setMsg(null); }}
            style={{ padding: '10px 20px', background: '#7C3AED', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            {showForm ? 'Cancelar' : '+ Agregar empleado'}
          </button>
        </div>

        {msg && (
          <div style={{
            background: msg.type === 'ok' ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${msg.type === 'ok' ? '#BBF7D0' : '#FCA5A5'}`,
            color: msg.type === 'ok' ? '#065F46' : '#991B1B',
            borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14
          }}>
            {msg.text}
          </div>
        )}

        {showForm && (
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, padding: '24px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Nuevo empleado</div>
            <form onSubmit={create}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Nombre</label>
                  <input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Juan García"
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="juan@tuempresa.com"
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Contraseña</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                    required
                    minLength={6}
                  />
                </div>
              </div>
              <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
                💡 El empleado va a poder ver <strong>Conversaciones, Pedidos y Agenda</strong> de tu negocio. No va a tener acceso a Configuración, Facturación, Base de conocimiento ni Canales.
              </div>
              <button
                type="submit"
                disabled={creating}
                style={{ padding: '10px 24px', background: '#7C3AED', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                {creating ? 'Creando...' : 'Crear empleado'}
              </button>
            </form>
          </div>
        )}

        <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', fontWeight: 600, fontSize: 14 }}>
            Empleados ({employees.length})
          </div>
          {loading ? (
            <div style={{ padding: 32, color: '#9CA3AF', textAlign: 'center' }}>Cargando...</div>
          ) : employees.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>👤</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Todavía no tenés empleados</div>
              <div style={{ fontSize: 13, color: '#6B7280' }}>Hacé click en "Agregar empleado" para darle acceso a tu equipo.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  {['Nombre', 'Email', 'Acceso', 'Desde', ''].map(h => (
                    <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} style={{ borderTop: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{emp.name}</td>
                    <td style={{ padding: '12px 16px', color: '#6B7280' }}>{emp.email}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>
                        Conversaciones · Pedidos · Agenda
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#9CA3AF' }}>
                      {new Date(emp.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => remove(emp.id, emp.name)}
                        style={{ padding: '5px 12px', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
