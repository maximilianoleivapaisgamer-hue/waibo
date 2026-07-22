import { useEffect } from 'react';
import { useRouter } from 'next/router';

// La Base de conocimiento ahora vive dentro de Configurar bot
export default function Knowledge() {
  const router = useRouter();
  useEffect(() => { router.replace('/config?tab=knowledge'); }, []);
  return null;
}
