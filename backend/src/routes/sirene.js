import { Router } from 'express';
import axios from 'axios';
import { NAF_BY_TRADE } from '../services/pappers.js';

const router = Router();
const SEARCH_API = 'https://recherche-entreprises.api.gouv.fr/search';

// NAF format SIRENE : "4322A" → "43.22A"
function formatNaf(code) {
  return code.length === 5 ? `${code.slice(0, 2)}.${code.slice(2)}` : code;
}

// POST /api/sirene/search
router.post('/search', async (req, res) => {
  const { trades = [], departement, codePostal, debug } = req.body;
  if (!trades.length) return res.status(400).json({ error: 'trades[] required' });

  const rawNaf = [...new Set(trades.flatMap((t) => NAF_BY_TRADE[t] || []))];
  if (!rawNaf.length) return res.status(400).json({ error: 'Unknown trades', trades });

  const nafCodes = rawNaf.map(formatNaf);
  const debugLog = [];

  const requests = nafCodes.slice(0, 6).map(async (naf) => {
    const params = {
      activite_principale: naf,
      per_page: 25,
      page: 1,
      ...(codePostal ? { code_postal: codePostal } : { departement }),
    };

    debugLog.push({ naf, params, url: SEARCH_API });
    console.log(`[SIRENE] GET ${SEARCH_API}`, params);

    try {
      const { data } = await axios.get(SEARCH_API, { params, timeout: 8000 });
      const count = data.results?.length ?? 0;
      const total = data.total_results ?? '?';
      console.log(`[SIRENE] naf=${naf} → ${count} résultats (total API: ${total})`);
      if (debug) debugLog[debugLog.length - 1].response = { total_results: total, returned: count, sample: data.results?.[0] };
      return data.results || [];
    } catch (err) {
      console.error(`[SIRENE] naf=${naf} erreur:`, err.response?.status, err.message);
      if (debug) debugLog[debugLog.length - 1].error = err.message;
      return [];
    }
  });

  const batches = await Promise.all(requests);
  const seen = new Set();
  const results = batches
    .flat()
    .filter((e) => { if (seen.has(e.siren)) return false; seen.add(e.siren); return true; })
    .map((e) => normalizeEtablissement(e, trades))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 40);

  console.log(`[SIRENE] total après fusion : ${results.length} résultats`);
  res.json({ count: results.length, results, source: 'sirene', ...(debug ? { debug: debugLog } : {}) });
});

function normalizeEtablissement(e, trades) {
  const siege = e.siege || {};
  const adresse = [siege.numero_voie, siege.type_voie, siege.libelle_voie].filter(Boolean).join(' ');
  let score = 10;
  if (e.nombre_etablissements_ouverts > 1) score += 5;
  if (siege.tranche_effectif_salarie)      score += 10;
  if (e.annee_creation && Number(e.annee_creation) < 2020) score += 10;
  return {
    siren:       e.siren,
    nom:         e.nom_complet || e.nom_raison_sociale || '—',
    adresse,
    ville:       siege.libelle_commune || '',
    codePostal:  siege.code_postal || '',
    departement: siege.departement || '',
    naf:         siege.activite_principale || '',
    telephone:   null,
    email:       null,
    score,
    priorite:    score >= 25 ? 'P1' : score >= 15 ? 'P2' : 'P3',
    source:      'sirene',
    trades,
  };
}

export default router;
