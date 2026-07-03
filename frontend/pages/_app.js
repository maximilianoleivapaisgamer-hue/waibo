import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/globals.css';

const PUBLIC_PAGES = ['/', '/register', '/solicitar-baja', '/admin'];
const API = process.env.NEXT_PUBLIC_API_URL;

function BillingBanner() {
  const [banner, setBanner] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (PUBLIC_PAGES.includes(router.pathname)) return;
    const token = localStorage.getItem('whabot_token');
    if (!token) return;
    axios.get(`${API}/api/billing/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const b = r.data;
        if (!b) return;
        if (b.status === 'suspended') {
          setBanner({ type: 'error', msg: '⛔ Tu cuenta está suspendida. El bot no está activo. Contactá a soporte para regularizar tu situación.' });
        } else if (b.next_due) {
          const daysLeft = Math.ceil((new Date(b.next_due) - new Date()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 7 && daysLeft >= 0) {
            setBanner({ type: 'warning', msg: `⚠️ Tu suscripción vence el ${new Date(b.next_due).toLocaleDateString('es-AR')}. Renovar antes para no perder el servicio.` });
          }
        }
      })
      .catch(() => {});
  }, [router.pathname]);

  if (!banner) return null;

  const styles = {
    error: { background: '#FEF2F2', borderBottom: '2px solid #FCA5A5', color: '#991B1B' },
    warning: { background: '#FFFBEB', borderBottom: '2px solid #FCD34D', color: '#92400E' },
  };

  return (
    <div style={{
      ...styles[banner.type],
      padding: '12px 24px',
      fontSize: 14,
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      position: 'sticky',
      top: 0,
      zIndex: 200,
    }}>
      <span>{banner.msg}</span>
      <a href="/billing" style={{ marginLeft: 16, padding: '6px 14px', borderRadius: 8, background: banner.type === 'error' ? '#DC2626' : '#D97706', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {banner.type === 'error' ? 'Contactar soporte' : 'Ver mi plan'}
      </a>
    </div>
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
      <BillingBanner />
      <Component {...pageProps} />
    </>
  );
}
