// ── Upstash Redis — cache artisans + historique recherches ──
// Remplace @vercel/kv (déprécié nov. 2024)
// API identique : get/set/lpush/ltrim/lrange/scan
//
// Setup Upstash :
//   1. https://console.upstash.com → Create Database → Redis → France (eu-west-1)
//   2. Copier UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//   3. Les ajouter dans Vercel : vercel env add UPSTASH_REDIS_REST_URL
//                                vercel env add UPSTASH_REDIS_REST_TOKEN
//   4. En local : les ajouter dans .env.local
//
// TTLs :
//   artisan:{siren}  → 7 jours  (données RCS stables)
//   recherches       → liste LIFO capped à 100
//   stats:{d}:{naf}  → 24h

import { Redis } from "@upstash/redis";

let _redis = null;

function getRedis() {
  if (_redis) return _redis;
  // Vercel injecte KV_REST_API_URL/TOKEN quand la DB est créée depuis le dashboard Vercel
  // Fallback sur UPSTASH_* si créé directement depuis upstash.com
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "KV_REST_API_URL et KV_REST_API_TOKEN manquants.\n" +
        "Faire : vercel env pull .env.local",
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

const TTL_ARTISAN = 60 * 60 * 24 * 7; // 7 jours
const TTL_STATS = 60 * 60 * 24; // 24h
const MAX_RECHERCHES = 100;

// ── Artisans ──────────────────────────────────────────────

export async function cacheArtisan(artisan, trade) {
  const redis = getRedis();
  const value = { ...artisan, trade, cachedAt: new Date().toISOString() };
  await redis.set(`artisan:${artisan.siren}`, value, { ex: TTL_ARTISAN });
  return value;
}

export async function getCachedArtisan(siren) {
  return getRedis().get(`artisan:${siren}`);
}

export async function getCachedArtisans({
  trade,
  ville,
  priorite,
  limit = 50,
} = {}) {
  const redis = getRedis();
  // Scan artisan:* — Upstash supporte SCAN nativement
  let cursor = 0;
  const keys = [];
  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match: "artisan:*",
      count: 100,
    });
    keys.push(...batch);
    cursor = Number(nextCursor);
  } while (cursor !== 0 && keys.length < 500);

  if (!keys.length) return [];

  const records = await Promise.all(keys.map((k) => redis.get(k)));
  let results = records.filter(Boolean);

  if (trade) results = results.filter((r) => r.trade?.includes(trade));
  if (ville)
    results = results.filter((r) =>
      r.ville?.toLowerCase().includes(ville.toLowerCase()),
    );
  if (priorite) results = results.filter((r) => r.priorite === priorite);

  return results
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);
}

// ── Recherches ────────────────────────────────────────────

export async function logRecherche({
  adresse,
  lat,
  lon,
  zonePlu,
  typeZone,
  trades,
  nbResultats,
}) {
  const redis = getRedis();
  const entry = {
    adresse,
    lat,
    lon,
    zonePlu: zonePlu || "",
    typeZone: typeZone || "",
    trades: Array.isArray(trades) ? trades.join(", ") : trades || "",
    nbResultats: nbResultats || 0,
    createdAt: new Date().toISOString(),
  };
  await redis.lpush("recherches", JSON.stringify(entry));
  await redis.ltrim("recherches", 0, MAX_RECHERCHES - 1);
  return entry;
}

export async function getRecentRecherches(limit = 20) {
  const redis = getRedis();
  const raw = await redis.lrange("recherches", 0, limit - 1);
  return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

// ── Stats cache ───────────────────────────────────────────

export async function cacheStats(dept, nafCode, data) {
  return getRedis().set(`stats:${dept}:${nafCode}`, data, { ex: TTL_STATS });
}

export async function getCachedStats(dept, nafCode) {
  return getRedis().get(`stats:${dept}:${nafCode}`);
}

// ── Health check ──────────────────────────────────────────

export async function kvPing() {
  await getRedis().set("__ping", "1", { ex: 10 });
  return true;
}
