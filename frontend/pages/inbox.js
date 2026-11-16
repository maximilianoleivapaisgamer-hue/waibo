import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL;

// Bandeja de vendedores: se ve y se usa como WhatsApp. Cada vendedor ve solo sus chats
// (lo filtra el backend); el dueño ve todos, filtra por vendedor y reasigna.
// El historial vive en Waibo (mensajes, fotos, audios, etiquetas): no depende del celular.

function hora(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function diaDe(ts) {
  const d = new Date(ts);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function escapar(t) {
  return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// *negrita*, _cursiva_, ~tachado~ como en WhatsApp
function formato(t) {
  return escapar(t)
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/_([^_\n]+)_/g, '<i>$1</i>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(/\n/g, '<br/>');
}

function textoSinRelleno(m) {
  let t = String(m.content || '');
  if (!m.media_type) return t;
  return t.replace(/^\[(imagen|video|archivo|audio|sticker)\]\s*/i, '')
    .replace(/^\[El cliente mandó (una imagen|un video|un archivo|un audio|un sticker)\]\s*/i, '')
    .replace(/^\[Audio del cliente\]:\s*/i, '🎙️ ')
    .replace(/^(📷 Foto|🎬 Video|🎙️ Nota de voz)\s*/, '');
}

const CALOR = {
  caliente: { txt: '🔥 Caliente', cls: 'rojo' },
  tibio: { txt: '🌤 Tibio', cls: 'naranja' },
  frio: { txt: '❄️ Frío', cls: 'gris' }
};

const CASO = {
  abierto: { txt: '🟠 Abierto', cls: 'naranja' },
  esperando: { txt: '⏳ Esperando al cliente', cls: 'azul' },
  resuelto: { txt: '✅ Resuelto', cls: '' }
};

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

// Foto de perfil: se pide recién cuando el chat aparece en pantalla, y queda en memoria
const avatares = {};
function Avatar({ conv, chico }) {
  const ref = useRef(null);
  const [url, setUrl] = useState(avatares[conv.id] || null);
  useEffect(() => {
    if (avatares[conv.id] !== undefined || conv.channel !== 'whatsapp') return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      avatares[conv.id] = null;
      axios.get(`${API}/api/bot/conversations/${conv.id}/avatar`, { headers: headers() })
        .then(r => { avatares[conv.id] = r.data.url || null; setUrl(r.data.url || null); })
        .catch(() => {});
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [conv.id]);
  const letra = (conv.customer_name || conv.customer_phone || '?')[0]?.toUpperCase();
  return (
    <span ref={ref} className={`wa-avatar ${chico ? 'wa-avatar-chico' : ''}`}>
      {url ? <img src={url} alt="" onError={() => { avatares[conv.id] = null; setUrl(null); }} /> : letra}
    </span>
  );
}

function Audio({ src }) {
  const ref = useRef(null);
  const [vel, setVel] = useState(1);
  const cambiar = () => {
    const v = vel === 1 ? 1.5 : vel === 1.5 ? 2 : 1;
    setVel(v);
    if (ref.current) ref.current.playbackRate = v;
  };
  return (
    <div className="wa-audio-fila">
      <audio ref={ref} controls src={src} className="wa-audio" onPlay={e => { e.currentTarget.playbackRate = vel; }} />
      <button className="wa-vel" onClick={cambiar} title="Velocidad">{vel}x</button>
    </div>
  );
}

// Foto: al tocarla se agranda encima del chat, como en WhatsApp (Esc, ✕ o clic afuera la cierra)
function Foto({ url, sticker }) {
  const [grande, setGrande] = useState(false);
  useEffect(() => {
    if (!grande) return;
    const k = (e) => { if (e.key === 'Escape') setGrande(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [grande]);
  return (
    <>
      <img src={url} alt="" className={sticker ? 'wa-sticker' : 'wa-img'} style={{ cursor: 'zoom-in' }} onClick={() => setGrande(true)} />
      {grande && (
        <div onClick={() => setGrande(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,20,26,.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={() => setGrande(false)} title="Cerrar" style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 30, cursor: 'pointer' }}>✕</button>
          <a href={url} download="imagen" onClick={e => e.stopPropagation()} title="Descargar" style={{ position: 'absolute', top: 20, right: 70, color: '#fff', fontSize: 22, textDecoration: 'none' }}>⬇</a>
          <img src={url} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain', boxShadow: '0 4px 30px rgba(0,0,0,.5)' }} />
        </div>
      )}
    </>
  );
}

function Media({ m }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState('');
  const tipo = m.media_type === 'ptt' ? 'audio' : m.media_type;
  useEffect(() => {
    let u = null;
    if (!['image', 'sticker', 'audio', 'video'].includes(tipo)) return;
    axios.get(`${API}/api/bot/messages/${m.id}/media`, { headers: headers(), responseType: 'blob', timeout: 90000 })
      .then(r => { u = URL.createObjectURL(r.data); setUrl(u); })
      .catch(async e => { try { setErr(JSON.parse(await e.response.data.text()).error); } catch (_) { setErr('No disponible'); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [m.id]);
  const abrirArchivo = async () => {
    try {
      const r = await axios.get(`${API}/api/bot/messages/${m.id}/media`, { headers: headers(), responseType: 'blob', timeout: 90000 });
      window.open(URL.createObjectURL(r.data), '_blank');
    } catch (_) { setErr('No disponible'); }
  };
  if (err) return <div className="wa-media-err">⚠️ {err}</div>;
  if (tipo === 'document') return <button className="wa-doc" onClick={abrirArchivo}>📄 Abrir archivo</button>;
  if (!url) return <div className="wa-media-load">Cargando…</div>;
  if (tipo === 'image' || tipo === 'sticker') return <Foto url={url} sticker={tipo === 'sticker'} />;
  if (tipo === 'audio') return <Audio src={url} />;
  if (tipo === 'video') return <video controls src={url} className="wa-img" />;
  return null;
}

export default function Inbox() {
  const router = useRouter();
  const [yo, setYo] = useState(null);
  const [chats, setChats] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [soyVendedor, setSoyVendedor] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState('todos'); // todos | sinleer | seguimiento | sinasignar | <id vendedor>
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('');
  const [etiquetasWA, setEtiquetasWA] = useState([]);
  const [respondiendo, setRespondiendo] = useState(null); // mensaje que se cita al contestar
  const [menuMsg, setMenuMsg] = useState(null);   // id del mensaje con el menú abierto
  const [editando, setEditando] = useState(null); // { id, texto }
  const [verDetalle, setVerDetalle] = useState(false);
  const [aviso, setAviso] = useState('');
  const [etiquetaSel, setEtiquetaSel] = useState('');
  const [lineaSel, setLineaSel] = useState('');
  // Respuestas rápidas ("/atajo") y archivos precargados (precios, video, alias...)
  const [rapidas, setRapidas] = useState({ replies: [], resources: [], can_edit: false });
  const [verRapidas, setVerRapidas] = useState(false);
  const [nuevaRapida, setNuevaRapida] = useState({ shortcut: '', text: '', resource_id: '' });
  const [conexion, setConexion] = useState(null); // null | 'ok' | 'caida'
  const finRef = useRef(null);
  const archivoRef = useRef(null);
  const grabadorRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/login'); return; }
    try { setYo(JSON.parse(localStorage.getItem('whabot_client') || '{}')); } catch (_) { setYo({}); }
    axios.get(`${API}/api/bot/sellers`, { headers: headers() })
      .then(r => { setSellers(r.data.sellers || []); setSoyVendedor(!!r.data.me); })
      .catch(() => {});
  }, []);

  // Subir un archivo nuevo desde la Bandeja para usarlo en una respuesta rápida
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const subirArchivoRapida = async (f) => {
    const nombre = (prompt('Nombre del archivo (así lo vas a ver en la lista):', f.name.replace(/\.[^.]+$/, '')) || '').trim();
    if (!nombre) return;
    setSubiendoArchivo(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('name', nombre);
      const r = await axios.post(`${API}/api/resources/file`, fd, { headers: headers(), timeout: 300000 });
      await cargarRapidas();
      setNuevaRapida(n => ({ ...n, resource_id: r.data.id, shortcut: n.shortcut || nombre.toLowerCase().replace(/\s+/g, '-').slice(0, 30) }));
    } catch (e) { avisar(e.response?.data?.error || 'No se pudo subir el archivo'); }
    setSubiendoArchivo(false);
  };

  const cargarRapidas = () => axios.get(`${API}/api/bot/quick-replies`, { headers: headers() })
    .then(r => setRapidas(r.data)).catch(() => {});
  useEffect(() => { cargarRapidas(); }, []);

  // Estado de la conexión de WhatsApp (QR)
  useEffect(() => {
    const ver = () => axios.get(`${API}/api/whatsapp-qr/status`, { headers: headers() })
      .then(r => {
        if (r.data.mode !== 'qr') return setConexion(null);
        setConexion(['connected', 'connecting', 'starting'].includes(r.data.status) ? 'ok' : 'caida');
      })
      .catch(() => {});
    ver();
    const t = setInterval(ver, 60000);
    return () => clearInterval(t);
  }, []);

  // Lista de chats: se refresca sola
  useEffect(() => {
    let vivo = true;
    const cargar = () => axios.get(`${API}/api/bot/conversations`, { headers: headers() })
      .then(r => { if (vivo) setChats((r.data || []).filter(c => c.channel === 'whatsapp')); })
      .catch(e => { if (e.response?.status === 401 || e.response?.status === 403) router.push('/login'); });
    cargar();
    const t = setInterval(cargar, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  // Mensajes del chat abierto: se refrescan solos
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    const cargar = () => axios.get(`${API}/api/bot/conversations/${abierto}/messages`, { headers: headers() })
      .then(r => { if (vivo) setMensajes(r.data || []); })
      .catch(() => {});
    cargar();
    const t = setInterval(cargar, 2000);
    return () => { vivo = false; clearInterval(t); };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const c = chats.find(x => x.id === abierto);
    if (!c || (c.heat_at && Date.now() - new Date(c.heat_at).getTime() < 30 * 60 * 1000)) return;
    axios.post(`${API}/api/bot/conversations/${abierto}/heat`, {}, { headers: headers(), timeout: 90000 })
      .then(r => setChats(prev => prev.map(x => x.id === abierto ? { ...x, ...r.data } : x)))
      .catch(() => {});
  }, [abierto]);

  const cantidadAntes = useRef(0);
  useEffect(() => {
    if (mensajes.length !== cantidadAntes.current) finRef.current?.scrollIntoView({ block: 'end' });
    cantidadAntes.current = mensajes.length;
  }, [mensajes]);

  const chat = chats.find(c => c.id === abierto) || null;
  const nombreVendedor = (id) => sellers.find(v => v.id === id)?.name;
  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(''), 4000); };

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const ahora = Date.now();
    return chats.filter(c => {
      if (q && !(`${c.customer_name || ''} ${c.customer_phone || ''} ${(c.tags || []).join(' ')}`.toLowerCase().includes(q))) return false;
      if (etiquetaSel && !(c.tags || []).includes(etiquetaSel)) return false;
      if (lineaSel && (c.line_id || 'principal') !== lineaSel) return false;
      if (filtro === 'casos') return c.line_kind === 'soporte' && c.case_status !== 'resuelto';
      if (filtro === 'calientes') return c.heat === 'caliente';
      if (filtro.startsWith('seg:')) return c.segment === filtro.slice(4);
      if (filtro === 'sinleer') return c.unread;
      if (filtro === 'seguimiento') return c.follow_up_at && new Date(c.follow_up_at).getTime() <= ahora + 24 * 3600 * 1000;
      if (filtro === 'sinasignar') return !c.assigned_to;
      if (filtro !== 'todos') return c.assigned_to === filtro;
      return !c.archived || !!q;
    });
  }, [chats, buscar, filtro, etiquetaSel, lineaSel]);

  const sinLeer = chats.filter(c => c.unread).length;
  const lineas = useMemo(() => {
    const m = new Map();
    for (const c of chats) m.set(c.line_id || 'principal', { id: c.line_id || 'principal', name: c.line_name || 'Principal', kind: c.line_kind });
    return [...m.values()];
  }, [chats]);
  const hayCasos = chats.some(c => c.line_kind === 'soporte');
  const segmentos = [...new Set(chats.map(c => c.segment).filter(Boolean))];
  const calientes = chats.filter(c => c.heat === 'caliente').length;
  const todasEtiquetas = useMemo(() => {
    const n = {};
    for (const c of chats) for (const t of c.tags || []) n[t] = (n[t] || 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [chats]);
  const paraSeguir = chats.filter(c => c.follow_up_at && new Date(c.follow_up_at).getTime() <= Date.now() + 24 * 3600 * 1000).length;

  const actualizarChat = (cambios) => setChats(prev => prev.map(c => c.id === abierto ? { ...c, ...cambios } : c));

  const mandarTexto = async () => {
    const t = texto.trim();
    if (!t || !abierto || enviando) return;
    setEnviando(true);
    setTexto('');
    const cita = respondiendo;
    setRespondiendo(null);
    try {
      await axios.post(`${API}/api/bot/conversations/${abierto}/send`, { message: t, ...(cita && { replyToId: cita.id }) }, { headers: headers(), timeout: 300000 });
      const r = await axios.get(`${API}/api/bot/conversations/${abierto}/messages`, { headers: headers() });
      setMensajes(r.data || []);
    } catch (e) {
      setTexto(t);
      setRespondiendo(cita);
      avisar(e.response?.data?.error || 'No se pudo mandar');
    }
    setEnviando(false);
  };

  const mandarArchivo = async (archivo, voz = false) => {
    if (!archivo || !abierto) return;
    if (archivo.size > 16 * 1024 * 1024) { avisar('El archivo pesa más de 16 MB (límite de WhatsApp)'); return; }
    setEnviando(true);
    const fd = new FormData();
    fd.append('file', archivo, archivo.name || (voz ? 'nota.webm' : 'archivo'));
    if (voz) fd.append('voice', '1');
    else if (texto.trim()) { fd.append('caption', texto.trim()); setTexto(''); }
    try {
      await axios.post(`${API}/api/bot/conversations/${abierto}/send-media`, fd, { headers: headers(), timeout: 300000 });
      const r = await axios.get(`${API}/api/bot/conversations/${abierto}/messages`, { headers: headers() });
      setMensajes(r.data || []);
    } catch (e) {
      avisar(e.response?.data?.error || 'No se pudo mandar el archivo');
    }
    setEnviando(false);
  };

  const recargarMensajes = async () => {
    const r = await axios.get(`${API}/api/bot/conversations/${abierto}/messages`, { headers: headers() });
    setMensajes(r.data || []);
  };

  const mandarRecurso = async (resourceId, caption = '') => {
    if (!abierto) return;
    setEnviando(true);
    setVerRapidas(false);
    try {
      await axios.post(`${API}/api/bot/conversations/${abierto}/send-resource`, { resource_id: resourceId, caption }, { headers: headers(), timeout: 300000 });
      await recargarMensajes();
    } catch (e) {
      avisar(e.response?.data?.error || 'No se pudo mandar el archivo');
    }
    setEnviando(false);
  };

  // Elegir una respuesta rápida: el texto queda en la caja para revisarlo; si tiene archivo, se manda
  const usarRapida = (q) => {
    setVerRapidas(false);
    if (q.resource_id) { setTexto(''); mandarRecurso(q.resource_id, q.text || ''); return; }
    setTexto(q.text || '');
  };

  const guardarRapida = async () => {
    try {
      await axios.post(`${API}/api/bot/quick-replies`, nuevaRapida, { headers: headers() });
      setNuevaRapida({ shortcut: '', text: '', resource_id: '' });
      cargarRapidas();
    } catch (e) { avisar(e.response?.data?.error || 'No se pudo guardar'); }
  };
  const borrarRapida = async (id) => {
    if (!confirm('Borrar esta respuesta rápida?')) return;
    await axios.delete(`${API}/api/bot/quick-replies/${id}`, { headers: headers() }).catch(() => {});
    cargarRapidas();
  };

  const grabar = async () => {
    if (grabando) {
      grabadorRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      const partes = [];
      let cancelado = false;
      rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);
        setGrabando(false);
        if (cancelado || !partes.length) return;
        const blob = new Blob(partes, { type: rec.mimeType || 'audio/webm' });
        mandarArchivo(new File([blob], 'nota.webm', { type: blob.type }), true);
      };
      rec.cancelar = () => { cancelado = true; rec.stop(); };
      grabadorRef.current = rec;
      rec.start();
      setSegundos(0);
      setGrabando(true);
      timerRef.current = setInterval(() => setSegundos(s => s + 1), 1000);
    } catch (_) {
      avisar('No se pudo usar el micrófono. Dale permiso en el navegador.');
    }
  };

  // Etiquetas de WhatsApp Business de la línea del chat abierto
  useEffect(() => {
    if (!verDetalle || !abierto) return;
    const c = chats.find(x => x.id === abierto);
    axios.get(`${API}/api/bot/conversations/labels/list${c?.line_id ? `?line=${c.line_id}` : ''}`, { headers: headers() })
      .then(r => setEtiquetasWA(r.data.labels || [])).catch(() => setEtiquetasWA([]));
  }, [verDetalle, abierto]);

  const alternarEtiquetaWA = async (label) => {
    const tiene = (chat?.tags || []).includes(label);
    try {
      const r = await axios.post(`${API}/api/bot/conversations/${abierto}/label`, { label, remove: tiene }, { headers: headers(), timeout: 90000 });
      actualizarChat({ tags: r.data.tags });
      if (!r.data.en_whatsapp) avisar('Se guardó en Waibo, pero no se pudo poner en WhatsApp (¿está conectado?)');
    } catch (e) { avisar(e.response?.data?.error || 'No se pudo etiquetar'); }
  };

  const borrarMensaje = async (m) => {
    setMenuMsg(null);
    if (!confirm('Borrar este mensaje para todos? WhatsApp solo deja hacerlo durante un tiempo después de mandarlo.')) return;
    try {
      await axios.post(`${API}/api/bot/conversations/${abierto}/messages/${m.id}/delete`, {}, { headers: headers(), timeout: 90000 });
      await recargarMensajes();
    } catch (e) { avisar(e.response?.data?.error || 'No se pudo borrar'); }
  };
  const guardarEdicion = async () => {
    if (!editando?.texto?.trim()) return;
    try {
      await axios.put(`${API}/api/bot/conversations/${abierto}/messages/${editando.id}`, { text: editando.texto.trim() }, { headers: headers(), timeout: 90000 });
      setEditando(null);
      await recargarMensajes();
    } catch (e) { avisar(e.response?.data?.error || 'No se pudo editar'); }
  };

  const guardarEtiquetas = async (tags) => {
    try {
      await axios.put(`${API}/api/bot/conversations/${abierto}/tags`, { tags }, { headers: headers() });
      actualizarChat({ tags });
    } catch (_) { avisar('No se pudo guardar la etiqueta'); }
  };

  const guardarSeguimiento = async (at, note) => {
    try {
      const r = await axios.put(`${API}/api/bot/conversations/${abierto}/follow-up`, { at, note }, { headers: headers() });
      actualizarChat({ follow_up_at: r.data.follow_up_at, follow_up_note: r.data.follow_up_note });
      avisar(at ? 'Seguimiento agendado' : 'Seguimiento quitado');
    } catch (_) { avisar('No se pudo guardar el seguimiento'); }
  };

  const asignar = async (id) => {
    try {
      await axios.put(`${API}/api/bot/conversations/${abierto}/assign`, { employee_id: id || null }, { headers: headers() });
      actualizarChat({ assigned_to: id || null, assigned_name: nombreVendedor(id) || null });
    } catch (e) { avisar(e.response?.data?.error || 'No se pudo asignar'); }
  };

  const tomarControl = async (status) => {
    try {
      await axios.put(`${API}/api/bot/conversations/${abierto}/status`, { status }, { headers: headers() });
      actualizarChat({ status });
    } catch (_) { avisar('No se pudo cambiar'); }
  };

  const quienMando = (m) => {
    if (m.role === 'user') return null;
    if (m.origin === 'phone') return '📱 Celular';
    if (m.origin === 'import') return null;
    if (m.origin === 'seguimiento') return '🔁 Seguimiento';
    if (m.origin === 'manual') return m.sent_by && nombreVendedor(m.sent_by) ? `👤 ${nombreVendedor(m.sent_by)}` : '👤 Vos';
    return '🤖 Bot';
  };

  // Mensajes con separador por día
  const conDias = [];
  let ultimoDia = '';
  for (const m of mensajes) {
    const d = diaDe(m.timestamp);
    if (d !== ultimoDia) { conDias.push({ dia: d, key: 'd' + m.id }); ultimoDia = d; }
    conDias.push(m);
  }

  const seguimientoLocal = chat?.follow_up_at ? new Date(new Date(chat.follow_up_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

  return (
    <div className="wa">
      <Head><title>Bandeja · Waibo</title></Head>

      {/* ── Lista de chats ── */}
      <aside className={`wa-lista ${abierto ? 'oculta-movil' : ''}`}>
        <header className="wa-top">
          <div className="wa-yo">
            <span className="wa-avatar wa-avatar-chico">{(yo?.name || yo?.business_name || 'W')[0]?.toUpperCase()}</span>
            <span className="wa-yo-nombre">{soyVendedor ? (yo?.name || 'Vendedor') : 'Todos los chats'}</span>
          </div>
          {conexion && (
            <span className={`wa-conexion ${conexion}`} title={conexion === 'ok' ? 'WhatsApp conectado' : 'WhatsApp desconectado: hay que escanear el QR'}>
              ● {conexion === 'ok' ? 'Conectado' : 'Desconectado'}
            </span>
          )}
          {!soyVendedor && <a href="/empresa" className="wa-link">Empresa ›</a>}
        </header>
        <div className="wa-buscar">
          <input placeholder="Buscar nombre, número o etiqueta" value={buscar} onChange={e => setBuscar(e.target.value)} />
        </div>
        {lineas.length > 1 && (
          <div className="wa-lineas">
            <button className={!lineaSel ? 'on' : ''} onClick={() => setLineaSel('')}>Todas las líneas</button>
            {lineas.map(l => <button key={l.id} className={lineaSel === l.id ? 'on' : ''} onClick={() => setLineaSel(l.id)}>{l.kind === 'soporte' ? '🛟' : '💼'} {l.name}</button>)}
          </div>
        )}
        <div className="wa-chips">
          {hayCasos && <button className={filtro === 'casos' ? 'on' : ''} onClick={() => setFiltro('casos')}>🛟 Casos abiertos</button>}
          <button className={filtro === 'todos' ? 'on' : ''} onClick={() => setFiltro('todos')}>Todos</button>
          <button className={filtro === 'sinleer' ? 'on' : ''} onClick={() => setFiltro('sinleer')}>Sin leer{sinLeer ? ` ${sinLeer}` : ''}</button>
          <button className={filtro === 'calientes' ? 'on' : ''} onClick={() => setFiltro('calientes')}>🔥 Calientes{calientes ? ` ${calientes}` : ''}</button>
          <button className={filtro === 'seguimiento' ? 'on' : ''} onClick={() => setFiltro('seguimiento')}>Seguimiento{paraSeguir ? ` ${paraSeguir}` : ''}</button>
          {segmentos.map(sg => <button key={sg} className={filtro === 'seg:' + sg ? 'on' : ''} onClick={() => setFiltro('seg:' + sg)}>📍 {sg}</button>)}
          {!soyVendedor && sellers.length > 0 && <button className={filtro === 'sinasignar' ? 'on' : ''} onClick={() => setFiltro('sinasignar')}>Sin asignar</button>}
          {!soyVendedor && sellers.map(v => (
            <button key={v.id} className={filtro === v.id ? 'on' : ''} onClick={() => setFiltro(v.id)}>{v.name}</button>
          ))}
        </div>
        {todasEtiquetas.length > 0 && (
          <div className="wa-chips wa-chips-etiquetas">
            {todasEtiquetas.map(t => (
              <button key={t} className={etiquetaSel === t ? 'on' : ''} onClick={() => setEtiquetaSel(etiquetaSel === t ? '' : t)}>🏷 {t}</button>
            ))}
          </div>
        )}
        <div className="wa-items">
          {!visibles.length && <div className="wa-vacio">No hay chats acá.</div>}
          {visibles.map(c => {
            const vencido = c.follow_up_at && new Date(c.follow_up_at).getTime() <= Date.now();
            return (
              <div key={c.id} className={`wa-item ${abierto === c.id ? 'activo' : ''}`} onClick={() => { setAbierto(c.id); setVerDetalle(false); }}>
                <Avatar conv={c} />
                <div className="wa-item-cuerpo">
                  <div className="wa-item-fila">
                    <span className={`wa-item-nombre ${c.unread ? 'fuerte' : ''}`}>{c.customer_name || c.customer_phone}</span>
                    <span className={`wa-item-hora ${c.unread ? 'verde' : ''}`}>{hora(c.last_message_at)}</span>
                  </div>
                  <div className="wa-item-fila">
                    <span className="wa-item-ultimo">
                      {c.last_message_role === 'assistant' ? '✓ ' : ''}{String(c.last_message || '').replace(/\n/g, ' ').slice(0, 70)}
                    </span>
                    {c.unread && <span className="wa-burbuja-nueva">●</span>}
                  </div>
                  {(lineas.length > 1 || c.line_kind === 'soporte' || c.tags?.length > 0 || c.follow_up_at || c.heat || c.segment || (!soyVendedor && c.assigned_name)) && (
                    <div className="wa-item-tags">
                      {lineas.length > 1 && <span className="wa-tag gris">{c.line_kind === 'soporte' ? '🛟' : '💼'} {c.line_name}</span>}
                      {c.line_kind === 'soporte' && CASO[c.case_status || 'abierto'] && <span className={`wa-tag ${CASO[c.case_status || 'abierto'].cls}`}>{CASO[c.case_status || 'abierto'].txt}</span>}
                      {c.segment && <span className="wa-tag azul">📍 {c.segment}</span>}
                      {c.heat && CALOR[c.heat] && <span className={`wa-tag ${CALOR[c.heat].cls}`} title={c.heat_reason || ''}>{CALOR[c.heat].txt}</span>}
                      {c.follow_up_at && <span className={`wa-tag ${vencido ? 'rojo' : 'azul'}`}>⏰ {hora(c.follow_up_at)}</span>}
                      {!soyVendedor && c.assigned_name && <span className="wa-tag violeta">👤 {c.assigned_name}</span>}
                      {(c.tags || []).slice(0, 3).map(t => <span key={t} className="wa-tag">{t}</span>)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Chat abierto ── */}
      <main className={`wa-chat ${abierto ? '' : 'oculta-movil'}`}>
        {!chat ? (
          <div className="wa-bienvenida">
            <div className="wa-bienvenida-icono">💬</div>
            <h2>Bandeja de Waibo</h2>
            <p>Elegí un chat de la izquierda. Todo queda guardado: mensajes, fotos, audios y etiquetas.</p>
          </div>
        ) : (
          <>
            <header className="wa-top wa-chat-top">
              <button className="wa-volver" onClick={() => setAbierto(null)}>‹</button>
              <Avatar conv={chat} chico />
              <div className="wa-chat-titulo" onClick={() => setVerDetalle(v => !v)}>
                <div className="wa-chat-nombre">{chat.customer_name || chat.customer_phone}</div>
                <div className="wa-chat-sub">{chat.customer_phone}{lineas.length > 1 ? ` · ${chat.line_name}` : ''}{chat.status === 'human' ? ' · atiende una persona' : ' · contesta el bot'}</div>
              </div>
              <button className="wa-boton-claro" onClick={() => setVerDetalle(v => !v)}>{verDetalle ? 'Cerrar' : 'Ficha'}</button>
            </header>

            {verDetalle && (
              <div className="wa-ficha">
                {chat.line_kind === 'soporte' && (
                  <div className="wa-ficha-fila">
                    <span className="wa-ficha-titulo">Caso</span>
                    {Object.entries(CASO).map(([k, v]) => (
                      <button key={k} className="wa-boton-claro" style={(chat.case_status || 'abierto') === k ? { borderColor: '#00a884', fontWeight: 600 } : {}}
                        onClick={async () => {
                          try { await axios.put(`${API}/api/bot/conversations/${abierto}/case`, { status: k }, { headers: headers() }); actualizarChat({ case_status: k }); }
                          catch (_) { avisar('No se pudo cambiar el caso'); }
                        }}>{v.txt}</button>
                    ))}
                  </div>
                )}
                {chat.heat && CALOR[chat.heat] && (
                  <div className="wa-ficha-fila">
                    <span className="wa-ficha-titulo">Temperatura</span>
                    <span className={`wa-tag ${CALOR[chat.heat].cls}`}>{CALOR[chat.heat].txt}</span>
                    {chat.heat_reason && <span style={{ fontSize: 13, color: 'var(--wa-suave)' }}>{chat.heat_reason}</span>}
                  </div>
                )}
                <div className="wa-ficha-fila">
                  <span className="wa-ficha-titulo">Bot</span>
                  {chat.status === 'human'
                    ? <button className="wa-boton-claro" onClick={() => tomarControl('bot')}>🤖 Devolver al bot</button>
                    : <button className="wa-boton-claro" onClick={() => tomarControl('human')}>✋ Atender yo (frenar el bot)</button>}
                </div>
                {!soyVendedor && sellers.length > 0 && (
                  <div className="wa-ficha-fila">
                    <span className="wa-ficha-titulo">Vendedor</span>
                    <select value={chat.assigned_to || ''} onChange={e => asignar(e.target.value)}>
                      <option value="">Sin asignar</option>
                      {sellers.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                )}
                {etiquetasWA.length > 0 && (
                  <div className="wa-ficha-fila columna">
                    <span className="wa-ficha-titulo">Etiquetas de WhatsApp</span>
                    <div className="wa-item-tags">
                      {etiquetasWA.map(l => {
                        const on = (chat.tags || []).includes(l);
                        return (
                          <button key={l} className="wa-boton-claro" onClick={() => alternarEtiquetaWA(l)}
                            style={on ? { background: '#d9fdd3', borderColor: '#00a884', color: '#008069', fontWeight: 600 } : {}}>
                            {on ? '✓ ' : '+ '}{l}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="wa-ficha-fila columna">
                  <span className="wa-ficha-titulo">Etiquetas propias</span>
                  <div className="wa-item-tags">
                    {(chat.tags || []).map(t => (
                      <span key={t} className="wa-tag">{t} <button className="wa-x" onClick={() => guardarEtiquetas((chat.tags || []).filter(x => x !== t))}>×</button></span>
                    ))}
                    <input className="wa-tag-input" placeholder="+ etiqueta" value={nuevaEtiqueta}
                      onChange={e => setNuevaEtiqueta(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && nuevaEtiqueta.trim()) {
                          guardarEtiquetas([...(chat.tags || []), nuevaEtiqueta.trim()]);
                          setNuevaEtiqueta('');
                        }
                      }} />
                  </div>
                </div>
                <div className="wa-ficha-fila columna">
                  <span className="wa-ficha-titulo">Seguimiento</span>
                  <div className="wa-seguimiento">
                    <input type="datetime-local" defaultValue={seguimientoLocal} key={chat.id + (chat.follow_up_at || '')} id="seg-fecha" />
                    <input placeholder="Qué quedó pendiente (ej: espera el alias)" defaultValue={chat.follow_up_note || ''} key={'n' + chat.id + (chat.follow_up_note || '')} id="seg-nota" />
                    <button className="wa-boton-verde" onClick={() => {
                      const f = document.getElementById('seg-fecha').value;
                      const n = document.getElementById('seg-nota').value;
                      guardarSeguimiento(f ? new Date(f).toISOString() : null, n);
                    }}>Guardar</button>
                    {chat.follow_up_at && <button className="wa-boton-claro" onClick={() => guardarSeguimiento(null, null)}>Quitar</button>}
                  </div>
                </div>
              </div>
            )}

            {chat.follow_up_at && !verDetalle && (
              <div className={`wa-banda ${new Date(chat.follow_up_at).getTime() <= Date.now() ? 'roja' : ''}`}>
                ⏰ Seguimiento {new Date(chat.follow_up_at).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {chat.follow_up_note ? ` · ${chat.follow_up_note}` : ''}
              </div>
            )}

            <div className="wa-mensajes">
              {conDias.map(m => m.dia ? (
                <div key={m.key} className="wa-dia"><span>{m.dia}</span></div>
              ) : (
                <div key={m.id} className={`wa-fila ${m.role === 'user' ? 'izq' : 'der'}`}>
                  <div className={`wa-globo ${m.role === 'user' ? 'entrante' : 'saliente'}`}>
                    {m.wa_id && !m.deleted && (
                      <button className="wa-menu-btn" onClick={() => setMenuMsg(menuMsg === m.id ? null : m.id)} title="Opciones">⌄</button>
                    )}
                    {menuMsg === m.id && (
                      <div className="wa-menu">
                        <button onClick={() => { setMenuMsg(null); setRespondiendo(m); }}>↩️ Responder</button>
                        {m.role !== 'user' && !m.media_type && <button onClick={() => { setMenuMsg(null); setEditando({ id: m.id, texto: m.content }); }}>✏️ Editar</button>}
                        {m.role !== 'user' && <button onClick={() => borrarMensaje(m)}>🗑️ Borrar para todos</button>}
                      </div>
                    )}
                    {quienMando(m) && <div className="wa-quien">{quienMando(m)}</div>}
                    {m.reply_to && (() => {
                      const q = mensajes.find(x => x.wa_id && x.wa_id.endsWith('_' + m.reply_to));
                      return (
                        <div className={`wa-cita ${q && q.role !== 'user' ? 'mia' : ''}`}>
                          <b>{q ? (q.role === 'user' ? (chat.customer_name || chat.customer_phone) : 'Vos') : 'Mensaje citado'}</b>
                          <span>{q ? (textoSinRelleno(q) || (q.media_type ? '📎 Archivo' : '')).slice(0, 160) : 'No está cargado en la Bandeja'}</span>
                        </div>
                      );
                    })()}
                    {m.deleted ? (
                      <div className="wa-texto wa-borrado">🚫 Eliminaste este mensaje</div>
                    ) : editando?.id === m.id ? (
                      <div className="wa-editar">
                        <textarea rows={2} value={editando.texto} onChange={e => setEditando({ ...editando, texto: e.target.value })} />
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="wa-boton-claro" onClick={() => setEditando(null)}>Cancelar</button>
                          <button className="wa-boton-verde" onClick={guardarEdicion}>Guardar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {m.media_type && <Media m={m} />}
                        {textoSinRelleno(m) && <div className="wa-texto" dangerouslySetInnerHTML={{ __html: formato(textoSinRelleno(m)) }} />}
                      </>
                    )}
                    <div className="wa-hora">
                      {m.edited && !m.deleted ? 'Editado · ' : ''}
                      {new Date(m.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      {m.role !== 'user' && m.ack > 0 && !m.deleted && (
                        <span className={`wa-tilde ${m.ack >= 3 ? 'leido' : ''}`} title={m.ack >= 3 ? 'Leído' : m.ack === 2 ? 'Entregado' : 'Enviado'}>
                          {m.ack >= 2 ? ' ✓✓' : ' ✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={finRef} />
            </div>

            {(() => {
              const q = texto.startsWith('/') ? texto.slice(1).toLowerCase() : null;
              const coinciden = q === null ? [] : rapidas.replies.filter(r => r.shortcut.includes(q) || (r.text || '').toLowerCase().includes(q)).slice(0, 8);
              if (q === null || !coinciden.length) return null;
              return (
                <div className="wa-rapidas-pop">
                  <div className="wa-rapidas-titulo">Respuestas rápidas</div>
                  {coinciden.map(r => (
                    <div key={r.id} className="wa-rapida" onClick={() => usarRapida(r)}>
                      <div className="wa-rapida-atajo">/{r.shortcut}{r.resource_id ? ` · ${r.resource_kind === 'audio' ? '🎙️' : '📎'} ${r.resource_name}` : ''}</div>
                      {r.text && <div className="wa-rapida-texto">{r.text}</div>}
                    </div>
                  ))}
                </div>
              );
            })()}

            {verRapidas && (
              <div className="wa-rapidas-panel">
                <div className="wa-rapidas-titulo">Archivos para mandar</div>
                {!rapidas.resources.length && <div className="wa-rapida-texto" style={{ padding: '4px 12px' }}>No hay archivos cargados (se suben en Cerebro IA → Recursos).</div>}
                <div className="wa-archivos">
                  {rapidas.resources.map(r => (
                    <button key={r.id} className="wa-archivo" onClick={() => mandarRecurso(r.id)} title={r.description || ''}>
                      <span>{{ image: '🖼️', video: '🎬', audio: '🎙️', document: '📄', link: '🔗' }[r.kind] || '📎'}</span> {r.name}
                    </button>
                  ))}
                </div>
                <div className="wa-rapidas-titulo">Respuestas rápidas <span style={{ fontWeight: 400 }}>· también escribiendo /</span></div>
                {rapidas.replies.map(r => (
                  <div key={r.id} className="wa-rapida">
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => usarRapida(r)}>
                      <div className="wa-rapida-atajo">/{r.shortcut}{r.resource_id ? ` · 📎 ${r.resource_name}` : ''}</div>
                      {r.text && <div className="wa-rapida-texto">{r.text}</div>}
                    </div>
                    {rapidas.can_edit && <button className="wa-x" onClick={() => borrarRapida(r.id)} title="Borrar">🗑️</button>}
                  </div>
                ))}
                {rapidas.can_edit && (
                  <div className="wa-rapida-nueva">
                    <input placeholder="atajo (ej: alias)" value={nuevaRapida.shortcut} onChange={e => setNuevaRapida({ ...nuevaRapida, shortcut: e.target.value })} />
                    <textarea rows={2} placeholder="Texto (ej: Te paso los datos para el pago...)" value={nuevaRapida.text} onChange={e => setNuevaRapida({ ...nuevaRapida, text: e.target.value })} />
                    <select value={nuevaRapida.resource_id} onChange={e => setNuevaRapida({ ...nuevaRapida, resource_id: e.target.value })}>
                      <option value="">Sin archivo</option>
                      {rapidas.resources.map(r => <option key={r.id} value={r.id}>📎 {r.name}</option>)}
                    </select>
                    <label className="wa-boton-claro" style={{ cursor: 'pointer', textAlign: 'center' }}>
                      {subiendoArchivo ? 'Subiendo…' : '📤 Subir archivo nuevo (foto, audio, video, PDF)'}
                      <input type="file" style={{ display: 'none' }} disabled={subiendoArchivo}
                        accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
                        onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) subirArchivoRapida(f); }} />
                    </label>
                    <button className="wa-boton-verde" onClick={guardarRapida}>Agregar respuesta rápida</button>
                  </div>
                )}
              </div>
            )}

            <footer className="wa-escribir">
              <input type="file" ref={archivoRef} style={{ display: 'none' }} accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
                onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) mandarArchivo(f); }} />
              <div className="wa-caja">
                {respondiendo && !grabando && (
                  <div className="wa-cita-caja">
                    <div className={`wa-cita ${respondiendo.role !== 'user' ? 'mia' : ''}`} style={{ flex: 1, margin: 0 }}>
                      <b>{respondiendo.role === 'user' ? (chat.customer_name || chat.customer_phone) : 'Vos'}</b>
                      <span>{(textoSinRelleno(respondiendo) || (respondiendo.media_type ? '📎 Archivo' : '')).slice(0, 160)}</span>
                    </div>
                    <button className="wa-icono" title="Cancelar respuesta" onClick={() => setRespondiendo(null)}>✕</button>
                  </div>
                )}
                {grabando ? (
                  <div className="wa-caja-fila">
                    <button className="wa-icono" title="Cancelar" onClick={() => grabadorRef.current?.cancelar()}>🗑️</button>
                    <div className="wa-grabando">● Grabando {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}</div>
                    <button className="wa-enviar" title="Mandar nota de voz" onClick={grabar}>➤</button>
                  </div>
                ) : (
                  <>
                    <textarea rows={1} placeholder="Escribí un mensaje" value={texto}
                      onChange={e => { setTexto(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'; }}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandarTexto(); } }} />
                    <div className="wa-caja-fila">
                      <button className="wa-icono" title="Adjuntar foto, video o archivo" onClick={() => archivoRef.current?.click()} disabled={enviando}>📎</button>
                      <button className="wa-chip-rapidas" title="Respuestas rápidas y archivos precargados" onClick={() => setVerRapidas(v => !v)} disabled={enviando}>⚡ Respuestas rápidas</button>
                      <span style={{ flex: 1 }} />
                      {texto.trim()
                        ? <button className="wa-enviar" onClick={mandarTexto} disabled={enviando}>{enviando ? '…' : '➤'}</button>
                        : <button className="wa-icono" title="Grabar nota de voz" onClick={grabar} disabled={enviando}>{enviando ? '…' : '🎤'}</button>}
                    </div>
                  </>
                )}
              </div>
            </footer>
          </>
        )}
      </main>

      {aviso && <div className="wa-aviso">{aviso}</div>}

      <style jsx global>{`
        :root {
          --wa-fondo: #f0f2f5; --wa-panel: #ffffff; --wa-borde: #e9edef; --wa-texto: #111b21; --wa-suave: #667781;
          --wa-verde: #00a884; --wa-verde-oscuro: #008069; --wa-saliente: #d9fdd3; --wa-entrante: #ffffff; --wa-chat: #efeae2;
          --wa-activo: #f0f2f5; --wa-hover: #f5f6f6;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --wa-fondo: #0b141a; --wa-panel: #111b21; --wa-borde: #222d34; --wa-texto: #e9edef; --wa-suave: #8696a0;
            --wa-saliente: #005c4b; --wa-entrante: #202c33; --wa-chat: #0b141a; --wa-activo: #2a3942; --wa-hover: #202c33;
          }
        }
        html, body { margin: 0; background: var(--wa-fondo); }
        .wa { display: flex; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: var(--wa-texto); background: var(--wa-fondo); overflow: hidden; }
        .wa-lista { width: 33%; min-width: 340px; max-width: 620px; background: var(--wa-panel); border-right: 1px solid var(--wa-borde); display: flex; flex-direction: column; }
        .wa-chat { flex: 1; display: flex; flex-direction: column; background: var(--wa-chat); min-width: 0; }
        .wa-top { height: 60px; padding: 0 16px; display: flex; align-items: center; gap: 12px; background: var(--wa-fondo); border-bottom: 1px solid var(--wa-borde); flex-shrink: 0; }
        .wa-yo { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
        .wa-yo-nombre { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wa-link { color: var(--wa-verde-oscuro); font-size: 14px; text-decoration: none; font-weight: 600; }
        .wa-avatar { width: 49px; height: 49px; border-radius: 50%; background: #dfe5e7; color: #54656f; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; flex-shrink: 0; }
        .wa-avatar-chico { width: 40px; height: 40px; font-size: 16px; }
        .wa-avatar { overflow: hidden; }
        .wa-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .wa-buscar { padding: 8px 12px; background: var(--wa-panel); }
        .wa-buscar input { width: 100%; box-sizing: border-box; border: none; background: var(--wa-fondo); color: var(--wa-texto); border-radius: 8px; padding: 9px 14px; font-size: 14px; outline: none; }
        .wa-chips { display: flex; gap: 6px; padding: 4px 12px 10px; overflow-x: auto; flex-shrink: 0; }
        .wa-chips button { border: none; background: var(--wa-fondo); color: var(--wa-suave); padding: 6px 12px; border-radius: 16px; font-size: 13px; cursor: pointer; white-space: nowrap; }
        .wa-chips button.on { background: #d9fdd3; color: #008069; font-weight: 600; }
        .wa-items { overflow-y: auto; flex: 1; }
        .wa-vacio { padding: 30px; text-align: center; color: var(--wa-suave); font-size: 14px; }
        .wa-item { display: flex; gap: 12px; padding: 10px 14px; cursor: pointer; border-bottom: 1px solid var(--wa-borde); }
        .wa-item:hover { background: var(--wa-hover); }
        .wa-item.activo { background: var(--wa-activo); }
        .wa-item-cuerpo { flex: 1; min-width: 0; }
        .wa-item-fila { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .wa-item-nombre { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wa-item-nombre.fuerte { font-weight: 700; }
        .wa-item-hora { font-size: 12px; color: var(--wa-suave); flex-shrink: 0; }
        .wa-item-hora.verde { color: var(--wa-verde); font-weight: 600; }
        .wa-item-ultimo { font-size: 14px; color: var(--wa-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wa-burbuja-nueva { color: var(--wa-verde); font-size: 14px; }
        .wa-item-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; align-items: center; }
        .wa-tag { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #e7f3ef; color: #0b6e5a; display: inline-flex; align-items: center; gap: 4px; }
        .wa-tag.azul { background: #e3f0fb; color: #1d5fa0; }
        .wa-tag.rojo { background: #fde8e8; color: #b42318; }
        .wa-tag.violeta { background: #efe9fb; color: #5b21b6; }
        .wa-tag.naranja { background: #fff1e0; color: #9a4a00; }
        .wa-tag.gris { background: #eef1f3; color: #54656f; }
        .wa-chips-etiquetas { padding-top: 0; }
        .wa-lineas { display: flex; gap: 6px; padding: 0 12px 8px; overflow-x: auto; flex-shrink: 0; }
        .wa-lineas button { border: 1px solid var(--wa-borde); background: var(--wa-panel); color: var(--wa-texto); padding: 6px 12px; border-radius: 8px; font-size: 13px; cursor: pointer; white-space: nowrap; }
        .wa-lineas button.on { border-color: var(--wa-verde); color: var(--wa-verde-oscuro); font-weight: 600; }
        .wa-chips-etiquetas button { font-size: 12px; padding: 4px 10px; }
        .wa-conexion { font-size: 12px; font-weight: 600; white-space: nowrap; }
        .wa-conexion.ok { color: var(--wa-verde); }
        .wa-conexion.caida { color: #d93025; }
        .wa-x { border: none; background: none; cursor: pointer; color: inherit; padding: 0; font-size: 13px; }
        .wa-tag-input { border: 1px dashed var(--wa-borde); background: transparent; color: var(--wa-texto); border-radius: 10px; padding: 3px 8px; font-size: 12px; width: 110px; outline: none; }
        .wa-bienvenida { margin: auto; text-align: center; color: var(--wa-suave); padding: 24px; max-width: 420px; }
        .wa-bienvenida-icono { font-size: 56px; }
        .wa-bienvenida h2 { color: var(--wa-texto); font-weight: 400; }
        .wa-chat-top { background: var(--wa-fondo); }
        .wa-volver { display: none; border: none; background: none; font-size: 28px; color: var(--wa-suave); cursor: pointer; padding: 0 4px; }
        .wa-chat-titulo { flex: 1; min-width: 0; cursor: pointer; }
        .wa-chat-nombre { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wa-chat-sub { font-size: 13px; color: var(--wa-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wa-boton-claro { border: 1px solid var(--wa-borde); background: var(--wa-panel); color: var(--wa-texto); border-radius: 18px; padding: 6px 12px; font-size: 13px; cursor: pointer; white-space: nowrap; }
        .wa-boton-verde { border: none; background: var(--wa-verde); color: white; border-radius: 18px; padding: 7px 14px; font-size: 13px; cursor: pointer; }
        .wa-ficha { background: var(--wa-panel); border-bottom: 1px solid var(--wa-borde); padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
        .wa-ficha-fila { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .wa-ficha-fila.columna { flex-direction: column; align-items: flex-start; gap: 6px; }
        .wa-ficha-titulo { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--wa-suave); font-weight: 600; min-width: 80px; }
        .wa-ficha select, .wa-seguimiento input { border: 1px solid var(--wa-borde); background: var(--wa-panel); color: var(--wa-texto); border-radius: 8px; padding: 6px 10px; font-size: 13px; }
        .wa-seguimiento { display: flex; gap: 8px; flex-wrap: wrap; width: 100%; }
        .wa-seguimiento input:nth-child(2) { flex: 1; min-width: 180px; }
        .wa-banda { background: #e3f0fb; color: #1d5fa0; font-size: 13px; padding: 8px 16px; }
        .wa-banda.roja { background: #fde8e8; color: #b42318; }
        .wa-mensajes { flex: 1; overflow-y: auto; padding: 16px 6% 8px; display: flex; flex-direction: column; gap: 2px; }
        .wa-dia { text-align: center; margin: 10px 0; }
        .wa-dia span { background: var(--wa-panel); color: var(--wa-suave); font-size: 12px; padding: 5px 12px; border-radius: 8px; box-shadow: 0 1px .5px rgba(11,20,26,.13); }
        .wa-fila { display: flex; margin: 1px 0; }
        .wa-fila.izq { justify-content: flex-start; }
        .wa-fila.der { justify-content: flex-end; }
        .wa-globo { max-width: 65%; padding: 6px 9px 4px; border-radius: 8px; box-shadow: 0 1px .5px rgba(11,20,26,.13); font-size: 14.2px; line-height: 19px; word-wrap: break-word; }
        .wa-globo.entrante { background: var(--wa-entrante); border-top-left-radius: 0; }
        .wa-globo.saliente { background: var(--wa-saliente); border-top-right-radius: 0; }
        .wa-quien { font-size: 11.5px; color: var(--wa-verde-oscuro); font-weight: 600; margin-bottom: 2px; }
        .wa-texto { white-space: normal; }
        .wa-hora { font-size: 11px; color: var(--wa-suave); text-align: right; margin-top: 2px; }
        .wa-img { display: block; max-width: 100%; max-height: 340px; border-radius: 6px; margin-bottom: 4px; }
        .wa-sticker { display: block; width: 130px; }
        .wa-audio { display: block; width: 260px; max-width: 100%; margin-bottom: 2px; }
        .wa-audio-fila { display: flex; align-items: center; gap: 6px; }
        .wa-vel { border: none; background: rgba(0,0,0,.08); color: var(--wa-texto); border-radius: 12px; padding: 4px 8px; font-size: 12px; font-weight: 700; cursor: pointer; min-width: 40px; }
        .wa-globo { position: relative; }
        .wa-menu-btn { position: absolute; top: 2px; right: 4px; border: none; background: transparent; color: var(--wa-suave); cursor: pointer; font-size: 14px; opacity: 0; padding: 0 4px; }
        .wa-globo:hover .wa-menu-btn { opacity: 1; }
        .wa-menu { position: absolute; top: 22px; right: 4px; background: var(--wa-panel); border: 1px solid var(--wa-borde); border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.15); z-index: 5; display: flex; flex-direction: column; }
        .wa-menu button { border: none; background: none; text-align: left; padding: 8px 14px; font-size: 14px; cursor: pointer; color: var(--wa-texto); white-space: nowrap; }
        .wa-menu button:hover { background: var(--wa-hover); }
        .wa-cita { background: rgba(0,0,0,.05); border-left: 4px solid #06cf9c; border-radius: 6px; padding: 5px 8px; margin: 2px 0 5px; display: flex; flex-direction: column; font-size: 13px; max-width: 100%; }
        .wa-cita.mia { border-left-color: #53bdeb; }
        .wa-cita b { color: #06a77d; font-size: 12.5px; }
        .wa-cita.mia b { color: #3a9fd0; }
        .wa-cita span { color: var(--wa-suave); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; white-space: pre-wrap; }
        .wa-cita-caja { display: flex; align-items: center; gap: 8px; padding: 6px 6px 4px; }
        .wa-borrado { color: var(--wa-suave); font-style: italic; }
        .wa-editar textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--wa-borde); border-radius: 6px; padding: 6px; font-family: inherit; font-size: 14px; margin-bottom: 6px; background: var(--wa-panel); color: var(--wa-texto); }
        .wa-tilde { color: var(--wa-suave); letter-spacing: -3px; margin-left: 2px; }
        .wa-tilde.leido { color: #53bdeb; }
        .wa-doc { border: 1px solid var(--wa-borde); background: rgba(0,0,0,.03); color: inherit; border-radius: 6px; padding: 8px 12px; cursor: pointer; margin-bottom: 4px; }
        .wa-media-load, .wa-media-err { font-size: 12px; color: var(--wa-suave); font-style: italic; margin-bottom: 4px; }
        .wa-rapidas-pop, .wa-rapidas-panel { background: var(--wa-panel); border-top: 1px solid var(--wa-borde); max-height: 45vh; overflow-y: auto; padding: 6px 0; flex-shrink: 0; }
        .wa-rapidas-titulo { font-size: 12px; color: var(--wa-suave); font-weight: 600; padding: 8px 14px 4px; }
        .wa-rapida { display: flex; align-items: flex-start; gap: 8px; padding: 8px 14px; cursor: pointer; }
        .wa-rapida:hover { background: var(--wa-hover); }
        .wa-rapida-atajo { font-size: 14px; font-weight: 600; }
        .wa-rapida-texto { font-size: 13px; color: var(--wa-suave); white-space: pre-wrap; max-height: 60px; overflow: hidden; }
        .wa-archivos { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 14px 8px; }
        .wa-archivo { border: 1px solid var(--wa-borde); background: var(--wa-fondo); color: var(--wa-texto); border-radius: 16px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
        .wa-rapida-nueva { display: flex; flex-direction: column; gap: 6px; padding: 8px 14px; border-top: 1px solid var(--wa-borde); }
        .wa-rapida-nueva input, .wa-rapida-nueva textarea, .wa-rapida-nueva select { border: 1px solid var(--wa-borde); background: var(--wa-panel); color: var(--wa-texto); border-radius: 8px; padding: 7px 10px; font-size: 13px; font-family: inherit; }
        .wa-rapida-nueva .wa-boton-verde { align-self: flex-start; }
        .wa-escribir { padding: 8px 16px 12px; background: var(--wa-chat); flex-shrink: 0; }
        .wa-caja { background: var(--wa-panel); border-radius: 24px; padding: 8px 12px 4px; box-shadow: 0 1px 2px rgba(11,20,26,.1); }
        .wa-caja textarea { width: 100%; box-sizing: border-box; resize: none; border: none; padding: 8px 6px; font-size: 15px; font-family: inherit; background: transparent; color: var(--wa-texto); outline: none; max-height: 160px; line-height: 20px; }
        .wa-caja-fila { display: flex; align-items: center; gap: 6px; }
        .wa-chip-rapidas { border: 1px solid var(--wa-borde); background: var(--wa-panel); color: var(--wa-texto); border-radius: 16px; padding: 5px 12px; font-size: 13px; cursor: pointer; font-weight: 600; }
        .wa-icono { border: none; background: none; font-size: 20px; cursor: pointer; padding: 4px 6px; }
        .wa-enviar { border: none; background: var(--wa-verde); color: white; width: 38px; height: 38px; border-radius: 50%; font-size: 18px; cursor: pointer; flex-shrink: 0; }
        .wa-enviar:disabled, .wa-icono:disabled { opacity: .5; cursor: default; }
        .wa-grabando { flex: 1; color: #d93025; font-weight: 600; padding: 10px; }
        .wa-aviso { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: #111b21; color: white; padding: 10px 18px; border-radius: 8px; font-size: 14px; z-index: 50; max-width: 90vw; }
        @media (max-width: 760px) {
          .wa-lista { width: 100%; min-width: 0; border-right: none; }
          .oculta-movil { display: none !important; }
          .wa-volver { display: block; }
          .wa-globo { max-width: 85%; }
          .wa-mensajes { padding: 12px 10px 8px; }
        }
      `}</style>
    </div>
  );
}
