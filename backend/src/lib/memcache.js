// Simple in-memory cache avec TTL
// Partagé entre les routes DVF et SIRENE

const store = new Map();

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
  return entry.value;
}

export function cacheSet(key, value, ttlMs = 3_600_000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheStats() {
  const now = Date.now();
  let alive = 0;
  for (const [, v] of store) if (v.expiresAt > now) alive++;
  return { total: store.size, alive };
}
