import { useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import ConversationsPanel from '../components/ConversationsPanel';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Conversations() {
  const router = useRouter();

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    if (!localStorage.getItem('whabot_token')) router.push('/login');
  }, []);

  const downloadCSV = (rows, headers, filename) => {
    const escape = (val) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const csvContent = [
      headers.map(h => escape(h.label)).join(','),
      ...rows.map(row => headers.map(h => escape(h.get(row))).join(','))
    ].join('\n');

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportConversationsCSV = async () => {
    try {
      const res = await axios.get(`${API}/api/bot/conversations`, { headers: getHeaders() });
      downloadCSV(
        res.data,
        [
          { label: 'Cliente', get: c => c.customer_name || c.customer_phone },
          { label: 'Teléfono', get: c => c.customer_phone },
          { label: 'Canal', get: c => c.channel },
          { label: 'Estado', get: c => c.status === 'bot' ? 'Bot' : 'Humano' },
          { label: 'Tags', get: c => (c.tags || []).join('; ') },
          { label: 'Archivado', get: c => c.archived ? 'Sí' : 'No' },
          { label: 'Último mensaje', get: c => c.last_message },
          { label: 'Cantidad de mensajes', get: c => c.message_count },
          { label: 'Último contacto', get: c => new Date(c.last_message_at || c.updated_at).toLocaleString('es-AR') },
        ],
        `waibo-conversaciones-${new Date().toISOString().slice(0, 10)}.csv`
      );
    } catch {
      alert('Error exportando las conversaciones. Intentá de nuevo.');
    }
  };

  const exportAllMessagesCSV = async () => {
    try {
      const res = await axios.get(`${API}/api/bot/export/messages`, { headers: getHeaders() });
      downloadCSV(
        res.data,
        [
          { label: 'Cliente', get: m => m.customer_name || m.customer_phone },
          { label: 'Teléfono', get: m => m.customer_phone },
          { label: 'Canal', get: m => m.channel },
          { label: 'Quién escribió', get: m => m.role === 'user' ? 'Cliente' : 'Bot/Negocio' },
          { label: 'Mensaje', get: m => m.content },
          { label: 'Fecha y hora', get: m => new Date(m.timestamp).toLocaleString('es-AR') },
        ],
        `waibo-mensajes-completo-${new Date().toISOString().slice(0, 10)}.csv`
      );
    } catch {
      alert('Error exportando los mensajes. Intentá de nuevo.');
    }
  };

  return (
    <div className="dashboard">
      <Sidebar active="conversations" />
      <div className="main-content">
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1>💬 Conversaciones</h1>
            <p>Historial de todos los chats de tus clientes</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportConversationsCSV} className="btn btn-secondary" style={{ width: 'auto', fontSize: 12, padding: '7px 14px' }}>
              📊 Exportar resumen (CSV)
            </button>
            <button onClick={exportAllMessagesCSV} className="btn btn-secondary" style={{ width: 'auto', fontSize: 12, padding: '7px 14px' }}>
              📄 Exportar todos los mensajes (CSV)
            </button>
          </div>
        </div>

        <ConversationsPanel />
      </div>
    </div>
  );
}
