// Cache à deux niveaux pour les données PLU coûteuses à produire
//
// L1 — Map en mémoire   : TTL 1h, survit aux requêtes dans le même worker
// L2 — Upstash Redis    : TTL 30j par défaut, partagé entre toutes les instances
//
// Lecture  : L1 → L2 (peuple L1 au passage) → null
// Écriture : L1 synchrone + L2 fire-and-forget (ne bloque pas la réponse)

import { Redis } from '@upstash/redis';

const TTL_30D_S  = 30 * 24 * 60 * 60;
const MEM_TTL_MS = 60 * 60 * 1000; // 1h

// ── L1 : mémoire ──────────────────────────────────────────────────────────────

const _mem = new Map();

function memGet(key) {
  const e = _mem.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { _mem.delete(key); return null; }
  return e.val;
}

function memSet(key, val, ttlMs = MEM_TTL_MS) {
  _mem.set(key, { val, exp: Date.now() + ttlMs });
}

// ── L2 : Redis ────────────────────────────────────────────────────────────────

let _redis = null;

function getRedis() {
  if (_redis) return _redis;
  const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Lit depuis L1, puis L2. Peuple L1 si trouvé en L2.
 * Retourne null si absent partout.
 */
export async function rcGet(key) {
  const mem = memGet(key);
  if (mem !== null) {
    return mem;
  }

  try {
    const redis = getRedis();
    if (!redis) return null;
    const val = await redis.get(key);
    if (val !== null && val !== undefined) {
      memSet(key, val);
      return val;
    }
  } catch (e) {
    console.warn(`[rcache] GET "${key}": ${e.message}`);
  }
  return null;
}

/**
 * Écrit en L1 (synchrone) et en L2 (fire-and-forget, ne bloque pas).
 * ttlSeconds : durée de vie Redis, défaut 30 jours.
 */
export function rcSet(key, value, ttlSeconds = TTL_30D_S) {
  memSet(key, value, Math.min(ttlSeconds * 1000, MEM_TTL_MS));

  const redis = getRedis();
  if (redis) {
    redis.set(key, value, { ex: ttlSeconds })
      .catch(e => console.warn(`[rcache] SET "${key}": ${e.message}`));
  }
}

/**
 * Supprime de L1 et L2 (invalidation manuelle).
 */
export async function rcDel(key) {
  _mem.delete(key);
  try {
    const redis = getRedis();
    if (redis) await redis.del(key);
  } catch (e) {
    console.warn(`[rcache] DEL "${key}": ${e.message}`);
  }
}

/**
 * Stats du cache L1 (pour debug).
 */
export function rcStats() {
  const now  = Date.now();
  let alive  = 0;
  let plu    = 0;
  for (const [k, v] of _mem) {
    if (v.exp > now) { alive++; if (k.startsWith('plu:')) plu++; }
  }
  return { l1_total: _mem.size, l1_alive: alive, l1_plu: plu };
}
