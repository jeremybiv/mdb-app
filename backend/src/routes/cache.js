// Remplace routes/airtable.js
// Route prefix : /api/cache (au lieu de /api/airtable)

import { Router } from 'express';
import { getCachedArtisans, getRecentRecherches, kvPing } from '../services/kv.js';

const router = Router();

// GET /api/cache/artisans?trade=plomberie&ville=Gex&priorite=P1
router.get('/artisans', async (req, res) => {
  try {
    const { trade, ville, priorite, limit } = req.query;
    const results = await getCachedArtisans({ trade, ville, priorite, limit: Number(limit) || 50 });
    res.json({ count: results.length, results, source: 'kv-cache' });
  } catch (err) {
    console.error('KV getArtisans error:', err.message);
    res.status(502).json({ error: 'Cache error', detail: err.message });
  }
});

// GET /api/cache/recherches?limit=20
router.get('/recherches', async (req, res) => {
  try {
    const results = await getRecentRecherches(Number(req.query.limit) || 20);
    res.json({ count: results.length, results, source: 'kv-cache' });
  } catch (err) {
    console.error('KV getRecherches error:', err.message);
    res.status(502).json({ error: 'Cache error', detail: err.message });
  }
});

// GET /api/cache/ping — health check KV
router.get('/ping', async (_req, res) => {
  try {
    await kvPing();
    res.json({ ok: true, store: 'vercel-kv' });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

export default router;
