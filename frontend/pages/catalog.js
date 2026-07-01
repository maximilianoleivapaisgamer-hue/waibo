import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Catalog() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/'); return; }

    axios.get(`${API}/api/tiendanube/products`, { headers: getHeaders() })
      .then(res => setProducts(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatPrice = (price) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(price);

  return (
    <div className="dashboard">
      <Sidebar active="catalog" />
      <div className="main-content">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/channels')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>←</button>
            <div>
              <h1>🏪 Catálogo de productos</h1>
              <p>Productos sincronizados desde Tiendanube que el bot ya conoce</p>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <input
            placeholder="🔍 Buscar producto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 14px', width: '100%', fontSize: 14, outline: 'none' }}
          />
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'var(--text-muted)' }}>Cargando productos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              {search ? 'No se encontraron productos con esa búsqueda.' : 'No hay productos sincronizados todavía. Conectá Tiendanube y sincronizá.'}
            </p>
            {!search && (
              <button className="btn btn-primary" onClick={() => router.push('/channels')} style={{ width: 'auto', marginTop: 16, padding: '10px 24px' }}>
                Ir a Canales
              </button>
            )}
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              {filtered.length} producto{filtered.length !== 1 ? 's' : ''} — el bot puede responder sobre todos estos
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {filtered.map((product, i) => {
                const variants = typeof product.variants === 'string'
                  ? JSON.parse(product.variants || '[]')
                  : (product.variants || []);
                const stockColor = product.stock === 0 ? '#DC2626' : product.stock < 5 ? '#D97706' : '#15803D';
                const stockLabel = product.stock === 0 ? 'Sin stock' : product.stock < 5 ? `¡Solo ${product.stock}!` : `${product.stock} en stock`;

                return (
                  <div key={i} style={{
                    background: 'white', borderRadius: 12,
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow)',
                    overflow: 'hidden'
                  }}>
                    <div style={{ padding: '16px 16px 0' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, lineHeight: 1.4 }}>
                        {product.name}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-dark)', marginBottom: 8 }}>
                        {formatPrice(product.price)}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#F3F4F6', color: stockColor, fontWeight: 500 }}>
                          📦 {stockLabel}
                        </span>
                        {variants.length > 1 && (
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#EDE9FE', color: '#6D28D9' }}>
                            {variants.length} variantes
                          </span>
                        )}
                      </div>
                      {variants.length > 1 && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                          {variants.slice(0, 4).map((v, vi) => (
                            <span key={vi} style={{ marginRight: 8 }}>
                              {v.values?.join('/')} ${v.price}
                            </span>
                          ))}
                          {variants.length > 4 && <span>+{variants.length - 4} más</span>}
                        </div>
                      )}
                    </div>
                    {product.url && (
                      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: '#F8FAFC' }}>
                        <a href={product.url} target="_blank" rel="noreferrer"
                          style={{ fontSize: 12, color: 'var(--green-dark)', textDecoration: 'none' }}>
                          Ver en tienda ↗
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
