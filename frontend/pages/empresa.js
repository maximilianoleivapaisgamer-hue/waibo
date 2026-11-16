import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

// Waibo Empresa: panel simple para manejar las líneas de WhatsApp, el equipo de ventas y
// soporte, y ver cómo viene el día. Lo demás (bot, Instagram) queda como opcional.

const ESTADO = {
  connected: { t: 'Conectada', c: 'ok' },
  connecting: { t: 'Conectando…', c: 'medio' },
  starting: { t: 'Arrancando…', c: 'medio' },
  qr_ready: { t: 'Esperando que escanees el QR', c: 'medio' },
  disconnected: { t: 'Desconectada', c: 'mal' },
  service_down: { t: 'El programa de WhatsApp no responde', c: 'mal' },
  auth_failure: { t: 'WhatsApp rechazó la sesión', c: 'mal' }
};

function Resumen({ lineas, chats, equipo }) {
  const ahora = Date.now();
  const dia = 24 * 3600 * 1000;
  const sinContestar = chats.filter(c => c.last_message_role === 'user');
  const calientes = chats.filter(c => c.heat === 'caliente');
  const vencidos = chats.filter(c => c.follow_up_at && new Date(c.follow_up_at).getTime() <= ahora);
  const hoy = chats.filter(c => c.last_message_at && ahora - new Date(c.last_message_at).getTime() < dia);
  const porVendedor = equipo.map(e => {
    const suyos = chats.filter(c => c.assigned_to === e.id);
    return { ...e, total: suyos.length, sinContestar: suyos.filter(c => c.last_message_role === 'user').length, calientes: suyos.filter(c => c.heat === 'caliente').length };
  });
  const sinAsignar = chats.filter(c => !c.assigned_to && c.status === 'human').length;

  const tarjeta = (n, t, href, color) => (
    <a className="emp-num" href={href} style={{ borderColor: color }}>
      <div className="emp-num-n" style={{ color }}>{n}</div>
      <div className="emp-num-t">{t}</div>
    </a>
  );

  return (
    <>
      <div className="emp-nums">
        {tarjeta(hoy.length, 'Chats con movimiento hoy', '/inbox', '#00a884')}
        {tarjeta(sinContestar.length, 'Esperando respuesta', '/inbox', '#d97706')}
        {tarjeta(calientes.length, '🔥 Calientes', '/inbox', '#dc2626')}
        {tarjeta(vencidos.length, '⏰ Seguimientos vencidos', '/inbox', '#7c3aed')}
      </div>

      <div className="emp-grid">
        <section className="emp-card">
          <h3>Líneas</h3>
          {lineas.map(l => {
            const e = ESTADO[l.status] || { t: l.status, c: 'medio' };
            return (
              <div key={l.id} className="emp-fila">
                <span className={`emp-punto ${e.c}`} />
                <div style={{ flex: 1 }}>
                  <div className="emp-fuerte">{l.name} <span className="emp-chip">{l.kind === 'soporte' ? 'Soporte' : 'Ventas'}</span></div>
                  <div className="emp-suave">{e.t}{l.phone_number ? ` · ${l.phone_number}` : ''}</div>
                </div>
                <div className="emp-suave">{l.chats_hoy} hoy · {l.chats} chats</div>
              </div>
            );
          })}
        </section>

        <section className="emp-card">
          <h3>Equipo</h3>
          {!porVendedor.length && <p className="emp-suave">Todavía no cargaste vendedores ni gente de soporte.</p>}
          {porVendedor.map(v => (
            <div key={v.id} className="emp-fila">
              <span className="emp-avatar">{v.name?.[0]?.toUpperCase()}</span>
              <div style={{ flex: 1 }}><div className="emp-fuerte">{v.name}</div><div className="emp-suave">{v.total} chats asignados</div></div>
              <div className="emp-suave">{v.sinContestar ? <b style={{ color: '#d97706' }}>{v.sinContestar} sin contestar</b> : 'al día'}{v.calientes ? ` · 🔥 ${v.calientes}` : ''}</div>
            </div>
          ))}
          {sinAsignar > 0 && <p className="emp-suave" style={{ marginTop: 10 }}>⚠️ {sinAsignar} chats atendidos por personas sin vendedor asignado.</p>}
        </section>
      </div>
    </>
  );
}

function Lineas({ lineas, recargar }) {
  const [nueva, setNueva] = useState({ name: '', kind: 'soporte' });
  const [qr, setQr] = useState({}); // id -> { status, qr }
  const [editando, setEditando] = useState({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const activos = Object.keys(qr).filter(id => qr[id] && qr[id].status !== 'connected');
    if (!activos.length) return;
    const t = setInterval(() => {
      activos.forEach(id => axios.get(`${API}/api/lines/${id}/status`, { headers: headers() })
        .then(r => { setQr(prev => ({ ...prev, [id]: r.data })); if (r.data.status === 'connected') { recargar(); setMsg('✅ Línea conectada'); } })
        .catch(() => {}));
    }, 4000);
    return () => clearInterval(t);
  }, [qr]);

  const crear = async () => {
    try {
      await axios.post(`${API}/api/lines`, nueva, { headers: headers() });
      setNueva({ name: '', kind: 'soporte' });
      recargar();
    } catch (e) { setMsg(e.response?.data?.error || 'No se pudo crear'); }
  };
  const conectar = async (id) => {
    setMsg('');
    try {
      await axios.post(`${API}/api/lines/${id}/connect`, {}, { headers: headers() });
      setQr(prev => ({ ...prev, [id]: { status: 'starting' } }));
    } catch (e) { setMsg(e.response?.data?.error || 'No se pudo conectar'); }
  };
  const desvincular = async (id, nombre) => {
    if (!confirm(`Desvincular "${nombre}"? Los chats, mensajes y archivos quedan guardados.`)) return;
    await axios.post(`${API}/api/lines/${id}/disconnect`, {}, { headers: headers() });
    recargar();
  };
  const guardar = async (id, cambios) => {
    try {
      await axios.put(`${API}/api/lines/${id}`, cambios, { headers: headers() });
      setMsg('Guardado');
      recargar();
    } catch (e) { setMsg(e.response?.data?.error || 'No se pudo guardar'); }
  };

  return (
    <>
      {msg && <div className="emp-msg">{msg}</div>}
      {lineas.map(l => {
        const e = ESTADO[(qr[l.id] && qr[l.id].status) || l.status] || { t: l.status, c: 'medio' };
        const q = qr[l.id];
        const ed = editando[l.id] || {};
        return (
          <section key={l.id} className="emp-card">
            <div className="emp-fila" style={{ borderBottom: 'none' }}>
              <span className={`emp-punto ${e.c}`} />
              <div style={{ flex: 1 }}>
                <input className="emp-input emp-fuerte" defaultValue={l.name} onBlur={ev => ev.target.value !== l.name && guardar(l.id, { name: ev.target.value })} />
                <div className="emp-suave">{e.t}{l.phone_number ? ` · ${l.phone_number}` : ''} · {l.chats} chats</div>
              </div>
              {!l.principal && (
                <select className="emp-input" value={l.kind} onChange={ev => guardar(l.id, { kind: ev.target.value })} style={{ width: 'auto' }}>
                  <option value="ventas">Ventas</option>
                  <option value="soporte">Soporte</option>
                </select>
              )}
              {l.status === 'connected'
                ? <button className="emp-btn claro" onClick={() => desvincular(l.id, l.name)}>Desvincular</button>
                : <button className="emp-btn" onClick={() => conectar(l.id)}>Conectar con QR</button>}
            </div>

            {q && q.status === 'qr_ready' && q.qr && (
              <div className="emp-qr">
                <img src={q.qr} alt="QR" />
                <p>En el celular de esta línea: WhatsApp → Dispositivos vinculados → Vincular dispositivo, y escaneá. El código se renueva solo.</p>
              </div>
            )}
            {q && ['starting', 'connecting'].includes(q.status) && <p className="emp-suave">Preparando el QR…</p>}

            <div className="emp-fila" style={{ borderBottom: 'none', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!l.bot_enabled} onChange={ev => guardar(l.id, { bot_enabled: ev.target.checked })} />
                <span>Bot prendido en esta línea</span>
              </label>
              <span className="emp-suave">Equipo: {l.equipo?.length ? l.equipo.join(', ') : 'solo vos'}</span>
            </div>
            {l.principal ? (
              <p className="emp-suave">El bot de esta línea se configura en <a href="/config">Automatización</a> (recepción, pasos de venta, archivos).</p>
            ) : (
              <div>
                <div className="emp-suave" style={{ marginBottom: 4 }}>
                  Instrucciones del bot de esta línea {l.kind === 'soporte' ? '(soporte: cómo ayudar, qué pedirle al cliente, cuándo pasarlo a una persona)' : '(si lo dejás vacío usa las de la línea principal)'}
                </div>
                <textarea className="emp-input" rows={5} defaultValue={l.bot_prompt || ''} onChange={ev => setEditando(prev => ({ ...prev, [l.id]: { bot_prompt: ev.target.value } }))}
                  placeholder={l.kind === 'soporte'
                    ? 'Ej: Sos el soporte de CeluLock. Pedile al cliente su nombre y el problema. Si es un equipo que no vincula, pedile marca y modelo. Si no sabés resolverlo, escribí [[derivar:tema]] para que lo tome una persona.'
                    : 'Instrucciones del bot de ventas de esta línea'} />
                {ed.bot_prompt !== undefined && <button className="emp-btn" onClick={() => { guardar(l.id, { bot_prompt: ed.bot_prompt }); setEditando(prev => ({ ...prev, [l.id]: {} })); }}>Guardar instrucciones</button>}
              </div>
            )}
          </section>
        );
      })}

      <section className="emp-card">
        <h3>Sumar una línea</h3>
        <div className="emp-fila" style={{ borderBottom: 'none', flexWrap: 'wrap' }}>
          <input className="emp-input" placeholder="Nombre (ej: Soporte)" value={nueva.name} onChange={e => setNueva({ ...nueva, name: e.target.value })} style={{ flex: 1, minWidth: 180 }} />
          <select className="emp-input" value={nueva.kind} onChange={e => setNueva({ ...nueva, kind: e.target.value })} style={{ width: 'auto' }}>
            <option value="soporte">Soporte</option>
            <option value="ventas">Ventas</option>
          </select>
          <button className="emp-btn" onClick={crear} disabled={!nueva.name.trim()}>Crear línea</button>
        </div>
        <p className="emp-suave">Cada línea es un número de WhatsApp distinto con su propio QR. Desvincular nunca borra el historial.</p>
      </section>
    </>
  );
}

function Equipo({ equipo, lineas, recargar }) {
  const [msg, setMsg] = useState('');
  const cambiar = async (emp, lineaId, on) => {
    const actuales = emp.line_ids || lineas.map(l => l.id);
    const nuevas = on ? [...new Set([...actuales, lineaId])] : actuales.filter(x => x !== lineaId);
    try {
      await axios.put(`${API}/api/lines/team/${emp.id}`, { line_ids: nuevas.length === lineas.length ? null : nuevas }, { headers: headers() });
      recargar();
    } catch (e) { setMsg(e.response?.data?.error || 'No se pudo guardar'); }
  };
  return (
    <section className="emp-card">
      <h3>Equipo</h3>
      {msg && <div className="emp-msg">{msg}</div>}
      <p className="emp-suave">
        Cada persona entra con su usuario y trabaja solo desde la Bandeja. Ve los chats que le asignaste y, además, los chats sin asignar
        de las líneas que marques acá (útil para soporte: todos ven la cola). Para sumar gente: <a href="/team">Agregar al equipo</a>.
      </p>
      {!equipo.length && <p className="emp-suave">Todavía no hay nadie en el equipo.</p>}
      {equipo.map(e => (
        <div key={e.id} className="emp-fila">
          <span className="emp-avatar">{e.name?.[0]?.toUpperCase()}</span>
          <div style={{ flex: 1 }}><div className="emp-fuerte">{e.name}</div><div className="emp-suave">{e.email}</div></div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {lineas.map(l => (
              <label key={l.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={!e.line_ids || e.line_ids.includes(l.id)} onChange={ev => cambiar(e, l.id, ev.target.checked)} />
                {l.name}
              </label>
            ))}
          </div>
        </div>
      ))}
      <p className="emp-suave">Si no marcás nada distinto, la persona ve solo los chats que le asignes (y los sin asignar de todas las líneas).</p>
    </section>
  );
}

export default function Empresa() {
  const router = useRouter();
  const [tab, setTab] = useState('resumen');
  const [lineas, setLineas] = useState([]);
  const [chats, setChats] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [cargando, setCargando] = useState(true);

  const recargar = async () => {
    try {
      const [l, c, e] = await Promise.all([
        axios.get(`${API}/api/lines`, { headers: headers() }),
        axios.get(`${API}/api/bot/conversations`, { headers: headers() }),
        axios.get(`${API}/api/auth/employees`, { headers: headers() })
      ]);
      setLineas(l.data);
      setChats((c.data || []).filter(x => x.channel === 'whatsapp'));
      setEquipo(Array.isArray(e.data) ? e.data : (e.data.employees || []));
    } catch (err) {
      if ([401, 403].includes(err.response?.status)) router.push('/login');
    }
    setCargando(false);
  };

  useEffect(() => {
    if (!localStorage.getItem('whabot_token')) { router.push('/login'); return; }
    setTab(router.query.tab ? String(router.query.tab) : 'resumen');
    recargar();
    const t = setInterval(recargar, 30000);
    return () => clearInterval(t);
  }, [router.query.tab]);

  const titulos = {
    resumen: { h: '📊 Resumen', p: 'Cómo viene el día en tus líneas y tu equipo' },
    lineas: { h: '📱 Líneas de WhatsApp', p: 'Cada número con su QR, su estado y su bot' },
    equipo: { h: '👥 Equipo', p: 'Quién atiende qué línea y cómo viene cada uno' }
  };
  const t = titulos[tab] || titulos.resumen;

  return (
    <div className="dashboard">
      <Head><title>Waibo Empresa</title></Head>
      <Sidebar active={tab === 'lineas' ? 'lineas' : tab === 'equipo' ? 'equipo' : 'empresa'} />
      <div className="main-content emp">
        <div className="page-header">
          <h1>{t.h}</h1>
          <p>{t.p}</p>
        </div>
        {cargando ? <p className="emp-suave">Cargando…</p> : (
          <>
            {tab === 'resumen' && <Resumen lineas={lineas} chats={chats} equipo={equipo} />}
            {tab === 'lineas' && <Lineas lineas={lineas} recargar={recargar} />}
            {tab === 'equipo' && <Equipo equipo={equipo} lineas={lineas} recargar={recargar} />}
          </>
        )}
      </div>

      <style jsx global>{`
        :root { --emp-fondo: #f4f6f8; --emp-card: #fff; --emp-borde: #e6e9ec; --emp-texto: #111b21; --emp-suave: #667781; --emp-verde: #00a884; }
        .emp { color: var(--emp-texto); }
        .emp-top { display: flex; align-items: center; gap: 16px; padding: 12px 24px; background: var(--emp-card); border-bottom: 1px solid var(--emp-borde); flex-wrap: wrap; }
        .emp-marca { font-weight: 800; font-size: 18px; }
        .emp-marca span { color: var(--emp-verde); font-weight: 600; }
        .emp-top nav { display: flex; gap: 6px; flex: 1; flex-wrap: wrap; }
        .emp-top nav button, .emp-bandeja { border: none; background: transparent; color: var(--emp-suave); padding: 8px 12px; border-radius: 8px; font-size: 14px; cursor: pointer; text-decoration: none; }
        .emp-top nav button.on { background: #e7f6f1; color: #008069; font-weight: 600; }
        .emp-bandeja { background: var(--emp-verde) !important; color: white !important; font-weight: 600; }
        .emp-mas { position: relative; font-size: 14px; }
        .emp-mas summary { cursor: pointer; color: var(--emp-suave); list-style: none; padding: 8px 12px; }
        .emp-mas[open] { }
        .emp-mas a { display: block; padding: 8px 14px; color: var(--emp-texto); text-decoration: none; background: var(--emp-card); border: 1px solid var(--emp-borde); white-space: nowrap; }
        .emp-mas[open] > a { position: relative; }
        .emp-main { max-width: 1100px; margin: 0 auto; padding: 20px 16px 40px; }
        .emp-nums { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .emp-num { background: var(--emp-card); border: 1px solid var(--emp-borde); border-left-width: 1px; border-radius: 12px; padding: 16px; text-decoration: none; color: inherit; }
        .emp-num-n { font-size: 30px; font-weight: 800; }
        .emp-num-t { color: var(--emp-suave); font-size: 13px; }
        .emp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
        .emp-card { background: var(--emp-card); border: 1px solid var(--emp-borde); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
        .emp-card h3 { margin: 0 0 10px; font-size: 16px; }
        .emp-fila { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--emp-borde); }
        .emp-fila:last-child { border-bottom: none; }
        .emp-fuerte { font-weight: 600; }
        .emp-suave { color: var(--emp-suave); font-size: 13px; }
        .emp-chip { font-size: 11px; background: #e7f6f1; color: #008069; padding: 2px 8px; border-radius: 10px; font-weight: 500; margin-left: 6px; }
        .emp-punto { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .emp-punto.ok { background: #00a884; }
        .emp-punto.medio { background: #f59e0b; }
        .emp-punto.mal { background: #dc2626; }
        .emp-avatar { width: 34px; height: 34px; border-radius: 50%; background: #dfe5e7; color: #54656f; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
        .emp-input { width: 100%; box-sizing: border-box; border: 1px solid var(--emp-borde); background: var(--emp-card); color: var(--emp-texto); border-radius: 8px; padding: 8px 10px; font-size: 14px; font-family: inherit; }
        .emp-input.emp-fuerte { border-color: transparent; padding-left: 0; }
        .emp-input.emp-fuerte:focus { border-color: var(--emp-borde); padding-left: 10px; }
        .emp-btn { border: none; background: var(--emp-verde); color: white; border-radius: 18px; padding: 8px 16px; font-size: 14px; cursor: pointer; white-space: nowrap; }
        .emp-btn.claro { background: transparent; color: var(--emp-texto); border: 1px solid var(--emp-borde); }
        .emp-btn:disabled { opacity: .5; }
        .emp-qr { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; padding: 10px 0; }
        .emp-qr img { width: 220px; height: 220px; background: white; padding: 8px; border-radius: 8px; }
        .emp-qr p { max-width: 360px; color: var(--emp-suave); font-size: 14px; }
        .emp-msg { background: #e7f6f1; color: #08584a; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 14px; }
        @media (max-width: 640px) { .emp-top { padding: 10px 16px; } .emp-fila { flex-wrap: wrap; } }
      `}</style>
    </div>
  );
}
