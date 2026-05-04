import { rcGet, rcSet, rcKeys } from './redisCache.js';

const TTL_1Y = 365 * 24 * 60 * 60;

function getMax() {
  return parseInt(process.env.MAX_SEARCHES_PER_USER || '4', 10);
}

function normalize(addr) {
  return (addr || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function userKey(email) {
  return `usage:searches:${email}`;
}

export async function getUserSearches(email) {
  return (await rcGet(userKey(email))) || [];
}

export async function getAllUserSearches() {
  const max  = getMax();
  const keys = await rcKeys('usage:searches:*');
  const rows = await Promise.all(
    keys.map(async key => {
      const email   = key.replace('usage:searches:', '');
      const searches = (await rcGet(key)) || [];
      return { email, searches, remaining: Math.max(0, max - searches.length), total: max };
    })
  );
  return rows.sort((a, b) => b.searches.length - a.searches.length);
}

/**
 * Enregistre une recherche d'adresse.
 * Même adresse (dédup normalisé) → gratuit, ne consomme pas de slot.
 * Retourne { allowed, remaining, searches, total }.
 */
export async function registerSearch(email, { adresse, citycode, zone }) {
  const max = getMax();
  const searches = (await rcGet(userKey(email))) || [];
  const normAddr = normalize(adresse);

  const isDuplicate = searches.some(s => normalize(s.adresse) === normAddr);
  if (isDuplicate) {
    return { allowed: true, remaining: Math.max(0, max - searches.length), searches, total: max };
  }

  if (searches.length >= max) {
    return { allowed: false, remaining: 0, searches, total: max };
  }

  searches.push({ adresse, citycode: citycode || null, zone: zone || null, ts: new Date().toISOString() });
  rcSet(userKey(email), searches, TTL_1Y);

  return { allowed: true, remaining: Math.max(0, max - searches.length), searches, total: max };
}
