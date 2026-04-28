import { searchRGE, RGE_DOMAINES } from '../../lib/sirene.js';
import { handleCors } from '../../lib/claude.mjs';

// GET /api/sirene/rge?departement=01&domaine=Chauffage+et%2Fou+ECS
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const { departement, codePostal, domaine } = req.query;

    if (!departement && !codePostal) {
      return res.status(400).json({ error: 'departement or codePostal required', domaines: RGE_DOMAINES });
    }

    const results = await searchRGE({ departement, codePostal, domaine });
    res.json({ count: results.length, results, domaines: RGE_DOMAINES, source: 'rge-ademe' });
  } catch (err) {
    console.error('sirene/rge error:', err.message);
    res.status(502).json({ error: err.message });
  }
}
