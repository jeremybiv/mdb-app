// DVF — Demandes de Valeurs Foncières
// Proxifié via le backend (cascade Etalab → CEREMA → ODS)
import { authHeaders } from './api.js';

/**
 * Fetch recent transactions near a point — France entière
 * Returns { transactions, source }
 */
export async function fetchTransactions(lon, lat, radiusM = 1500, months = 24, citycode = null) {
  const params = new URLSearchParams({ lon, lat, radius: radiusM, months, debug: 1 });
  if (citycode) params.set('citycode', citycode);
  const r = await fetch(`/api/dvf?${params}`, { headers: authHeaders() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = Object.assign(new Error(d.detail || `DVF HTTP ${r.status}`), { debugLog: d.debugLog });
    throw err;
  }
  return { transactions: d.transactions || [], source: d.source || 'DVF', debugLog: d.debugLog || [] };
}

export function normalizeType(raw) {
  const t = String(raw || '').toLowerCase();
  if (t.includes('maison') || ['1','13','131','132','133'].includes(t)) return 'maison';
  if (t.includes('appart') || ['2','12','121','122'].includes(t))        return 'appartement';
  if (t.includes('terrain') || t.includes('dépend') || t.includes('depend')) return 'terrain';
  return 'autre';
}

// ── Stats computation — pure JS ───────────────────────────

function medianOf(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function pricePerM2(items, surfaceKey) {
  return items
    .map((t) => t.valeur / t[surfaceKey])
    .filter((p) => p > 200 && p < 25000);
}

function statsFrom(prices) {
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  return {
    median: Math.round(medianOf(prices)),
    avg:    Math.round(prices.reduce((s, v) => s + v, 0) / prices.length),
    min:    Math.round(sorted[0]),
    max:    Math.round(sorted[sorted.length - 1]),
    p25:    Math.round(sorted[Math.floor(sorted.length * 0.25)]),
    p75:    Math.round(sorted[Math.floor(sorted.length * 0.75)]),
    count:  prices.length,
  };
}

export function computeStats(transactions) {
  if (!transactions.length) return null;

  const bati    = transactions.filter((t) => t.surfaceBati > 10);
  const terrain = transactions.filter((t) => t.surfaceTerrain > 50 && t.surfaceBati < 10);

  const now  = new Date();
  const cut1 = new Date(now); cut1.setMonth(cut1.getMonth() - 12);
  const cut2 = new Date(now); cut2.setMonth(cut2.getMonth() - 24);

  const inRange = (items, key, from, to) =>
    pricePerM2(items.filter((t) => {
      const d = new Date(t.date);
      return d >= from && d < to;
    }), key);

  const recentBati   = inRange(bati, 'surfaceBati', cut1, now);
  const previousBati = inRange(bati, 'surfaceBati', cut2, cut1);
  const evolutionPct = recentBati.length > 3 && previousBati.length > 3
    ? +((medianOf(recentBati) - medianOf(previousBati)) / medianOf(previousBati) * 100).toFixed(1)
    : null;

  const byYear = {};
  bati.forEach((t) => {
    const y = t.date?.substring(0, 4);
    if (!y) return;
    if (!byYear[y]) byYear[y] = [];
    const pp = t.valeur / t.surfaceBati;
    if (pp > 200 && pp < 25000) byYear[y].push(pp);
  });
  const sparkline = Object.entries(byYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, prices]) => ({ year, median: Math.round(medianOf(prices)), count: prices.length }));

  return {
    bati:         statsFrom(pricePerM2(bati, 'surfaceBati')),
    terrain:      statsFrom(pricePerM2(terrain, 'surfaceTerrain')),
    total:        transactions.length,
    evolutionPct,
    sparkline,
    dateRange: {
      min: [...transactions].sort((a, b) => a.date.localeCompare(b.date))[0]?.date,
      max: [...transactions].sort((a, b) => b.date.localeCompare(a.date))[0]?.date,
    },
  };
}
