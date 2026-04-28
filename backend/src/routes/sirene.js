import { Router } from 'express';
import axios from 'axios';
import { NAF_BY_TRADE } from '../services/pappers.js';
import { cacheGet, cacheSet } from '../lib/memcache.js';

const router = Router();
const SEARCH_API = 'https://recherche-entreprises.api.gouv.fr/search';
const GEO_API    = 'https://geo.api.gouv.fr/communes';

// NAF format SIRENE : "4322A" → "43.22A"
function formatNaf(code) {
  return code.length === 5 ? `${code.slice(0, 2)}.${code.slice(2)}` : code;
}

async function fetchGeo(url) {
  try {
    const { data } = await axios.get(url, { timeout: 5000 });
    return data;
  } catch { return null; }
}

// Retourne les codes postaux d'une commune via l'API geo
async function postalCodesForCommune(citycode) {
  const data = await fetchGeo(`${GEO_API}/${citycode}?fields=codesPostaux,nom`);
  return data?.codesPostaux || [];
}

// Retourne les communes limitrophes avec leurs codes postaux
async function neighborCommunes(citycode) {
  const data = await fetchGeo(`${GEO_API}/${citycode}/communes-limitrophes?fields=codesPostaux,nom`);
  return Array.isArray(data) ? data : [];
}

// Lance une recherche SIRENE pour un NAF + un code postal donné
async function searchOne(naf, params, debugLog, debug) {
  debugLog.push({ naf, params: { ...params, activite_principale: naf }, url: SEARCH_API });
  try {
    const { data } = await axios.get(SEARCH_API, {
      params: { activite_principale: naf, per_page: 25, page: 1, ...params },
      timeout: 8000,
    });
    const count = data.results?.length ?? 0;
    if (debug) debugLog[debugLog.length - 1].response = { total_results: data.total_results, returned: count };
    return data.results || [];
  } catch (err) {
    if (debug) debugLog[debugLog.length - 1].error = err.message;
    return [];
  }
}

// Recherche sur une liste de codes postaux (en parallèle)
async function searchByPostalCodes(nafCodes, postalCodes, debugLog, debug) {
  const cps = [...new Set(postalCodes)].slice(0, 6); // max 6 codes postaux
  const requests = nafCodes.flatMap((naf) =>
    cps.map((cp) => searchOne(naf, { code_postal: cp }, debugLog, debug))
  );
  return (await Promise.all(requests)).flat();
}

// Recherche sur le département entier
async function searchByDept(nafCodes, departement, debugLog, debug) {
  const requests = nafCodes.map((naf) =>
    searchOne(naf, { departement }, debugLog, debug)
  );
  return (await Promise.all(requests)).flat();
}

function dedupe(results) {
  const seen = new Set();
  return results.filter((e) => {
    if (seen.has(e.siren)) return false;
    seen.add(e.siren);
    return true;
  });
}

// POST /api/sirene/search
router.post('/search', async (req, res) => {
  const { trades = [], departement, citycode, debug } = req.body;
  if (!trades.length) return res.status(400).json({ error: 'trades[] required' });

  const rawNaf   = [...new Set(trades.flatMap((t) => NAF_BY_TRADE[t] || []))];
  if (!rawNaf.length) return res.status(400).json({ error: 'Unknown trades', trades });

  const nafCodes = rawNaf.map(formatNaf).slice(0, 6);

  // Cache mémoire — clé = trades + localisation (6h TTL, ignoré si debug)
  const cacheKey = `sirene_${[...trades].sort().join(',')}_${citycode || departement}`;
  if (!debug) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      console.log(`[SIRENE] cache hit: ${cacheKey}`);
      return res.json({ ...cached, fromCache: true });
    }
  }

  const debugLog = [];
  let scope      = null;
  let raw        = [];

  // ── 1. Commune ────────────────────────────────────────────
  if (citycode) {
    const cps = await postalCodesForCommune(citycode);
    if (cps.length) {
      console.log(`[SIRENE] Recherche commune ${citycode} — CP: ${cps.join(', ')}`);
      scope = `commune ${citycode}`;
      raw = await searchByPostalCodes(nafCodes, cps, debugLog, debug);
    }
  }

  // ── 2. Communes voisines ──────────────────────────────────
  if (raw.length < 3 && citycode) {
    const neighbors = await neighborCommunes(citycode);
    const neighborCps = neighbors.flatMap((c) => c.codesPostaux || []);
    if (neighborCps.length) {
      const neighborNames = neighbors.map((c) => c.nom).join(', ');
      console.log(`[SIRENE] Élargissement aux communes voisines: ${neighborNames}`);
      scope = `communes voisines (${neighbors.length})`;
      const extra = await searchByPostalCodes(nafCodes, neighborCps, debugLog, debug);
      raw = [...raw, ...extra];
    }
  }

  // ── 3. Département ───────────────────────────────────────
  if (raw.length < 3 && departement) {
    console.log(`[SIRENE] Élargissement au département ${departement}`);
    scope = `département ${departement}`;
    const extra = await searchByDept(nafCodes, departement, debugLog, debug);
    raw = [...raw, ...extra];
  }

  // Filtre strict : seules les entreprises dont le NAF siège correspond aux codes recherchés
  const allowedNafs = new Set(nafCodes);
  const matched = raw.filter((e) => {
    const naf = e.siege?.activite_principale || '';
    return allowedNafs.has(naf);
  });
  // Si le filtre strict élimine tout (ex: API incohérente), on garde raw
  const toProcess = matched.length > 0 ? matched : raw;

  const results = dedupe(toProcess)
    .map((e) => normalizeEtablissement(e, trades))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 40);

  console.log(`[SIRENE] ${results.length} résultats (scope: ${scope})`);
  const payload = { count: results.length, results, source: 'sirene', scope, ...(debug ? { debug: debugLog } : {}) };
  if (!debug) cacheSet(cacheKey, payload, 6 * 3_600_000); // 6h TTL
  res.json(payload);
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
