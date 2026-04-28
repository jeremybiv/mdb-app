import { searchAndScore, NAF_BY_TRADE } from '../../lib/sirene.js';
import { cacheArtisan, logRecherche } from '../../lib/kv.mjs';
import { handleCors } from '../../lib/claude.mjs';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const {
      trades = [], departement, region, codePostal,
      adresse, lat, lon, zonePlu, typeZone,
    } = req.body;

    if (!trades.length) return res.status(400).json({ error: 'trades[] required' });

    const results = await searchAndScore({ trades, departement, region, codePostal });

    // Cache async
    Promise.allSettled(
      results.map((a) => cacheArtisan(a, trades.join('+')))
    ).catch(console.error);

    logRecherche({
      adresse, lat, lon, zonePlu, typeZone, trades,
      nbResultats: results.length,
    }).catch(console.error);

    res.json({ count: results.length, results, source: 'sirene+rge' });
  } catch (err) {
    console.error('sirene/search error:', err.message);
    res.status(502).json({ error: err.message });
  }
}
