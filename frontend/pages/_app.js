import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/globals.css';

const PUBLIC_PAGES = ['/', '/register', '/solicitar-baja', '/admin'];
const ALLOWED_WHILE_SUSPENDED = ['/billing'];
const EMPLOYEE_ALLOWED = ['/conversations', '/orders', '/agenda'];
const API = process.env.NEXT_PUBLIC_API_URL;

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
      router.replace('/conversations');
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
  return (
    <>
      <Head>
        <title>Waibo — Panel de control</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="96x96" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/waibo-logo.png" />
      </Head>
      <BillingGuard>
        <Component {...pageProps} />
      </BillingGuard>
    </>
  );
}
