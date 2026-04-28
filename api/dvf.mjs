// Vercel Function — proxy DVF côté serveur
// Cascade : CSV commune (data.gouv) → CEREMA → ODS
// Pas de dépendances externes — Node.js natif uniquement

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = '/tmp/dvf-cache';

function ensureCacheDir() {
  try { if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true }); }
  catch (e) { console.warn(`DVF cache dir: ${e.message}`); }
}

function cachePath(year, dept, citycode) {
  return join(CACHE_DIR, `${year}-${dept}-${citycode}.csv`);
}

async function fetchT(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

// ── CSV parser ────────────────────────────────────────────
function parseLine(line) {
  const f = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { f.push(cur); cur = ''; }
    else cur += ch;
  }
  f.push(cur);
  return f;
}

function deptFrom(citycode) {
  if (/^2[AB]/i.test(citycode)) return citycode.substring(0, 2).toUpperCase();
  if (citycode.startsWith('97'))  return citycode.substring(0, 3);
  return citycode.substring(0, 2);
}

function parseCsv(text, dateMin) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];
  const h   = parseLine(lines[0]);
  const col = (n) => h.indexOf(n);

  const iId = col('id_mutation'), iDate = col('date_mutation'), iNat = col('nature_mutation');
  const iVal = col('valeur_fonciere'), iBati = col('surface_reelle_bati'), iTerr = col('surface_terrain');
  const iType = col('type_local'), iCom = col('nom_commune'), iCP = col('code_postal');
  const iNum = col('adresse_numero'), iSuf = col('adresse_suffixe'), iVoie = col('adresse_nom_voie');
  const iLat = col('latitude'), iLon = col('longitude'), iParc = col('id_parcelle');

  const mut = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const c = parseLine(line);
    if (c[iNat] !== 'Vente' || c[iDate] < dateMin || !c[iId]) continue;
    const id = c[iId];
    if (!mut.has(id)) {
      const num = [c[iNum], c[iSuf]].filter(Boolean).join('');
      mut.set(id, {
        valeur: +c[iVal] || 0, surfaceBati: 0, surfaceTerrain: 0,
        typeLocal: c[iType] || '—', date: c[iDate] || '',
        commune: c[iCom] || '', codePostal: c[iCP] || '',
        adresse: [num, c[iVoie]].filter(Boolean).join(' ') || '',
        lat: +c[iLat] || null, lon: +c[iLon] || null, idParcelle: c[iParc] || null,
      });
    }
    const m = mut.get(id), bati = +c[iBati] || 0;
    m.surfaceBati += bati;
    m.surfaceTerrain += +c[iTerr] || 0;
    if (!m.typeLocal || m.typeLocal === '—' || m.typeLocal === 'Dépendance') {
      const t = c[iType]; if (t && t !== 'Dépendance') m.typeLocal = t;
    }
    if (bati > 0 && c[iParc]) m.idParcelle = c[iParc];
  }
  return [...mut.values()].filter((t) => t.valeur > 0 && (t.surfaceBati > 0 || t.surfaceTerrain > 0));
}

// ── Source 1 : CSV commune ────────────────────────────────
async function fromCommune(citycode, dateMin) {
  const dept = deptFrom(citycode);
  ensureCacheDir();
  const sinceYear = new Date(dateMin).getFullYear();
  const now = new Date().getFullYear();
  const all = [];
  let lastUrl = '';

  for (let year = sinceYear; year <= now; year++) {
    const url = `https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/communes/${dept}/${citycode}.csv`;
    const cp  = cachePath(year, dept, citycode);
    lastUrl   = url;
    let text;
    if (existsSync(cp)) {
      text = readFileSync(cp, 'utf-8');
    } else {
      let r;
      try { r = await fetchT(url, 12000); } catch (e) { console.warn(`DVF ${year}: ${e.message}`); continue; }
      if (!r.ok) { console.warn(`DVF ${year}: HTTP ${r.status}`); continue; }
      text = await r.text();
      try { writeFileSync(cp, text, 'utf-8'); } catch {}
    }
    all.push(...parseCsv(text, dateMin));
  }
  return { transactions: all, url: lastUrl };
}

// ── Source 2 : CEREMA ─────────────────────────────────────
async function fromCerema(lon, lat, radius, dateMin) {
  const p = new URLSearchParams({ lon, lat, rayon: Math.round(radius), date_mutation_min: dateMin, nature_mutation: 'Vente', page_size: 500 });
  const url = `https://apidf.cerema.fr/dvf_opendata/geomutations/?${p}`;
  const r = await fetchT(url, 10000);
  if (!r.ok) throw Object.assign(new Error(`CEREMA ${r.status}`), { url });
  const d = await r.json();
  return { transactions: parseGeneric(d.results || []), url };
}

// ── Source 3 : ODS ────────────────────────────────────────
async function fromODS(lon, lat, radius, dateMin) {
  const p = new URLSearchParams({
    dataset: 'buildingref-france-demande-valeurs-foncieres-geolocalisee-millesime',
    'geofilter.distance': `${lat},${lon},${radius}`,
    'refine.nature_mutation': 'Vente', rows: 100,
  });
  p.append('q', `date_mutation >= "${dateMin}"`);
  const url = `https://public.opendatasoft.com/api/records/1.0/search/?${p}`;
  const r = await fetchT(url, 10000);
  if (!r.ok) throw Object.assign(new Error(`ODS ${r.status}`), { url });
  const d = await r.json();
  return { transactions: parseGeneric((d.records || []).map((rc) => rc.fields || rc)), url };
}

function parseGeneric(items) {
  return items.map((p) => ({
    valeur: +(p.valeur_fonciere || p.prix || 0),
    surfaceBati: +(p.surface_reelle_bati || p.surface_bati || 0),
    surfaceTerrain: +(p.surface_terrain || 0),
    typeLocal: p.type_local || '—',
    date: p.date_mutation || p.date || '',
    commune: p.nom_commune || p.commune || '',
    codePostal: p.code_postal || '',
  })).filter((t) => t.valeur > 0 && (t.surfaceBati > 0 || t.surfaceTerrain > 0));
}

// ── Handler ───────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });

  const q      = req.query || {};
  const lon    = +q.lon, lat = +q.lat;
  const radius = +(q.radius || 1500);
  const months = +(q.months || 12);
  const citycode = q.citycode || null;
  const debug  = Boolean(q.debug);

  if (!lon || !lat) return res.status(400).json({ detail: 'lon et lat requis' });

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const dateMin = since.toISOString().split('T')[0];
  const log = [];

  const attempt = async (label, fn) => {
    const a = { source: label, url: null, status: null, count: null, error: null };
    try {
      const r = await fn();
      a.url = r.url; a.status = 200; a.count = r.transactions.length;
      log.push(a);
      if (r.transactions.length > 0) {
        res.json({ transactions: r.transactions, source: label, count: r.transactions.length, ...(debug ? { debugLog: log } : {}) });
        return true;
      }
    } catch (e) {
      a.error = e.message; a.url = e.url || null;
      log.push(a);
    }
    return false;
  };

  if (citycode && await attempt(`DVF commune ${citycode}`, () => fromCommune(citycode, dateMin))) return;
  if (await attempt('CEREMA', () => fromCerema(lon, lat, radius, dateMin))) return;
  if (await attempt('ODS',    () => fromODS(lon, lat, radius, dateMin))) return;

  res.status(503).json({ detail: 'Toutes les sources DVF indisponibles', debugLog: log });
}
