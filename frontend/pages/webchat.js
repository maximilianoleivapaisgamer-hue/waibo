import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Webchat() {
  const router = useRouter();
  const [config, setConfig] = useState({ webchat_enabled: false, webchat_title: 'Chat con nosotros', webchat_color: '#7C3AED' });
  const [clientId, setClientId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    const client = localStorage.getItem('whabot_client');
    if (!token) { router.push('/login'); return; }
    if (client) setClientId(JSON.parse(client).id);
    axios.get(`${API}/api/webchat/status`, { headers: headers() })
      .then(r => setConfig(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await axios.put(`${API}/api/webchat/settings`, config, { headers: headers() });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  }

  function copySnippet() {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const snippet = `<script src="${API}/api/webchat/widget.js?clientId=${clientId}"></script>`;

  const steps = [
    {
      n: 1,
      title: 'Activá el widget',
      desc: 'Habilitá el chat web para tu negocio y personalizá el título que verán tus clientes.',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9FAFB', borderRadius: 12, padding: '14px 18px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Chat web activo</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>El widget aparece en el sitio de tus clientes</div>
            </div>
            <button
              onClick={() => setConfig(c => ({ ...c, webchat_enabled: !c.webchat_enabled }))}
              style={{
                width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                background: config.webchat_enabled ? '#7C3AED' : '#D1D5DB',
                position: 'relative', transition: 'background .2s', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: config.webchat_enabled ? 26 : 3,
                width: 22, height: 22, borderRadius: '50%', background: 'white',
                transition: 'left .2s', display: 'block',
              }} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Título del chat</label>
              <input
                value={config.webchat_title || ''}
                onChange={e => setConfig(c => ({ ...c, webchat_title: e.target.value }))}
                placeholder="Chat con nosotros"
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Color del widget</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="color"
                  value={config.webchat_color || '#7C3AED'}
                  onChange={e => setConfig(c => ({ ...c, webchat_color: e.target.value }))}
                  style={{ width: 44, height: 36, border: '1.5px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', padding: 2 }}
                />
                <span style={{ fontSize: 13, color: '#6B7280' }}>{config.webchat_color || '#7C3AED'}</span>
              </div>
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving}
            style={{ alignSelf: 'flex-start', padding: '10px 22px', background: '#7C3AED', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            {saving ? 'Guardando...' : saved ? '✅ Guardado' : 'Guardar cambios'}
          </button>
        </div>
      ),
    },
    {
      n: 2,
      title: 'Copiá el código',
      desc: 'Este es el snippet que tenés que pegar en tu sitio web para activar el chat.',
      content: (
        <div>
          <div style={{ background: '#1E1E2E', borderRadius: 10, padding: '16px 18px', position: 'relative' }}>
            <code style={{ fontSize: 13, color: '#A78BFA', wordBreak: 'break-all', display: 'block', lineHeight: 1.6 }}>
              {snippet}
            </code>
            <button
              onClick={copySnippet}
              style={{
                position: 'absolute', top: 12, right: 12,
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: copied ? '#059669' : '#7C3AED', color: 'white', fontSize: 12, fontWeight: 500,
              }}
            >
              {copied ? '✅ Copiado' : 'Copiar'}
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: '#6B7280' }}>
            ⚠️ Asegurate de activar el widget en el paso 1 antes de pegar el código, si no el chat no va a aparecer.
          </div>
        </div>
      ),
    },
    {
      n: 3,
      title: 'Pegalo en tu sitio web',
      desc: 'Copiá el código del paso anterior y pegalo antes del cierre </body> en el HTML de tu sitio. Si usás WordPress, Wix, Tiendanube u otra plataforma, mirá las instrucciones específicas abajo.',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            {
              platform: 'WordPress',
              icon: '🔵',
              steps: ['Instalá el plugin "Insert Headers and Footers"', 'Andá a Settings → Insert Headers and Footers', 'Pegá el código en la sección "Scripts in Footer"', 'Guardá los cambios'],
            },
            {
              platform: 'Wix',
              icon: '⚫',
              steps: ['Andá al Editor de Wix → Configuración → Código personalizado', 'Hacé click en "+ Agregar código"', 'Pegá el código y seleccioná "Antes del cierre </body>"', 'Guardá y publicá'],
            },
            {
              platform: 'Tiendanube',
              icon: '🔷',
              steps: ['En tu admin de Tiendanube andá a Contenidos → Temas', 'Hacé click en "Editar HTML/CSS"', 'En el archivo base.html, pegá el código antes de </body>', 'Guardá los cambios'],
            },
            {
              platform: 'HTML puro',
              icon: '🟠',
              steps: ['Abrí el archivo HTML de tu sitio', 'Antes del tag </body>, pegá el código', 'Guardá y subí el archivo al servidor'],
            },
          ].map(p => (
            <details key={p.platform} style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
              <summary style={{ padding: '12px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: '#F9FAFB', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{p.icon}</span> {p.platform}
              </summary>
              <div style={{ padding: '12px 16px' }}>
                <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {p.steps.map((s, i) => (
                    <li key={i} style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{s}</li>
                  ))}
                </ol>
              </div>
            </details>
          ))}
        </div>
      ),
    },
    {
      n: 4,
      title: '¡Listo! Verificá que funciona',
      desc: 'Abrí tu sitio web y deberías ver el ícono de chat en la esquina inferior derecha. Escribí un mensaje de prueba para verificar que el bot responde correctamente.',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#065F46', marginBottom: 6 }}>✅ ¿Qué vas a ver en tu sitio?</div>
            <ul style={{ margin: 0, paddingLeft: 20, color: '#374151', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Un botón flotante en la esquina inferior derecha con el color que elegiste</li>
              <li>Al hacer click, se abre un panel de chat</li>
              <li>El bot responde usando la misma IA y base de conocimiento que configuraste</li>
              <li>Las conversaciones se guardan en tu panel de "Conversaciones"</li>
            </ul>
          </div>
          <div style={{ background: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#5B21B6', marginBottom: 4 }}>💡 Tip</div>
            <div style={{ fontSize: 13, color: '#374151' }}>
              Antes de activarlo en producción, probá el bot en la sección "Modo prueba" del panel para asegurarte de que responde bien.
            </div>
          </div>
        </div>
      ),
    },
  ];

  if (loading) return (
    <div className="dashboard">
      <Sidebar active="webchat" />
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}>Cargando...</div>
    </div>
  );

  return (
    <div className="dashboard">
      <Sidebar active="webchat" />
      <div className="main-content" style={{ maxWidth: 860 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🌐</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Chat web</h1>
              <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>Agregá el bot a tu sitio web con un snippet de código</p>
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: config.webchat_enabled ? '#D1FAE5' : '#F3F4F6', color: config.webchat_enabled ? '#065F46' : '#6B7280' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: config.webchat_enabled ? '#10B981' : '#9CA3AF', display: 'inline-block' }} />
            {config.webchat_enabled ? 'Widget activo' : 'Widget desactivado'}
          </div>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {steps.map(step => (
            <div key={step.n} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#7C3AED', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                  {step.n}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{step.title}</div>
                  <div style={{ fontSize: 13, color: '#6B7280', marginTop: 3, lineHeight: 1.5 }}>{step.desc}</div>
                </div>
              </div>
              <div style={{ padding: '18px 24px' }}>
                {step.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
