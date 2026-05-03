// Référentiel local PLU — lookup par code INSEE commune
//
// Priorité : données enrichies Redis (après passage du cron) → fallback statique plu_data.json
// La clé Redis `plu:communes_v1` est un tableau d'entrées avec `communes[]` contenant
// tous les codes INSEE des communes couverts par chaque PLU/PLUi.

import { createRequire } from 'module';
import { Redis } from '@upstash/redis';

const require = createRequire(import.meta.url);
const PLU_STATIC = require('../../../plu_data.json');

const REDIS_KEY = 'plu:communes_v1';
const MEM_TTL = 60 * 60 * 1000; // 1h en mémoire

let _memIdx = null;
let _memIdxAt = 0;

// Construit un index Map<inseeCode → { url, ville, type }>
function buildIndex(entries) {
  const idx = new Map();
  for (const entry of entries) {
    if (!entry.url_reglement_pdf) continue;
    const meta = { url: entry.url_reglement_pdf, ville: entry.ville, type: entry.type };
    if (entry.insee) idx.set(entry.insee, meta);
    for (const c of (entry.communes || [])) {
      const code = c.insee || c.code;
      if (code) idx.set(code, meta);
    }
  }
  return idx;
}

const STATIC_IDX = buildIndex(PLU_STATIC);

function makeRedis() {
  const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function getIndex() {
  if (_memIdx && Date.now() - _memIdxAt < MEM_TTL) return _memIdx;

  try {
    const redis = makeRedis();
    if (redis) {
      const raw = await redis.get(REDIS_KEY);
      if (raw) {
        const entries = typeof raw === 'string' ? JSON.parse(raw) : raw;
        _memIdx   = buildIndex(entries);
        _memIdxAt = Date.now();
        console.log(`[pluData] Index enrichi Redis : ${_memIdx.size} communes`);
        return _memIdx;
      }
    }
  } catch (e) {
    console.warn('[pluData] Redis indisponible, index statique:', e.message);
  }

  return STATIC_IDX;
}

/**
 * Retourne { url, ville, type } si le code INSEE commune est référencé, sinon null.
 */
export async function getKnownPdfUrl(inseeCode) {
  if (!inseeCode) return null;
  const idx = await getIndex();
  return idx.get(inseeCode) ?? null;
}
