const SIRENE_BASE = 'https://recherche-entreprises.api.gouv.fr';
const RGE_BASE    = 'https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2/lines';

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

const TRADE_TO_RGE = {
  isolation:   "Travaux d'isolation",
  chauffage:   "Chauffage et/ou ECS",
  plomberie:   "Chauffage et/ou ECS",
  electricite: "Photovoltaïque",
  menuiserie:  "Fenêtres et portes",
};

const toNaf = (naf) => naf.replace('.', '');

async function searchSirene({ nafCodes, departement, region, codePostal, perPage = 25 }) {
  const p = new URLSearchParams({
    activite_principale: nafCodes.map(toNaf).join(','),
    page: 1, per_page: perPage, etat_administratif: 'A',
  });
  if (departement) p.set('departement', departement);
  if (region)      p.set('region', region);
  if (codePostal)  p.set('code_postal', codePostal);

  const r = await fetch(`${SIRENE_BASE}/search?${p}`);
  if (!r.ok) throw new Error(`SIRENE HTTP ${r.status}`);
  const d = await r.json();
  return (d.results || []).map(parseSirene);
}

function parseSirene(r) {
  const s = r.siege || {};
  return {
    siren:         r.siren,
    nom:           r.nom_complet || r.nom_raison_sociale || '',
    naf:           r.activite_principale,
    nafLabel:      r.libelle_activite_principale || '',
    ville:         s.libelle_commune || '',
    codePostal:    s.code_postal || '',
    departement:   s.departement || '',
    adresse:       s.adresse || '',
    effectifLabel: r.tranche_effectif_salarie || '',
    effectifMin:   parseEffectif(r.tranche_effectif_salarie),
    dateCreation:  r.date_creation || '',
    dirigeant:     r.dirigeants?.[0]
      ? `${r.dirigeants[0].prenom || ''} ${r.dirigeants[0].nom || ''}`.trim()
      : null,
    source: 'sirene',
    email: null, telephone: null, siteWeb: null, rge: null,
  };
}

function parseEffectif(t) {
  const M = { '00':0,'01':1,'02':3,'03':6,'11':10,'12':20,'21':50,'22':100,'31':200,'32':500 };
  return M[t] ?? null;
}

async function searchRGE({ departement, codePostal, domaine, size = 50 }) {
  const p = new URLSearchParams({
    size,
    select: 'siret,nom,adresse,code_postal,ville,telephone,email,site_internet,domaine,qualif,date_debut_validite,date_fin_validite',
  });
  const filters = [];
  if (departement) filters.push(`code_postal:[${departement}000 TO ${departement}999]`);
  if (codePostal)  filters.push(`code_postal:"${codePostal}"`);
  if (domaine)     filters.push(`domaine:"${domaine}"`);
  if (filters.length) p.set('qs', filters.join(' AND '));

  const r = await fetch(`${RGE_BASE}?${p}`);
  if (!r.ok) throw new Error(`RGE HTTP ${r.status}`);
  const d = await r.json();
  return (d.results || []).map(parseRGE).filter(r => !r.validiteFin || new Date(r.validiteFin) >= new Date());
}

function parseRGE(r) {
  return {
    siret: r.siret || '', siren: r.siret?.substring(0, 9) || '',
    nom: r.nom || '', adresse: r.adresse || '',
    codePostal: r.code_postal || '', ville: r.ville || '',
    telephone: r.telephone || null, email: r.email || null,
    siteWeb: r.site_internet || null,
    domaine: r.domaine || '', qualification: r.qualif || '',
    validiteFin: r.date_fin_validite || '',
    source: 'rge', rge: true,
  };
}

function score(c) {
  let s = 0;
  const eff = c.effectifMin || 0;
  if (eff >= 10) s += 25; else if (eff >= 3) s += 20; else if (eff >= 1) s += 10;
  if (c.email)     s += 20;
  if (c.telephone) s += 15;
  if (c.dateCreation) s += Math.min((new Date().getFullYear() - +c.dateCreation.slice(0, 4)) * 2, 20);
  if (c.rge) s += 15;
  return s;
}

function priority(s, hasContact) {
  if (s >= 55 && hasContact) return 'P1';
  if (s >= 35) return 'P2';
  if (s >= 20) return 'P3';
  return 'P4';
}

export async function searchAndScore({ trades, departement, region, codePostal }) {
  const nafCodes = [...new Set(trades.flatMap(t => NAF_BY_TRADE[t] || []))];
  if (!nafCodes.length) throw new Error('Unknown trades');

  const [sireneRes, ...rgeRes] = await Promise.allSettled([
    searchSirene({ nafCodes, departement, region, codePostal }),
    ...trades.filter(t => TRADE_TO_RGE[t])
             .map(t => searchRGE({ departement, codePostal, domaine: TRADE_TO_RGE[t] })),
  ]);

  const companies = sireneRes.status === 'fulfilled' ? sireneRes.value : [];
  const rgeFlat   = rgeRes.filter(r => r.status === 'fulfilled').flatMap(r => r.value);

  const rgeMap = Object.fromEntries(rgeFlat.filter(r => r.siren).map(r => [r.siren, r]));
  const merged = companies.map(c => {
    const rge = rgeMap[c.siren];
    return rge ? { ...c, telephone: c.telephone || rge.telephone, email: c.email || rge.email,
                        siteWeb: c.siteWeb || rge.siteWeb, domaine: rge.domaine,
                        qualification: rge.qualification, rge: true } : c;
  });

  const scored = merged.map(c => {
    const s = score(c);
    return { ...c, score: s, priorite: priority(s, !!(c.email || c.telephone)) };
  });

  const known = new Set(scored.map(c => c.siren));
  const extra = rgeFlat
    .filter(r => r.siren && !known.has(r.siren))
    .map(r => { const s = score(r); return { ...r, score: s, priorite: priority(s, !!(r.email || r.telephone)), naf: nafCodes[0] }; });

  return [...scored, ...extra].sort((a, b) => b.score - a.score);
}
