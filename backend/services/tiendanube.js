const axios = require('axios');
const pool = require('../db');
const { decrypt } = require('./crypto');

const TN_API = 'https://api.tiendanube.com/v1';

function getTiendanubeOAuthURL(clientId) {
  const params = new URLSearchParams({
    client_id: process.env.TIENDANUBE_CLIENT_ID,
    state: clientId,
    redirect_uri: `${process.env.APP_URL}/api/tiendanube/callback`
  });
  return `https://www.tiendanube.com/apps/${process.env.TIENDANUBE_CLIENT_ID}/authorize?${params.toString()}`;
}

async function exchangeTiendanubeCode(code) {
  const res = await axios.post('https://www.tiendanube.com/apps/authorize/token', {
    client_id: process.env.TIENDANUBE_CLIENT_ID,
    client_secret: process.env.TIENDANUBE_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code
  });
  return res.data;
}

async function getTNToken(clientId) {
  const result = await pool.query(
    'SELECT * FROM tiendanube_tokens WHERE client_id = $1 AND active = true',
    [clientId]
  );
  if (!result.rows.length) return null;

  const token = result.rows[0];
  return {
    ...token,
    access_token: decrypt(token.access_token)
  };
}

async function syncProducts(clientId) {
  const tnToken = await getTNToken(clientId);
  if (!tnToken) throw new Error('Tiendanube no conectado');

  let page = 1;
  let allProducts = [];

  while (true) {
    const res = await axios.get(`${TN_API}/${tnToken.store_id}/products`, {
      headers: {
        Authentication: `bearer ${tnToken.access_token}`,
        'User-Agent': `WhaBot (${process.env.APP_URL})`
      },
      params: { per_page: 50, page, fields: 'id,name,description,variants,images' }
    });

    const products = res.data;
    if (!products.length) break;
    allProducts = [...allProducts, ...products];
    if (products.length < 50) break;
    page++;
  }

  for (const product of allProducts) {
    const variant = product.variants?.[0] || {};
    const price = parseFloat(variant.price || 0);
    const stock = variant.stock !== null ? parseInt(variant.stock) : 999;
    const name = product.name?.es || product.name?.[''] || Object.values(product.name || {})[0] || 'Producto';
    const desc = product.description?.es || product.description?.[''] || '';
    const imageUrl = product.images?.[0]?.src || '';
    const url = `https://${tnToken.store_url}/products/${product.id}`;

    const variants = product.variants?.map(v => ({
      id: v.id,
      sku: v.sku,
      price: v.price,
      stock: v.stock,
      values: v.values?.map(val => val.es || Object.values(val)[0])
    })) || [];

    await pool.query(
      `INSERT INTO product_cache (client_id, source, external_id, name, description, price, stock, url, image_url, variants, updated_at)
       VALUES ($1, 'tiendanube', $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (client_id, source, external_id) DO UPDATE SET
         name = $3, description = $4, price = $5, stock = $6, url = $7, image_url = $8, variants = $9, updated_at = NOW()`,
      [clientId, String(product.id), name, desc.substring(0, 1000), price, stock, url, imageUrl, JSON.stringify(variants)]
    ).catch(() => {
      pool.query(
        `INSERT INTO product_cache (client_id, source, external_id, name, description, price, stock, url, image_url, variants)
         VALUES ($1, 'tiendanube', $2, $3, $4, $5, $6, $7, $8, $9)`,
        [clientId, String(product.id), name, desc.substring(0, 1000), price, stock, url, imageUrl, JSON.stringify(variants)]
      ).catch(() => {});
    });
  }

  return allProducts.length;
}

async function searchProducts(clientId, query) {
  const result = await pool.query(
    `SELECT name, price, stock, url, variants FROM product_cache
     WHERE client_id = $1 AND source = 'tiendanube'
       AND (LOWER(name) LIKE $2 OR LOWER(description) LIKE $2)
     ORDER BY updated_at DESC LIMIT 5`,
    [clientId, `%${query.toLowerCase()}%`]
  );
  return result.rows;
}

async function getAllProducts(clientId) {
  const result = await pool.query(
    `SELECT name, price, stock, url FROM product_cache
     WHERE client_id = $1 AND source = 'tiendanube'
     ORDER BY updated_at DESC LIMIT 100`,
    [clientId]
  );
  return result.rows;
}

function buildCheckoutURL(storeUrl, productId, variantId) {
  return `https://${storeUrl}/checkout/v3/start?items[]=${variantId}:1`;
}

module.exports = {
  getTiendanubeOAuthURL,
  exchangeTiendanubeCode,
  getTNToken,
  syncProducts,
  searchProducts,
  getAllProducts,
  buildCheckoutURL
};
