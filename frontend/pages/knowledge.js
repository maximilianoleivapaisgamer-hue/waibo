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

  const getHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('whabot_token')}`
  });

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/'); return; }
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
        link.download = `whabot-base-conocimiento-${dateStr}.json`;
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
        link.download = `whabot-base-conocimiento-${dateStr}.csv`;
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
              { key: 'file', label: '📄 Subir archivo' }
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
                  <button
                    onClick={() => handleDelete(entry.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 18, padding: '0 4px', flexShrink: 0 }}
                    title="Eliminar"
                  >🗑</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
