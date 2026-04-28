import express from 'express';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cacheGet, cacheSet } from '../lib/memcache.js';

// DVF — Demandes de Valeurs Foncières
// Source principale : fichiers CSV géolocalisés par commune
// https://files.data.gouv.fr/geo-dvf/latest/csv/{year}/communes/{dept}/{citycode}.csv
// Fallbacks : CEREMA apidf.cerema.fr · OpenDataSoft v1

const __dvfDir = dirname(fileURLToPath(import.meta.url));
const CSV_CACHE_DIR = join(__dvfDir, '../../cache/dvf');

function ensureCacheDir() {
  if (!existsSync(CSV_CACHE_DIR)) mkdirSync(CSV_CACHE_DIR, { recursive: true });
}

function csvCachePath(year, dept, citycode) {
  return join(CSV_CACHE_DIR, `${year}-${dept}-${citycode}.csv`);
}

// ── CSV parser (handles quoted fields) ───────────────────
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      fields.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function deptFromCitycode(citycode) {
  if (!citycode) return null;
  if (/^2[AB]/i.test(citycode)) return citycode.substring(0, 2).toUpperCase();
  if (citycode.startsWith('97')) return citycode.substring(0, 3);
  return citycode.substring(0, 2);
}

// ── Source 1 : CSV commune géolocalisé (data.gouv) ───────
async function fetchDvfCommune(citycode, dateMin, debug) {
  const dept = deptFromCitycode(citycode);
  if (!dept) throw new Error('citycode manquant');

  const sinceYear   = new Date(dateMin).getFullYear();
  const currentYear = new Date().getFullYear();
  ensureCacheDir();

  const allTransactions = [];
  let lastUrl = '';

  for (let year = sinceYear; year <= currentYear; year++) {
    const url      = `https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/communes/${dept}/${citycode}.csv`;
    const cached   = csvCachePath(year, dept, citycode);
    lastUrl = url;
    let text;

    if (existsSync(cached)) {
      console.log(`DVF cache hit: ${year}/${citycode}`);
      text = readFileSync(cached, 'utf-8');
    } else {
      let r;
      try {
        r = await fetchWithTimeout(url, 20000);
      } catch (e) {
        console.warn(`DVF commune ${year} network: ${e.cause?.message || e.cause?.code || e.message}`);
        continue;
      }
      if (r.status === 404) { console.warn(`DVF commune ${year}: 404`); continue; }
      if (!r.ok) { console.warn(`DVF commune ${year}: HTTP ${r.status}`); continue; }
      text = await r.text();
      writeFileSync(cached, text, 'utf-8');
      console.log(`DVF téléchargé et mis en cache: ${year}/${citycode} (${text.length} octets)`);
    }

    allTransactions.push(...parseDvfCsv(text, dateMin));
    console.log(`DVF commune ${year}: ${allTransactions.length} mutations cumulées`);
  }

  if (debug) return { transactions: allTransactions, url: lastUrl, count: allTransactions.length };
  return allTransactions;
}

function parseDvfCsv(text, dateMin) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const col = (name) => headers.indexOf(name);

  const iId      = col('id_mutation');
  const iDate    = col('date_mutation');
  const iNature  = col('nature_mutation');
  const iValeur  = col('valeur_fonciere');
  const iBati    = col('surface_reelle_bati');
  const iTerrain = col('surface_terrain');
  const iType    = col('type_local');
  const iCommune = col('nom_commune');
  const iCP      = col('code_postal');
  const iNumero  = col('adresse_numero');
  const iSuffix  = col('adresse_suffixe');
  const iVoie    = col('adresse_nom_voie');
  const iLat      = col('latitude');
  const iLon      = col('longitude');
  const iParcelle = col('id_parcelle');

  const mutations = new Map();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const c = parseCsvLine(line);

    if (c[iNature] !== 'Vente') continue;
    if (c[iDate] < dateMin) continue;

    const id = c[iId];
    if (!id) continue;

    if (!mutations.has(id)) {
      const num = [c[iNumero], c[iSuffix]].filter(Boolean).join('');
      const adresse = [num, c[iVoie]].filter(Boolean).join(' ') || '';
      mutations.set(id, {
        valeur:         +c[iValeur] || 0,
        surfaceBati:    0,
        surfaceTerrain: 0,
        typeLocal:      c[iType] || '—',
        date:           c[iDate] || '',
        commune:        c[iCommune] || '',
        codePostal:     c[iCP] || '',
        adresse,
        lat:            +c[iLat] || null,
        lon:            +c[iLon] || null,
        idParcelle:     c[iParcelle] || null,
      });
    }
    const m    = mutations.get(id);
    const bati = +c[iBati] || 0;
    m.surfaceBati    += bati;
    m.surfaceTerrain += +c[iTerrain] || 0;
    // Keep most descriptive typeLocal (prefer Maison/Appartement over Dépendance/'—')
    if (!m.typeLocal || m.typeLocal === '—' || m.typeLocal === 'Dépendance') {
      const t = c[iType];
      if (t && t !== 'Dépendance') m.typeLocal = t;
    }
    // Prefer parcel ID from the built lot (not terrain/pré)
    if (bati > 0 && c[iParcelle]) m.idParcelle = c[iParcelle];
  }

  return [...mutations.values()].filter(isValid);
}

// ── Source 2 : CEREMA production ─────────────────────────
async function fetchCerema(lon, lat, radiusM, dateMin, debug) {
  const params = new URLSearchParams({
    lon,
    lat,
    rayon:             Math.round(radiusM),
    date_mutation_min: dateMin,
    nature_mutation:   'Vente',
    page_size:         500,
  });
  const url = `https://apidf.cerema.fr/dvf_opendata/geomutations/?${params}`;
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw Object.assign(new Error(`CEREMA HTTP ${r.status}`), { url, status: r.status, body: body.slice(0, 300) });
  }
  const d = await r.json();
  const transactions = parseGeneric(d.results || []);
  if (debug) return { transactions, url, count: transactions.length };
  return transactions;
}

// ── Source 3 : OpenDataSoft DVF v1 ───────────────────────
async function fetchODS(lon, lat, radiusM, dateMin, debug) {
  const params = new URLSearchParams({
    dataset:                  'buildingref-france-demande-valeurs-foncieres-geolocalisee-millesime',
    'geofilter.distance':     `${lat},${lon},${radiusM}`,
    'refine.nature_mutation': 'Vente',
    rows:                     100,
  });
  // ODS v1 date filter via q
  params.append('q', `date_mutation >= "${dateMin}"`);
  const url = `https://public.opendatasoft.com/api/records/1.0/search/?${params}`;
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw Object.assign(new Error(`ODS HTTP ${r.status}`), { url, status: r.status, body: body.slice(0, 300) });
  }
  const d = await r.json();
  const items = (d.records || []).map((rec) => rec.fields || rec);
  const transactions = parseGeneric(items);
  if (debug) return { transactions, url, count: transactions.length };
  return transactions;
}

// ── Parser générique (CEREMA / ODS) ──────────────────────
function parseGeneric(items) {
  return items
    .map((item) => {
      const p = item.properties || item;
      return {
        valeur:         +(p.valeur_fonciere || p.prix || 0),
        surfaceBati:    +(p.surface_reelle_bati || p.surface_bati || 0),
        surfaceTerrain: +(p.surface_terrain || 0),
        typeLocal:      p.type_local || '—',
        date:           p.date_mutation || p.date || '',
        commune:        p.nom_commune || p.commune || '',
        codePostal:     p.code_postal || '',
      };
    })
    .filter(isValid);
}

function isValid(t) {
  return t.valeur > 0 && (t.surfaceBati > 0 || t.surfaceTerrain > 0);
}

// ── Fetch avec timeout ────────────────────────────────────
async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ── Main export : cascade ─────────────────────────────────
export async function fetchTransactions(lon, lat, radiusM = 1500, months = 24, debug = false, citycode = null) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const dateMin = since.toISOString().split('T')[0];

  // Cache mémoire — clé = commune + période (12h TTL)
  const cacheKey = `dvf_${citycode || `${lon},${lat}`}_${dateMin}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    console.log(`DVF cache hit: ${cacheKey}`);
    return cached;
  }

  const log = [];

  // ── 1. Commune CSV (source principale si citycode dispo) ──
  if (citycode) {
    const attempt = { source: `DVF Commune ${citycode}`, url: null, status: null, count: null, error: null };
    try {
      console.log(`DVF: trying commune CSV ${citycode}…`);
      const result = await fetchDvfCommune(citycode, dateMin, true);
      attempt.url    = result.url;
      attempt.count  = result.count;
      attempt.status = 200;
      log.push(attempt);
      if (result.transactions.length > 0) {
        console.log(`DVF: commune ${citycode} → ${result.transactions.length} transactions`);
        const out = { transactions: result.transactions, source: `DVF commune ${citycode}`, debug: log };
        cacheSet(cacheKey, out, 12 * 3_600_000); // 12h
        return out;
      }
      console.warn(`DVF: commune ${citycode} → 0 résultats`);
    } catch (e) {
      attempt.error  = e.message;
      attempt.url    = e.url  || null;
      attempt.status = e.status || null;
      log.push(attempt);
      console.warn(`DVF: commune CSV failed:`, e.message);
    }
  }

  // ── 2. Fallbacks lat/lon ──────────────────────────────────
  const FALLBACKS = [
    { name: 'CEREMA', fetch: fetchCerema },
    { name: 'ODS v1', fetch: fetchODS   },
  ];

  for (const src of FALLBACKS) {
    const attempt = { source: src.name, url: null, status: null, count: null, error: null };
    try {
      console.log(`DVF: trying ${src.name}…`);
      const result = await src.fetch(lon, lat, radiusM, dateMin, true);
      attempt.url    = result.url;
      attempt.count  = result.count;
      attempt.status = 200;
      log.push(attempt);
      if (result.transactions.length > 0) {
        console.log(`DVF: ${src.name} → ${result.transactions.length} transactions`);
        const out = { transactions: result.transactions, source: src.name, debug: log };
        cacheSet(cacheKey, out, 12 * 3_600_000); // 12h
        return out;
      }
      console.warn(`DVF: ${src.name} → 0 résultats`);
    } catch (e) {
      const cause = e.cause?.message || e.cause?.code || '';
      attempt.error  = cause ? `${e.message} — ${cause}` : e.message;
      attempt.url    = e.url    || null;
      attempt.status = e.status || null;
      attempt.body   = e.body   || null;
      log.push(attempt);
      console.warn(`DVF: ${src.name} failed:`, e.message, cause ? `(${cause})` : '');
    }
  }

  throw Object.assign(
    new Error('Toutes les sources DVF indisponibles'),
    { dvfLog: log },
  );
}

// ── Express router ────────────────────────────────────────
const router = express.Router();

router.get('/', async (req, res) => {
  const { lon, lat, radius = 1500, months = 12, debug, citycode } = req.query;
  if (!lon || !lat) return res.status(400).json({ detail: 'lon et lat requis' });
  try {
    const result = await fetchTransactions(+lon, +lat, +radius, +months, true, citycode || null);
    const payload = { transactions: result.transactions, source: result.source, count: result.transactions.length };
    if (debug) payload.debugLog = result.debug;
    res.json(payload);
  } catch (e) {
    res.status(503).json({ detail: e.message, debugLog: e.dvfLog || [] });
  }
});

export default router;

// ── Stats computation ─────────────────────────────────────

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
    pricePerM2(items.filter((t) => { const d = new Date(t.date); return d >= from && d < to; }), key);

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
    bati:    statsFrom(pricePerM2(bati, 'surfaceBati')),
    terrain: statsFrom(pricePerM2(terrain, 'surfaceTerrain')),
    total:   transactions.length,
    evolutionPct,
    sparkline,
    dateRange: {
      min: [...transactions].sort((a, b) => a.date.localeCompare(b.date))[0]?.date,
      max: [...transactions].sort((a, b) => b.date.localeCompare(a.date))[0]?.date,
    },
  };
}
