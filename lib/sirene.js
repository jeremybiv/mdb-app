// ── Sirene / Recherche Entreprises + RGE ADEME ───────────
// Sources 100% gratuites, sans clé, CORS ouvert
//
// 1. https://recherche-entreprises.api.gouv.fr  — SIRENE officiel
// 2. https://data.ademe.fr                      — Certifications RGE
//
// Utilisé en complément ou fallback de Pappers

// ── NAF codes (identiques à lib/pappers.js) ───────────────
export const NAF_BY_TRADE = {
  plomberie:    ['43.22A', '43.22B'],
  chauffage:    ['43.22B', '43.22A'],
  electricite:  ['43.21A', '43.21B'],
  maconnerie:   ['43.12A', '43.91B', '43.99C'],
  charpente:    ['43.91A'],
  couverture:   ['43.91A'],
  menuiserie:   ['43.32A', '43.32B'],
  peinture:     ['43.34Z'],
  isolation:    ['43.91B'],
  terrassement: ['43.12A', '42.11Z'],
  architecture: ['71.11Z'],
  geometre:     ['71.12B'],
  demolition:   ['43.11Z'],
  climatisation:['43.22B'],
};

// NAF sans points pour l'API SIRENE
const toSireneNaf = (naf) => naf.replace('.', '');

// ── Recherche Entreprises API ─────────────────────────────

const SIRENE_BASE = 'https://recherche-entreprises.api.gouv.fr';

/**
 * Search companies by NAF + département
 * @param {string[]} nafCodes   ex: ['43.22A', '43.22B']
 * @param {string}   departement ex: '01'
 * @param {number}   page
 */
export async function searchSirene({ nafCodes, departement, region, codePostal, page = 1, perPage = 25 }) {
  const params = new URLSearchParams({
    activite_principale: nafCodes.map(toSireneNaf).join(','),
    page,
    per_page: perPage,
    // Filtre actifs uniquement
    etat_administratif: 'A',
  });

  if (departement) params.set('departement', departement);
  if (region)      params.set('region', region);
  if (codePostal)  params.set('code_postal', codePostal);

  const r = await fetch(`${SIRENE_BASE}/search?${params}`);
  if (!r.ok) throw new Error(`SIRENE API HTTP ${r.status}`);
  const d = await r.json();

  return {
    total:   d.total_results || 0,
    page:    d.page || 1,
    results: (d.results || []).map(parseSireneResult),
  };
}

function parseSireneResult(r) {
  const siege = r.siege || {};
  return {
    siren:          r.siren,
    nom:            r.nom_complet || r.nom_raison_sociale || '',
    naf:            r.activite_principale,
    nafLabel:       r.libelle_activite_principale || '',
    ville:          siege.libelle_commune || '',
    codePostal:     siege.code_postal || '',
    departement:    siege.departement || '',
    adresse:        siege.adresse || '',
    effectifLabel:  r.tranche_effectif_salarie || '',
    effectifMin:    parseEffectif(r.tranche_effectif_salarie),
    dateCreation:   r.date_creation || '',
    formeJuridique: r.nature_juridique || '',
    dirigeant:      r.dirigeants?.[0]
      ? `${r.dirigeants[0].prenom || ''} ${r.dirigeants[0].nom || ''}`.trim()
      : null,
    source: 'sirene',
    // Pas de CA ni email dans SIRENE — enrichi via RGE si disponible
    email:    null,
    telephone:null,
    siteWeb:  null,
    ca:       null,
    rge:      null,
  };
}

function parseEffectif(tranche) {
  // Tranches INSEE : '00'=0, '01'=1-2, '02'=3-5, '03'=6-9, '11'=10-19...
  const MAP = { '00': 0, '01': 1, '02': 3, '03': 6, '11': 10, '12': 20, '21': 50, '22': 100, '31': 200, '32': 500 };
  return MAP[tranche] ?? null;
}

// ── RGE ADEME ─────────────────────────────────────────────
// Dataset : https://data.ademe.fr/datasets/liste-des-entreprises-rge-2
// API data.gouv.fr explore v2

const RGE_BASE = 'https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2/lines';

/**
 * Search RGE certified companies
 * @param {string} departement  ex: '01'
 * @param {string} domaine      ex: 'Travaux d\'isolation', 'Chauffage', 'Photovoltaïque'
 */
export async function searchRGE({ departement, codePostal, domaine, size = 50 }) {
  const params = new URLSearchParams({ size, select: 'siret,nom,adresse,code_postal,ville,telephone,email,site_internet,domaine,qualif,date_debut_validite,date_fin_validite' });

  const filters = [];
  if (departement) filters.push(`code_postal:[${departement}000 TO ${departement}999]`);
  if (codePostal)  filters.push(`code_postal:"${codePostal}"`);
  if (domaine)     filters.push(`domaine:"${domaine}"`);
  if (filters.length) params.set('qs', filters.join(' AND '));

  const r = await fetch(`${RGE_BASE}?${params}`);
  if (!r.ok) throw new Error(`RGE API HTTP ${r.status}`);
  const d = await r.json();

  return (d.results || []).map(parseRGEResult).filter((r) => isRGEValid(r));
}

function parseRGEResult(r) {
  return {
    siret:        r.siret || '',
    siren:        r.siret?.substring(0, 9) || '',
    nom:          r.nom || '',
    adresse:      r.adresse || '',
    codePostal:   r.code_postal || '',
    ville:        r.ville || '',
    telephone:    r.telephone || null,
    email:        r.email || null,
    siteWeb:      r.site_internet || null,
    domaine:      r.domaine || '',
    qualification:r.qualif || '',
    validiteDebut:r.date_debut_validite || '',
    validiteFin:  r.date_fin_validite || '',
    source: 'rge',
    rge: true,
  };
}

function isRGEValid(r) {
  if (!r.validiteFin) return true;
  return new Date(r.validiteFin) >= new Date();
}

// ── Domaines RGE disponibles ──────────────────────────────
export const RGE_DOMAINES = [
  "Travaux d'isolation",
  "Chauffage et/ou ECS",
  "Chauffage et/ou ECS fossiles",
  "Photovoltaïque",
  "Ventilation",
  "Fenêtres et portes",
  "Audit énergétique",
];

// Mapping trade → domaine RGE
export const TRADE_TO_RGE = {
  isolation:    "Travaux d'isolation",
  chauffage:    "Chauffage et/ou ECS",
  plomberie:    "Chauffage et/ou ECS",
  electricite:  "Photovoltaïque",
  menuiserie:   "Fenêtres et portes",
};

// ── Scoring (même grille que Pappers, adaptée SIRENE) ─────

export function scoreSirene(company) {
  let score = 0;

  // Effectif
  const eff = company.effectifMin || 0;
  if (eff >= 10) score += 25;
  else if (eff >= 3) score += 20;
  else if (eff >= 1) score += 10;

  // Contact disponible
  if (company.email)     score += 20;
  if (company.telephone) score += 15;

  // Ancienneté
  if (company.dateCreation) {
    const age = new Date().getFullYear() - parseInt(company.dateCreation.substring(0, 4));
    score += Math.min(age * 2, 20);
  }

  // Bonus RGE
  if (company.rge) score += 15;

  return score;
}

export function priorityBucket(score, hasContact) {
  if (score >= 55 && hasContact) return 'P1';
  if (score >= 35) return 'P2';
  if (score >= 20) return 'P3';
  return 'P4';
}

// ── Merge SIRENE + RGE ────────────────────────────────────
// Enrichit les résultats SIRENE avec les données RGE si SIREN match

export function mergeWithRGE(sireneResults, rgeResults) {
  const rgeMap = {};
  rgeResults.forEach((r) => {
    if (r.siren) rgeMap[r.siren] = r;
  });

  return sireneResults.map((s) => {
    const rge = rgeMap[s.siren];
    if (!rge) return s;
    return {
      ...s,
      telephone: s.telephone || rge.telephone,
      email:     s.email     || rge.email,
      siteWeb:   s.siteWeb   || rge.siteWeb,
      domaine:   rge.domaine,
      qualification: rge.qualification,
      rge: true,
    };
  });
}

// ── Full search + enrich + score ──────────────────────────

export async function searchAndScore({ trades, departement, region, codePostal }) {
  const nafCodes = [...new Set(trades.flatMap((t) => NAF_BY_TRADE[t] || []))];
  if (!nafCodes.length) throw new Error('Unknown trades');

  // Run SIRENE + RGE in parallel
  const [sireneData, ...rgeResults] = await Promise.allSettled([
    searchSirene({ nafCodes, departement, region, codePostal }),
    // RGE pour chaque trade qui a un mapping
    ...trades
      .filter((t) => TRADE_TO_RGE[t])
      .map((t) => searchRGE({ departement, codePostal, domaine: TRADE_TO_RGE[t] })),
  ]);

  const companies = sireneData.status === 'fulfilled' ? sireneData.value.results : [];
  const rgeFlat   = rgeResults
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  // Merge + score
  const merged = mergeWithRGE(companies, rgeFlat);
  const scored = merged.map((c) => {
    const score      = scoreSirene(c);
    const hasContact = !!(c.email || c.telephone);
    return { ...c, score, priorite: priorityBucket(score, hasContact) };
  });

  // Ajouter les RGE non trouvés dans SIRENE (certifiés mais siège hors département)
  const sireneMap = new Set(scored.map((s) => s.siren));
  const extraRGE  = rgeFlat
    .filter((r) => r.siren && !sireneMap.has(r.siren))
    .map((r) => {
      const score      = scoreSirene(r);
      const hasContact = !!(r.email || r.telephone);
      return { ...r, score, priorite: priorityBucket(score, hasContact), naf: nafCodes[0] };
    });

  return [...scored, ...extraRGE].sort((a, b) => b.score - a.score);
}
