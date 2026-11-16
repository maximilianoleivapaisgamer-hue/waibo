import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/globals.css';

const PUBLIC_PAGES = ['/', '/register', '/solicitar-baja', '/admin'];
const ALLOWED_WHILE_SUSPENDED = ['/billing'];
// Los vendedores trabajan solo desde la Bandeja: no ven configuración, IA ni chats ajenos
const EMPLOYEE_ALLOWED = ['/inbox'];
const API = process.env.NEXT_PUBLIC_API_URL;

// Cartel en todo el panel cuando el WhatsApp por QR está desconectado (el bot no contesta).
function WhatsAppBanner() {
  const router = useRouter();
  const [caido, setCaido] = useState(null); // null = conectado o no usa QR

  useEffect(() => {
    if (PUBLIC_PAGES.includes(router.pathname)) return;
    const token = localStorage.getItem('whabot_token');
    if (!token) return;
    let vivo = true;
    const revisar = () => axios.get(`${API}/api/whatsapp-qr/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!vivo) return;
        const d = r.data;
        if (d.mode !== 'qr' || ['connected', 'connecting', 'starting'].includes(d.status)) setCaido(null);
        else setCaido(d.status === 'service_down' || d.status === 'unavailable' ? 'servicio' : 'sesion');
      })
      .catch(() => {});
    revisar();
    const t = setInterval(revisar, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, [router.pathname]);

  if (!caido) return null;
  return (
    <div style={{
      background: '#FEF2F2', borderBottom: '2px solid #F87171', color: '#991B1B',
      padding: '12px 24px', fontSize: 14, fontWeight: 600, display: 'flex',
      alignItems: 'center', justifyContent: 'space-between', gap: 12,
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      position: 'sticky', top: 0, zIndex: 201,
    }}>
      <span>
        🔴 Tu WhatsApp está desconectado: el bot no está contestando.{' '}
        {caido === 'servicio' ? 'El servicio de conexión no responde.' : 'Escaneá el QR de nuevo para volver a conectarlo.'}
      </span>
      {router.pathname !== '/channels' && (
        <a href="/channels" style={{ padding: '6px 14px', borderRadius: 8, background: '#DC2626', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
          Reconectar
        </a>
      )}
    </div>
  );
}

function BillingGuard({ children }) {
  const [status, setStatus] = useState(null); // null=loading, 'ok', 'suspended', 'warning'
  const [warningMsg, setWarningMsg] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (PUBLIC_PAGES.includes(router.pathname)) { setStatus('ok'); return; }
    const token = localStorage.getItem('whabot_token');
    if (!token) { setStatus('ok'); return; }

    // Restricción de empleados
    const clientData = JSON.parse(localStorage.getItem('whabot_client') || '{}');
    if (clientData.role === 'employee' && !EMPLOYEE_ALLOWED.includes(router.pathname)) {
      router.replace('/inbox');
      return;
    }
    axios.get(`${API}/api/billing/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const b = r.data;
        if (!b) { setStatus('ok'); return; }
        if (b.status === 'suspended') {
          setStatus('suspended');
          if (!ALLOWED_WHILE_SUSPENDED.includes(router.pathname)) {
            router.replace('/billing');
          }
        } else if (b.next_due) {
          const daysLeft = Math.ceil((new Date(b.next_due) - new Date()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 7 && daysLeft >= 0) {
            setWarningMsg(`⚠️ Tu suscripción vence el ${new Date(b.next_due).toLocaleDateString('es-AR')}. Renovar antes para no perder el servicio.`);
          }
          setStatus('ok');
        } else {
          setStatus('ok');
        }
      })
      .catch(() => setStatus('ok'));
  }, [router.pathname]);

  const isSuspended = status === 'suspended';
  const isProtectedPage = !PUBLIC_PAGES.includes(router.pathname) && !ALLOWED_WHILE_SUSPENDED.includes(router.pathname);

  return (
    <>
      {isSuspended && isProtectedPage ? null : (
        <>
          <WhatsAppBanner />
          {warningMsg && (
            <div style={{
              background: '#FFFBEB', borderBottom: '2px solid #FCD34D', color: '#92400E',
              padding: '12px 24px', fontSize: 14, fontWeight: 500, display: 'flex',
              alignItems: 'center', justifyContent: 'space-between',
              fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
              position: 'sticky', top: 0, zIndex: 200,
            }}>
              <span>{warningMsg}</span>
              <a href="/billing" style={{ marginLeft: 16, padding: '6px 14px', borderRadius: 8, background: '#D97706', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                Ver mi plan
              </a>
            </div>
          )}
          {children}
        </>
      )}
    </>
  );
}

export default function App({ Component, pageProps }) {
  // Instalable como app en el celular (y base de las notificaciones)
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return (
    <>
      <Head>
        <title>Waibo — Panel de control</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="96x96" href="/favicon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7c3aed" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Waibo" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/waibo-logo.png" />
      </Head>
      <BillingGuard>
        <Component {...pageProps} />
      </BillingGuard>
    </>
  );
}
