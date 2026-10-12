import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL;

const KIND_ICON = { image: '🖼️', video: '🎬', document: '📄', link: '🔗', audio: '🎙️' };

function mmss(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function tamano(bytes) {
  if (!bytes) return '';
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

// Recursos (fotos, videos, archivos, links) que el bot manda por WhatsApp,
// y reglas de etiquetado/archivado. Aplica al canal WhatsApp por QR.
export default function ResourcesPanel() {
  const [resources, setResources] = useState([]);
  const [labels, setLabels] = useState([]);
  const [labelsLoaded, setLabelsLoaded] = useState(false);
  const [config, setConfig] = useState(null);
  const [labelInstructions, setLabelInstructions] = useState('');
  const [actionsEnabled, setActionsEnabled] = useState(true);
  const [form, setForm] = useState({ name: '', description: '', url: '', file: null });
  const [mode, setMode] = useState('file');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Grabación desde el micrófono
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef(null);
  const timerRef = useRef(null);

  // Reproducción de audios guardados
  const [playing, setPlaying] = useState(null); // { id, url }

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });
  const flash = (setter, msg, ms = 4000) => { setter(msg); setTimeout(() => setter(''), ms); };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      const partes = [];
      rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(partes, { type: rec.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
      };
      recorderRef.current = rec;
      rec.start();
      setRecordedBlob(null);
      setRecordedUrl(null);
      setRecordSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      flash(setError, 'No se pudo usar el micrófono. Revisá que el navegador tenga permiso.');
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    recorderRef.current?.stop();
    setRecording(false);
  };

  const playResource = async (r) => {
    if (playing?.id === r.id) { setPlaying(null); return; }
    try {
      const res = await axios.get(`${API}/api/resources/${r.id}/file`, { headers: getHeaders(), responseType: 'blob' });
      setPlaying({ id: r.id, url: URL.createObjectURL(res.data) });
    } catch { flash(setError, 'No se pudo cargar el audio.'); }
  };

  const loadResources = async () => {
    try {
      const r = await axios.get(`${API}/api/resources`, { headers: getHeaders() });
      setResources(r.data);
    } catch { setError('No se pudieron cargar los recursos.'); }
  };

  useEffect(() => {
    loadResources();
    axios.get(`${API}/api/bot/config`, { headers: getHeaders() }).then(r => {
      setConfig(r.data);
      setLabelInstructions(r.data.label_instructions || '');
      setActionsEnabled(r.data.whatsapp_actions_enabled !== false);
    }).catch(() => {});
    axios.get(`${API}/api/whatsapp-qr/labels`, { headers: getHeaders() })
      .then(r => setLabels(r.data.labels || []))
      .catch(() => {})
      .finally(() => setLabelsLoaded(true));
  }, []);

  const saveRules = async () => {
    if (!config) return;
    setBusy(true); setError('');
    try {
      const r = await axios.put(`${API}/api/bot/config`,
        { ...config, label_instructions: labelInstructions, whatsapp_actions_enabled: actionsEnabled },
        { headers: getHeaders() });
      setConfig(r.data);
      flash(setSuccess, '¡Reglas guardadas!');
    } catch { flash(setError, 'Error guardando las reglas.'); }
    finally { setBusy(false); }
  };

  const addResource = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { flash(setError, 'Poné un nombre para el recurso.'); return; }
    setBusy(true); setError('');
    try {
      if (mode === 'file' || mode === 'record') {
        const archivo = mode === 'record'
          ? (recordedBlob && new File([recordedBlob], 'grabacion.webm', { type: recordedBlob.type || 'audio/webm' }))
          : form.file;
        if (!archivo) { flash(setError, mode === 'record' ? 'Primero grabá el audio.' : 'Elegí un archivo.'); setBusy(false); return; }
        const fd = new FormData();
        fd.append('file', archivo);
        fd.append('name', form.name);
        fd.append('description', form.description);
        await axios.post(`${API}/api/resources/file`, fd, { headers: { ...getHeaders(), 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
        setRecordedBlob(null);
        setRecordedUrl(null);
      } else {
        await axios.post(`${API}/api/resources/link`, { name: form.name, description: form.description, url: form.url }, { headers: getHeaders() });
      }
      setForm({ name: '', description: '', url: '', file: null });
      e.target.reset();
      flash(setSuccess, '¡Recurso agregado! El bot ya lo puede mandar.');
      loadResources();
    } catch (err) {
      flash(setError, err.response?.data?.error || 'Error subiendo el recurso.');
    } finally { setBusy(false); }
  };

  const deleteResource = async (id) => {
    if (!confirm('¿Eliminar este recurso?')) return;
    await axios.delete(`${API}/api/resources/${id}`, { headers: getHeaders() });
    loadResources();
  };

  return (
    <div>
      {success && <div className="success-msg">✅ {success}</div>}
      {error && <div className="error-msg">❌ {error}</div>}

      <div className="card">
        <div className="card-title">🏷️ Etiquetas y archivado</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Con WhatsApp conectado por QR, el bot usa las etiquetas reales de tu WhatsApp Business y archiva chats según lo que le indiques acá.
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={actionsEnabled} onChange={e => setActionsEnabled(e.target.checked)} style={{ width: 'auto' }} />
          El bot puede mandar recursos, etiquetar y archivar
        </label>

        <div style={{ fontSize: 13, marginBottom: 10 }}>
          <strong>Tus etiquetas de WhatsApp: </strong>
          {!labelsLoaded ? 'cargando…'
            : labels.length ? labels.map(l => (
              <span key={l} style={{ display: 'inline-block', fontSize: 12, padding: '2px 10px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6', margin: '2px 4px 2px 0' }}>{l}</span>
            ))
            : <span style={{ color: 'var(--text-muted)' }}>no se ven etiquetas — conectá WhatsApp Business por QR en la página WhatsApp. Las etiquetas se crean desde la app del celular.</span>}
        </div>

        <div className="form-group">
          <label>Cuándo usar cada etiqueta y cuándo archivar</label>
          <textarea
            style={{ minHeight: 130 }}
            placeholder={'Ej:\n- "Interesado": cuando pregunta precio o pide info del curso\n- "Inscripto": cuando confirma que pagó\n- Archivá el chat cuando el cliente dice que no le interesa o ya se inscribió'}
            value={labelInstructions}
            onChange={e => setLabelInstructions(e.target.value)}
          />
        </div>
        <button onClick={saveRules} disabled={busy || !config} className="btn btn-primary" style={{ width: 'auto', padding: '10px 22px' }}>
          {busy ? 'Guardando…' : '💾 Guardar reglas'}
        </button>
      </div>

      <div className="card">
        <div className="card-title">📎 Fotos, videos, audios y archivos para mandar</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          El bot decide cuándo mandar cada uno según la charla. Describí bien cada recurso: la IA lo elige por la descripción. Máximo 16 MB por archivo (límite de WhatsApp).
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[{ k: 'file', l: '📁 Subir archivo' }, { k: 'record', l: '🎙 Grabar audio' }, { k: 'link', l: '🔗 Link' }].map(t => (
            <button key={t.k} type="button" onClick={() => setMode(t.k)}
              className={`btn ${mode === t.k ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: 'auto', padding: '7px 14px', fontSize: 13 }}>{t.l}</button>
          ))}
        </div>

        <form onSubmit={addResource}>
          <div className="form-group">
            <label>Nombre</label>
            <input placeholder="Ej: Video del curso de PC" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Cuándo mandarlo / qué muestra</label>
            <input placeholder="Ej: Muestra una clase real; mandalo cuando pregunten cómo son las clases" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          {mode === 'file' ? (
            <div className="form-group">
              <label>Archivo (imagen, video, audio o PDF)</label>
              <input type="file" accept="image/*,video/*,audio/*,application/pdf,.ogg,.opus,.m4a,.mp3" onChange={e => setForm({ ...form, file: e.target.files[0] || null })} style={{ padding: '8px 0' }} />
              <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>Los audios se mandan como nota de voz, como si los grabaras en el momento.</small>
            </div>
          ) : mode === 'record' ? (
            <div className="form-group">
              <label>Grabación</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                {recording ? (
                  <>
                    <span style={{ color: '#DC2626', fontWeight: 700, fontSize: 14 }}>● Grabando {mmss(recordSeconds)}</span>
                    <button type="button" onClick={stopRecording} className="btn btn-primary" style={{ width: 'auto', padding: '8px 16px' }}>⏹ Terminar</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={startRecording} className="btn btn-secondary" style={{ width: 'auto', padding: '8px 16px' }}>
                      🎙 {recordedUrl ? 'Grabar de nuevo' : 'Empezar a grabar'}
                    </button>
                    {recordedUrl && <audio controls src={recordedUrl} style={{ height: 36 }} />}
                  </>
                )}
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>Grabá con el micrófono de la compu, escuchalo y si te gusta agregalo. Hablá natural, como en un audio de WhatsApp.</small>
            </div>
          ) : (
            <div className="form-group">
              <label>Link</label>
              <input type="url" placeholder="https://…" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
            </div>
          )}
          <button type="submit" disabled={busy} className="btn btn-primary" style={{ width: 'auto', padding: '10px 22px' }}>
            {busy ? 'Subiendo…' : '➕ Agregar recurso'}
          </button>
        </form>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {resources.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>Todavía no cargaste recursos.</p>
          ) : resources.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' }}>
              <span style={{ fontSize: 22 }}>{KIND_ICON[r.kind] || '📎'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {r.kind === 'audio' && 'Nota de voz · '}{r.description || 'sin descripción'}{r.size_bytes ? ` · ${tamano(r.size_bytes)}` : ''}{r.url ? ` · ${r.url}` : ''}
                </div>
                {playing?.id === r.id && <audio controls autoPlay src={playing.url} style={{ height: 32, marginTop: 6 }} />}
              </div>
              {r.kind === 'audio' && (
                <button onClick={() => playResource(r)} title={playing?.id === r.id ? 'Cerrar' : 'Escuchar'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>{playing?.id === r.id ? '⏹' : '▶️'}</button>
              )}
              <button onClick={() => deleteResource(r.id)} title="Eliminar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 18 }}>🗑</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
