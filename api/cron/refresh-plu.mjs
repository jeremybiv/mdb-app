// Vercel Cron Job — enrichissement du référentiel PLU avec les communes EPCI
//
// Pour chaque entrée de plu_data.json :
//   1. Trouve l'EPCI de la commune via geo.api.gouv.fr
//   2. Récupère toutes les communes de cet EPCI
//   3. Stocke le résultat enrichi dans Redis (TTL 30j)
//
// Déclenchement :
//   - Automatique via vercel.json (schedule)
//   - Manuel via GET /api/cron/refresh-plu  (Authorization: Bearer CRON_SECRET)

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const PLU_DATA  = require('../../plu_data.json');

const REDIS_KEY    = 'plu:communes_v1';
const REDIS_TTL_S  = 30 * 24 * 60 * 60; // 30 jours

// ── Upstash REST (pas de dépendance SDK dans cette function) ──────────────────

function getRedisConfig() {
  const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN manquants');
  return { url, token };
}

async function redisSetex(key, ttlSeconds, value) {
  const { url, token } = getRedisConfig();
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['SETEX', key, String(ttlSeconds), JSON.stringify(value)]]),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Redis SETEX HTTP ${r.status}: ${txt}`);
  }
  return r.json();
}

// ── Helpers HTTP ──────────────────────────────────────────────────────────────

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
    return r.json();
  } finally {
    clearTimeout(t);
  }
}

// ── Enrichissement d'une entrée ───────────────────────────────────────────────

async function enrichEntry(entry) {
  const result = { ...entry };

  try {
    // 1. Trouve l'EPCI de la commune principale
    const communeInfo = await fetchJson(
      `https://geo.api.gouv.fr/communes/${entry.insee}?fields=epci,nom,code`
    );

    const epciCode = communeInfo?.epci?.code;
    const epciNom  = communeInfo?.epci?.nom;

    if (!epciCode) {
      console.log(`[refresh-plu] ${entry.ville} (${entry.insee}) : commune sans EPCI`);
      return result;
    }

    // 2. Récupère toutes les communes de l'EPCI
    const communes = await fetchJson(
      `https://geo.api.gouv.fr/epcis/${epciCode}/communes?fields=nom,code`
    );

    if (Array.isArray(communes) && communes.length > 0) {
      result.communes  = communes.map(c => ({ nom: c.nom, insee: c.code }));
      result.epci_code = epciCode;
      result.epci_nom  = epciNom;
      console.log(`[refresh-plu] ${entry.ville} : ${communes.length} communes (EPCI ${epciCode} — ${epciNom})`);
    }
  } catch (e) {
    console.warn(`[refresh-plu] ${entry.ville} (${entry.insee}) : erreur enrichissement — ${e.message}`);
  }

  return result;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://vercel.com');

  // Sécurité : seul Vercel (via CRON_SECRET) ou un appel manuel autorisé
  const authHeader = (req.headers['authorization'] || '').replace(/^Bearer\s+/, '');
  if (!process.env.CRON_SECRET || authHeader !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const t0 = Date.now();
  console.log(`[refresh-plu] Démarrage — ${PLU_DATA.length} entrées à enrichir`);

  try {
    const enriched = [];

    // Séquentiel pour ne pas saturer geo.api.gouv.fr
    for (const entry of PLU_DATA) {
      enriched.push(await enrichEntry(entry));
    }

    // Stocke en Redis (TTL 30j)
    await redisSetex(REDIS_KEY, REDIS_TTL_S, enriched);

    const totalCommunes = enriched.reduce((s, e) => s + (e.communes || []).length, 0);
    const durationMs    = Date.now() - t0;

    console.log(`[refresh-plu] ✓ ${enriched.length} entrées, ${totalCommunes} communes — ${durationMs}ms`);

    const summary = enriched.map(e => ({
      ville:        e.ville,
      epci:         e.epci_nom || '(commune seule)',
      nb_communes:  (e.communes || []).length,
    }));

    return res.json({
      success:         true,
      refreshed_at:    new Date().toISOString(),
      duration_ms:     durationMs,
      entries:         enriched.length,
      total_communes:  totalCommunes,
      summary,
    });
  } catch (err) {
    console.error('[refresh-plu] Erreur:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
