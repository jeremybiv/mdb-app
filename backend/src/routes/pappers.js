import { Router } from 'express';
import { NAF_BY_TRADE, searchCompanies, enrichAndScore } from '../services/pappers.js';
import { cacheArtisan, logRecherche } from '../services/kv.js';

const router = Router();

// POST /api/pappers/search
router.post('/search', async (req, res) => {
  try {
    const { trades = [], departement, codePostal, adresse, lat, lon, zonePlu, typeZone } = req.body;

    if (!trades.length) return res.status(400).json({ error: 'trades[] required' });

    const nafCodes = [...new Set(trades.flatMap((t) => NAF_BY_TRADE[t] || []))];
    if (!nafCodes.length) return res.status(400).json({ error: 'Unknown trades', trades });

    const raw     = await searchCompanies({ nafCodes, departement, codePostal });
    const results = await enrichAndScore(raw, 20);

    // Cache in KV async — ne bloque pas la réponse
    Promise.allSettled(
      results.map((a) => cacheArtisan(a, trades.join('+')))
    ).catch(console.error);

    // Log search async
    logRecherche({ adresse, lat, lon, zonePlu, typeZone, trades, nbResultats: results.length })
      .catch(console.error);

    res.json({ count: results.length, results });
  } catch (err) {
    console.error('Pappers search error:', err.message);
    res.status(502).json({ error: 'Pappers API error', detail: err.message });
  }
});

// GET /api/pappers/trades
router.get('/trades', (_req, res) => res.json(NAF_BY_TRADE));

export default router;
