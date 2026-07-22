import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Knowledge() {
  const router = useRouter();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('text');
  const [form, setForm] = useState({ title: '', content: '', url: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [qrStatus, setQrStatus] = useState(null);
  const [qrPolling, setQrPolling] = useState(null);

  const getHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('whabot_token')}`
  });

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/login'); return; }
    loadEntries();
  }, []);

  const loadEntries = async () => {
    try {
      const res = await axios.get(`${API}/api/knowledge`, { headers: getHeaders() });
      setEntries(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleAddText = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      await axios.post(`${API}/api/knowledge/text`, {
        title: form.title, content: form.content
      }, { headers: getHeaders() });
      setForm({ title: '', content: '', url: '' });
      setSuccess('¡Información agregada! El bot ya puede usarla.');
      loadEntries();
    } catch (err) {
      setError(err.response?.data?.error || 'Error guardando');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 4000);
    }
  };

  const handleAddURL = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await axios.post(`${API}/api/knowledge/url`, { url: form.url }, { headers: getHeaders() });
      setForm({ title: '', content: '', url: '' });
      setSuccess(`✅ Se importaron ${res.data.chars?.toLocaleString()} caracteres de la web.`);
      loadEntries();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo acceder a esa URL');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 5000);
    }
  };

  const startQR = async () => {
    setError('');
    try {
      await axios.post(`${API}/api/whatsapp-qr/connect`, {}, { headers: getHeaders() });
      setQrStatus({ status: 'starting', qr: null });
      const interval = setInterval(async () => {
        try {
          const res = await axios.get(`${API}/api/whatsapp-qr/status`, { headers: getHeaders() });
          setQrStatus(res.data);
          if (res.data.status === 'connected') {
            clearInterval(interval);
            setQrPolling(null);
            setSuccess('✅ WhatsApp vinculado — el historial se está importando, esperá unos minutos y tocá "Analizar".');
          }
        } catch {}
      }, 3000);
      setQrPolling(interval);
      setTimeout(() => { clearInterval(interval); setQrPolling(null); }, 120000);
    } catch {
      setError('No se pudo iniciar la vinculación. Avisale al soporte de Waibo.');
    }
  };

  const disconnectQR = async () => {
    if (!confirm('¿Desvincular y limpiar? Se eliminan de Waibo todas las conversaciones importadas (lo que el bot aprendió se conserva). Acordate de cerrar la sesión también en tu celular: WhatsApp → Dispositivos vinculados.')) return;
    if (qrPolling) { clearInterval(qrPolling); setQrPolling(null); }
    try {
      const res = await axios.post(`${API}/api/whatsapp-qr/disconnect`, {}, { headers: getHeaders() });
      setQrStatus(null);
      setSuccess(`Desvinculado. Se eliminaron ${res.data.deleted_conversations ?? 0} conversaciones importadas.`);
    } catch {
      setError('Error al desvincular. Intentá de nuevo.');
    }
  };

  const handleLearnFromChats = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const texts = await Promise.all(files.map(f => f.text()));
      let combined = texts.join('\n\n');
      const MAX = 150000;
      if (combined.length > MAX) combined = combined.slice(-MAX);

      const res = await axios.post(`${API}/api/bot/learn-from-chats`,
        { chats: combined },
        { headers: getHeaders(), timeout: 120000 });

      const parts = [];
      if (res.data.style_saved) parts.push('el bot aprendió tu estilo de conversación');
      if (res.data.knowledge_saved > 0) parts.push(`se agregaron ${res.data.knowledge_saved} entradas a la base de conocimiento`);
      setSuccess(`¡Listo! ${parts.join(' y ')}. Probalo en "Probar bot".`);
      loadEntries();
    } catch (err) {
      setError(err.response?.data?.error || 'Error analizando los chats. Intentá de nuevo.');
    } finally {
      setSaving(false);
      e.target.value = '';
      setTimeout(() => setSuccess(''), 8000);
    }
  };

  const handleLearnFromHistory = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await axios.post(`${API}/api/bot/learn-from-chats`,
        { from_history: true },
        { headers: getHeaders(), timeout: 120000 });
      const parts = [];
      if (res.data.style_saved) parts.push('el bot aprendió tu estilo de conversación');
      if (res.data.knowledge_saved > 0) parts.push(`se agregaron ${res.data.knowledge_saved} entradas a la base de conocimiento`);
      setSuccess(`¡Listo! ${parts.join(' y ')}. Probalo en "Probar bot".`);
      loadEntries();
    } catch (err) {
      setError(err.response?.data?.error || 'Error analizando las conversaciones. Intentá de nuevo.');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 8000);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSaving(true); setError(''); setSuccess('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post(`${API}/api/knowledge/file`, formData, {
        headers: { ...getHeaders(), 'Content-Type': 'multipart/form-data' }
      });
      setSuccess('¡Archivo subido! El bot ya puede usar su contenido.');
      loadEntries();
    } catch (err) {
      setError(err.response?.data?.error || 'Error subiendo archivo');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 4000);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminár esta entrada?')) return;
    await axios.delete(`${API}/api/knowledge/${id}`, { headers: getHeaders() });
    loadEntries();
  };

  const [refreshing, setRefreshing] = useState(null);

  const handleRefreshURL = async (id) => {
    setRefreshing(id);
    setError(''); setSuccess('');
    try {
      const res = await axios.put(`${API}/api/knowledge/url/${id}`, {}, { headers: getHeaders() });
      setSuccess(`✅ Contenido actualizado (${res.data.chars?.toLocaleString()} caracteres importados)`);
      loadEntries();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar la URL');
    } finally {
      setRefreshing(null);
      setTimeout(() => setSuccess(''), 5000);
    }
  };

  const exportKnowledgeBase = async (format) => {
    try {
      const res = await axios.get(`${API}/api/knowledge/export`, { headers: getHeaders() });
      const data = res.data;
      const dateStr = new Date().toISOString().slice(0, 10);

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `waibo-base-conocimiento-${dateStr}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const escape = (val) => {
          const str = String(val ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        const headers = ['Tipo', 'Título', 'Contenido', 'URL fuente', 'Fecha de creación'];
        const csvContent = [
          headers.join(','),
          ...data.map(entry => [
            escape(entry.type),
            escape(entry.title),
            escape(entry.content),
            escape(entry.source_url || ''),
            escape(new Date(entry.created_at).toLocaleString('es-AR'))
          ].join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `waibo-base-conocimiento-${dateStr}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      setError('Error exportando la base de conocimiento');
    }
  };

  const typeIcon = { text: '📝', url: '🌐', file: '📄' };

  return (
    <div className="dashboard">
      <Sidebar active="knowledge" />
      <div className="main-content">
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1>🧠 Base de conocimiento</h1>
            <p>Todo lo que le enseñés acá, el bot lo va a saber responder automáticamente</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => exportKnowledgeBase('json')} className="btn btn-secondary" style={{ width: 'auto', fontSize: 12, padding: '7px 14px' }}>
              💾 Backup (JSON)
            </button>
            <button onClick={() => exportKnowledgeBase('csv')} className="btn btn-secondary" style={{ width: 'auto', fontSize: 12, padding: '7px 14px' }}>
              📊 Exportar (CSV)
            </button>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
            {[
              { key: 'text', label: '📝 Texto libre' },
              { key: 'url', label: '🌐 Importar web' },
              { key: 'file', label: '📄 Subir archivo' },
              { key: 'chats', label: '💬 Aprender de tus chats' }
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
                style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {success && <div className="success-msg">✅ {success}</div>}
          {error && <div className="error-msg">❌ {error}</div>}

          {tab === 'text' && (
            <form onSubmit={handleAddText}>
              <div className="form-group">
                <label>Título (para identificarlo)</label>
                <input
                  placeholder="Ej: Horarios, Precios 2024, Política de devolución..."
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Contenido</label>
                <textarea
                  style={{ minHeight: 160 }}
                  placeholder="Pegá acá cualquier información: precios, horarios, FAQs, instrucciones, menú, catálogo, condiciones, etc."
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  required
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: 'auto', padding: '10px 24px' }}>
                {saving ? 'Guardando...' : '💾 Agregar al bot'}
              </button>
            </form>
          )}

          {tab === 'url' && (
            <form onSubmit={handleAddURL}>
              <div className="form-group">
                <label>URL de tu sitio web</label>
                <input
                  type="url"
                  placeholder="https://tu-negocio.com/menu"
                  value={form.url}
                  onChange={e => setForm({ ...form, url: e.target.value })}
                  required
                />
                <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  El sistema va a leer el contenido de esa página automáticamente y se lo va a enseñar al bot.
                </small>
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: 'auto', padding: '10px 24px' }}>
                {saving ? 'Leyendo página...' : '🌐 Importar contenido'}
              </button>
            </form>
          )}

          {tab === 'chats' && (
            <div>
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: '#166534' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>✨ Entrená al bot con tus conversaciones reales</div>
                <p style={{ margin: 0 }}>
                  La IA analiza tus chats y aprende <strong>cómo hablás con tus clientes</strong>: tu tono, tus frases, cómo pasás precios y cómo cerrás ventas. También extrae precios e info frecuente y la agrega a la base de conocimiento.
                </p>
              </div>

              {/* Paso 1: importar historial por QR */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>1️⃣ Importá tu historial de WhatsApp (recomendado)</div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 10px' }}>
                  Vinculá tu WhatsApp escaneando un QR y Waibo importa automáticamente ~90 días de conversaciones, con etiquetas y archivados. El bot <strong>no responde</strong> por este canal — es solo para importar. Cuando desvinculás, las conversaciones importadas se eliminan (lo aprendido se conserva).
                </p>
                {qrStatus?.status === 'connected' ? (
                  <div>
                    <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 13 }}>
                      ✅ <strong>WhatsApp vinculado</strong> — el historial se importa solo (tarda unos minutos).
                    </div>
                    <button onClick={disconnectQR} className="btn btn-secondary" style={{ width: 'auto', fontSize: 13 }}>
                      🔌 Desvincular y limpiar
                    </button>
                  </div>
                ) : qrStatus?.status === 'qr_ready' && qrStatus?.qr ? (
                  <div style={{ textAlign: 'center', padding: '6px 0' }}>
                    <p style={{ fontSize: 13, marginBottom: 10 }}>
                      En tu celular: <strong>WhatsApp → Configuración → Dispositivos vinculados → Vincular dispositivo</strong> y escaneá:
                    </p>
                    <img src={qrStatus.qr} alt="QR WhatsApp" style={{ width: 200, height: 200, borderRadius: 12, border: '2px solid var(--border)' }} />
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>El código expira en 60 segundos — si caduca, tocá el botón de nuevo.</p>
                  </div>
                ) : qrStatus?.status === 'starting' || qrStatus?.status === 'connecting' ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>🔄 Generando código QR...</p>
                ) : (
                  <button onClick={startQR} className="btn btn-primary" style={{ width: 'auto', padding: '10px 20px' }}>
                    📲 Vincular WhatsApp por QR
                  </button>
                )}
              </div>

              {/* Paso 2: analizar */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>2️⃣ Analizá tus conversaciones</div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 10px' }}>
                  Con el historial importado (o conversaciones acumuladas por el canal oficial), la IA aprende tu estilo y extrae la información útil.
                </p>
                <button
                  onClick={handleLearnFromHistory}
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ width: 'auto', padding: '10px 20px' }}
                >
                  {saving ? '🧠 Analizando...' : '⚡ Analizar mis conversaciones'}
                </button>
                {saving && <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>🧠 Analizando... esto puede tardar un minuto.</p>}
              </div>

              {/* Alternativa: subir .txt */}
              <details style={{ fontSize: 13 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-muted)' }}>Alternativa: subir chats exportados a mano (.txt)</summary>
                <div className="form-group" style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                    En WhatsApp: abrí un chat → ⋮ → Más → Exportar chat → <em>Sin archivos</em>. Subí los .txt acá (podés seleccionar varios).
                  </p>
                  <input
                    type="file"
                    accept=".txt"
                    multiple
                    onChange={handleLearnFromChats}
                    disabled={saving}
                    style={{ padding: '8px 0' }}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    Se analizan hasta ~150.000 caracteres (lo más reciente tiene prioridad).
                  </small>
                </div>
              </details>
            </div>
          )}

          {tab === 'file' && (
            <div>
              <div className="form-group">
                <label>Subí un archivo PDF o TXT</label>
                <input
                  type="file"
                  accept=".pdf,.txt"
                  onChange={handleFileUpload}
                  disabled={saving}
                  style={{ padding: '8px 0' }}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  Máximo 5MB. El bot va a poder responder sobre el contenido de estos archivos.
                </small>
              </div>
              {saving && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>⏳ Procesando archivo...</p>}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">📚 Entradas actuales ({entries.length})</div>
          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Cargando...</p>
          ) : entries.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
              Todavía no agregaste nada. ¡Empezá por los precios y horarios de tu negocio!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {entries.map(entry => (
                <div key={entry.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px', background: 'var(--bg)', borderRadius: 10,
                  border: '1px solid var(--border)'
                }}>
                  <span style={{ fontSize: 20 }}>{typeIcon[entry.type] || '📝'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {entry.preview}...
                    </div>
                    {entry.source_url && (
                      <a href={entry.source_url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: 'var(--green-dark)' }}>
                        {entry.source_url}
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {entry.type === 'url' && (
                      <button
                        onClick={() => handleRefreshURL(entry.id)}
                        disabled={refreshing === entry.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 4px', color: '#7C3AED' }}
                        title="Re-importar contenido de la web"
                      >{refreshing === entry.id ? '⏳' : '🔄'}</button>
                    )}
                    <button
                      onClick={() => handleDelete(entry.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 18, padding: '0 4px' }}
                      title="Eliminar"
                    >🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
