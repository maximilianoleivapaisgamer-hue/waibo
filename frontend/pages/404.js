import { useRouter } from 'next/router';
import Image from 'next/image';

export default function NotFound() {
  const router = useRouter();
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#F5F3FF 0%,#EFF6FF 100%)',
      fontFamily: 'sans-serif', padding: 24, textAlign: 'center',
    }}>
      <div style={{ background: 'white', borderRadius: 20, padding: '48px 40px', maxWidth: 440, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ marginBottom: 20 }}>
          <Image src="/waibo-icon.png" alt="Waibo" width={56} height={56} style={{ borderRadius: 14 }} />
        </div>
        <div style={{ fontSize: 72, fontWeight: 900, color: '#7C3AED', lineHeight: 1 }}>404</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', margin: '12px 0 8px' }}>Página no encontrada</div>
        <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
          La página que buscás no existe o fue movida.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            background: '#7C3AED', color: 'white', border: 'none', borderRadius: 10,
            padding: '12px 28px', fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%',
          }}
        >
          Volver al panel principal
        </button>
        <button
          onClick={() => router.back()}
          style={{
            background: 'none', color: '#7C3AED', border: '1px solid #DDD6FE', borderRadius: 10,
            padding: '10px 28px', fontWeight: 600, fontSize: 13, cursor: 'pointer', width: '100%', marginTop: 10,
          }}
        >
          ← Volver atrás
        </button>
      </div>
    </div>
  );
}
