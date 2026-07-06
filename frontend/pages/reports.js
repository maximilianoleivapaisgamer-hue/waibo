import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

function fmt(n) { return Number(n || 0).toLocaleString('es-AR'); }
function fmtMoney(n) { return '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

function StatCard({ label, value, pct, icon, money }) {
  const up = pct > 0;
  const neutral = pct === 0 || pct === undefined;
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>{label}</div>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, margin: '8px 0 4px', color: '#111827' }}>
        {money ? fmtMoney(value) : fmt(value)}
      </div>
      {pct !== undefined && (
        <div style={{ fontSize: 12, fontWeight: 600, color: neutral ? '#9CA3AF' : up ? '#059669' : '#DC2626' }}>
          {neutral ? '→ Sin cambio' : up ? `↑ ${pct}% vs período anterior` : `↓ ${Math.abs(pct)}% vs período anterior`}
        </div>
      )}
    </div>
  );
}

function HourBar({ hour, count, max }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  const h = parseInt(hour);
  const label = `${h}:00`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <div style={{ width: 36, color: '#6B7280', textAlign: 'right', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 4, height: 18, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: '#7C3AED', height: '100%', borderRadius: 4, transition: 'width .3s' }} />
      </div>
      <div style={{ width: 28, color: '#374151', fontWeight: 600, flexShrink: 0 }}>{count}</div>
    </div>
  );
}

const CHANNEL_LABELS = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', mercadolibre: 'Mercado Libre', tiktok: 'TikTok', webchat: 'Chat web' };
const CHANNEL_COLORS = { whatsapp: '#25D366', instagram: '#E1306C', facebook: '#1877F2', mercadolibre: '#FFE600', tiktok: '#010101', webchat: '#7C3AED' };

export default function Reports() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    if (!localStorage.getItem('whabot_token')) { router.push('/login'); return; }
    load();
  }, [period]);

  async function load() {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/reports/overview?period=${period}`, { headers: headers() });
      setData(r.data);
    } catch { setData(null); }
    setLoading(false);
  }

  const periodLabel = { week: 'últimos 7 días', month: 'últimos 30 días', year: 'último año' }[period];

  const totalConvs = data?.channel_distribution?.reduce((s, c) => s + parseInt(c.count), 0) || 1;
  const maxHour = data?.hourly_distribution ? Math.max(...data.hourly_distribution.map(h => parseInt(h.count)), 1) : 1;
  const peakHour = data?.hourly_distribution?.reduce((a, b) => parseInt(a.count) > parseInt(b.count) ? a : b, { hour: 0, count: 0 });

  return (
    <div className="dashboard">
      <Sidebar active="reports" />
      <div className="main-content">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>📈 Reportes</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6B7280' }}>Métricas de tu negocio — {periodLabel}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['week', '7 días'], ['month', '30 días'], ['year', '1 año']].map(([k, l]) => (
              <button key={k} onClick={() => setPeriod(k)} style={{
                padding: '7px 16px', borderRadius: 8, border: '1.5px solid',
                borderColor: period === k ? '#7C3AED' : '#E5E7EB',
                background: period === k ? '#EDE9FE' : 'white',
                color: period === k ? '#5B21B6' : '#6B7280',
                fontWeight: period === k ? 700 : 400,
                fontSize: 13, cursor: 'pointer'
              }}>{l}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#9CA3AF', padding: 48, textAlign: 'center' }}>Cargando reportes...</div>
        ) : !data ? (
          <div style={{ color: '#9CA3AF', padding: 48, textAlign: 'center' }}>Error cargando datos. Recargá la página.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
              <StatCard label="Conversaciones" value={data.stats.conversations.value} pct={data.stats.conversations.pct} icon="💬" />
              <StatCard label="Mensajes recibidos" value={data.stats.messages.value} pct={data.stats.messages.pct} icon="📩" />
              <StatCard label="Pedidos" value={data.stats.orders.value} pct={data.stats.orders.pct} icon="🛒" />
              <StatCard label="Facturación pedidos" value={data.stats.revenue.value} icon="💰" money />
              <StatCard label="Turnos agendados" value={data.stats.appointments.value} pct={data.stats.appointments.pct} icon="📅" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* Distribución por canal */}
              <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Conversaciones por canal</div>
                {data.channel_distribution.length === 0 ? (
                  <div style={{ color: '#9CA3AF', fontSize: 13 }}>Sin datos en este período</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data.channel_distribution.map(ch => {
                      const pct = Math.round((parseInt(ch.count) / totalConvs) * 100);
                      const color = CHANNEL_COLORS[ch.channel] || '#9CA3AF';
                      const label = CHANNEL_LABELS[ch.channel] || ch.channel;
                      return (
                        <div key={ch.channel}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                            <span style={{ fontWeight: 500 }}>{label}</span>
                            <span style={{ color: '#6B7280' }}>{ch.count} ({pct}%)</span>
                          </div>
                          <div style={{ background: '#F3F4F6', borderRadius: 4, height: 8 }}>
                            <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 4 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Horario pico */}
              <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Horario pico de mensajes</div>
                </div>
                {peakHour && parseInt(peakHour.count) > 0 && (
                  <div style={{ fontSize: 12, color: '#7C3AED', fontWeight: 600, marginBottom: 14 }}>
                    Pico: {parseInt(peakHour.hour)}:00 hs ({peakHour.count} mensajes)
                  </div>
                )}
                {data.hourly_distribution.length === 0 ? (
                  <div style={{ color: '#9CA3AF', fontSize: 13 }}>Sin datos en este período</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 280, overflowY: 'auto' }}>
                    {data.hourly_distribution.map(h => (
                      <HourBar key={h.hour} hour={h.hour} count={parseInt(h.count)} max={maxHour} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Productos más pedidos */}
            {data.top_products.length > 0 && (
              <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB', fontWeight: 700, fontSize: 15 }}>
                  🏆 Productos más pedidos
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB' }}>
                      {['#', 'Producto', 'Unidades', 'Recaudado'].map(h => (
                        <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_products.map((p, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 16px', color: '#9CA3AF', fontWeight: 600 }}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: 500 }}>{p.name}</td>
                        <td style={{ padding: '10px 16px', color: '#374151' }}>{fmt(p.qty)}</td>
                        <td style={{ padding: '10px 16px', color: '#059669', fontWeight: 600 }}>{fmtMoney(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Conversaciones por día */}
            {data.conversations_by_day.length > 0 && (
              <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Conversaciones por día</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                  {(() => {
                    const maxDay = Math.max(...data.conversations_by_day.map(d => parseInt(d.count)), 1);
                    return data.conversations_by_day.map((d, i) => {
                      const h = Math.max(4, Math.round((parseInt(d.count) / maxDay) * 100));
                      const date = new Date(d.day);
                      const label = `${date.getDate()}/${date.getMonth() + 1}`;
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${label}: ${d.count} conversaciones`}>
                          <div style={{ width: '100%', background: '#7C3AED', borderRadius: '3px 3px 0 0', height: `${h}%`, minHeight: 4 }} />
                          {data.conversations_by_day.length <= 14 && (
                            <div style={{ fontSize: 10, color: '#9CA3AF', whiteSpace: 'nowrap' }}>{label}</div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
                {data.conversations_by_day.length > 14 && (
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8, textAlign: 'center' }}>
                    Cada barra = 1 día. Hover para ver la fecha exacta.
                  </div>
                )}
              </div>
            )}

            {/* Empty state si no hay nada */}
            {data.stats.conversations.value === 0 && data.stats.messages.value === 0 && (
              <div style={{ background: '#F9FAFB', border: '1px dashed #D1D5DB', borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Todavía no hay datos para este período</div>
                <div style={{ fontSize: 13, color: '#6B7280' }}>Cuando tus clientes te escriban, vas a ver las métricas acá.</div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
