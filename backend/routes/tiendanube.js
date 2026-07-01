const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const {
  getTiendanubeOAuthURL, exchangeTiendanubeCode,
  syncProducts, searchProducts, getAllProducts, getTNToken
} = require('../services/tiendanube');
const { encrypt } = require('../services/crypto');

router.get('/connect', authMiddleware, (req, res) => {
  const url = getTiendanubeOAuthURL(req.client.id);
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code, state: clientId } = req.query;
  if (!code || !clientId) {
    return res.redirect(`${process.env.FRONTEND_URL}/channels?tn_error=missing`);
  }

  try {
    const tokenData = await exchangeTiendanubeCode(code);
    const { access_token, user_id } = tokenData;

    const axios = require('axios');
    const storeRes = await axios.get(`https://api.tiendanube.com/v1/${user_id}/store`, {
      headers: {
        Authentication: `bearer ${access_token}`,
        'User-Agent': `WhaBot (${process.env.APP_URL})`
      }
    });

    const store = storeRes.data;
    const storeName = store.name?.es || store.name?.[''] || Object.values(store.name || {})[0] || 'Mi tienda';
    const storeUrl = store.main_domain || store.domains?.[0] || '';

    await pool.query(
      `INSERT INTO tiendanube_tokens (client_id, store_id, store_name, store_url, access_token)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_id) DO UPDATE SET
         store_id = $2, store_name = $3, store_url = $4, access_token = $5, active = true`,
      [clientId, String(user_id), storeName, storeUrl, encrypt(access_token)]
    );

    syncProducts(clientId).catch(err => console.error('Error sync inicial TN:', err.message));

    res.redirect(`${process.env.FRONTEND_URL}/channels?tn_connected=true&store=${encodeURIComponent(storeName)}`);
  } catch (err) {
    console.error('Error TN callback:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/channels?tn_error=auth_failed`);
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT store_id, store_name, store_url, active, created_at FROM tiendanube_tokens WHERE client_id = $1',
    [req.client.id]
  );
  if (!result.rows.length) return res.json({ connected: false });

  const productCount = await pool.query(
    "SELECT COUNT(*) FROM product_cache WHERE client_id = $1 AND source = 'tiendanube'",
    [req.client.id]
  );

  res.json({
    connected: true,
    ...result.rows[0],
    product_count: parseInt(productCount.rows[0].count)
  });
});

router.delete('/disconnect', authMiddleware, async (req, res) => {
  await pool.query('UPDATE tiendanube_tokens SET active = false WHERE client_id = $1', [req.client.id]);
  res.json({ success: true });
});

router.post('/sync', authMiddleware, async (req, res) => {
  try {
    const count = await syncProducts(req.client.id);
    res.json({ success: true, synced: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/products', authMiddleware, async (req, res) => {
  const products = await getAllProducts(req.client.id);
  res.json(products);
});

router.post('/webhook/:clientId', async (req, res) => {
  res.sendStatus(200);

  const clientId = req.params.clientId;
  const { event, payload } = req.body;

  try {
    if (event === 'product/updated' || event === 'product/created') {
      const product = payload;
      const variant = product.variants?.[0] || {};
      const name = product.name?.es || Object.values(product.name || {})[0] || 'Producto';

      await pool.query(
        `UPDATE product_cache SET
           name = $1, price = $2, stock = $3, updated_at = NOW()
         WHERE client_id = $4 AND source = 'tiendanube' AND external_id = $5`,
        [name, parseFloat(variant.price || 0), variant.stock, clientId, String(product.id)]
      );
      console.log(`✅ TN: Producto ${product.id} actualizado en cache`);
    }

    if (event === 'product/deleted') {
      await pool.query(
        "DELETE FROM product_cache WHERE client_id = $1 AND source = 'tiendanube' AND external_id = $2",
        [clientId, String(payload.id)]
      );
    }
  } catch (err) {
    console.error('❌ Error webhook Tiendanube:', err.message);
  }
});

module.exports = router;
