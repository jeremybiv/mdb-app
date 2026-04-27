import axios from 'axios';

const BASE = 'https://api.pappers.fr/v2';
const KEY = process.env.PAPPERS_API_KEY;

if (!KEY) console.warn('⚠  PAPPERS_API_KEY not set — Pappers routes will fail');

// ── NAF codes by trade ────────────────────────────────────
export const NAF_BY_TRADE = {
  plomberie:       ['4322A', '4322B'],
  chauffage:       ['4322B', '4322A'],
  electricite:     ['4321A', '4321B'],
  maconnerie:      ['4312A', '4391B', '4399C'],
  charpente:       ['4391A'],
  couverture:      ['4391A'],
  menuiserie:      ['4332A', '4332B'],
  peinture:        ['4334Z'],
  isolation:       ['4391B'],
  terrassement:    ['4312A', '4211Z'],
  architecture:    ['7111Z'],
  geometre:        ['7112B'],
  demolition:      ['4311Z'],
  climatisation:   ['4322B'],
};

// ── Scoring grid ──────────────────────────────────────────
export function scoreArtisan(company) {
  let score = 0;
  const ca = company.chiffre_affaires || 0;
  const effectif = company.effectif_min || 0;

  if (ca > 500_000)  score += 30;
  else if (ca > 200_000) score += 20;
  else if (ca > 100_000) score += 10;

  if (effectif >= 10) score += 25;
  else if (effectif >= 3) score += 20;
  else if (effectif >= 1) score += 10;

  if (company.email)     score += 20;
  if (company.telephone) score += 15;

  const creationYear = company.date_creation
    ? parseInt(company.date_creation.substring(0, 4))
    : null;
  if (creationYear) {
    const age = new Date().getFullYear() - creationYear;
    score += Math.min(age * 2, 20); // +2pts/year, max 20
  }

  if (company.resultat_net > 0) score += 10;

  const dirigeantYear = company.dirigeant_annee_prise_de_poste
    ? parseInt(company.dirigeant_annee_prise_de_poste)
    : null;
  if (dirigeantYear && dirigeantYear >= 2019) score += 5;

  return score;
}

export function priorityBucket(score, hasContact) {
  if (score >= 55 && hasContact) return 'P1';
  if (score >= 35) return 'P2';
  if (score >= 20) return 'P3';
  return 'P4';
}

// ── Search companies ──────────────────────────────────────
export async function searchCompanies({ nafCodes, departement, codePostal, effectifMin = 1, q }) {
  const params = {
    api_token: KEY,
    code_naf: nafCodes.join(','),
    departement,
    code_postal: codePostal,
    effectif_min: effectifMin,
    par_page: 25,
    precision: 'standard',
  };
  if (q) params.q = q;

  const { data } = await axios.get(`${BASE}/recherche`, { params });
  return data.resultats || [];
}

// ── Get company details ───────────────────────────────────
export async function getCompanyDetails(siren) {
  const { data } = await axios.get(`${BASE}/entreprise`, {
    params: { api_token: KEY, siren, extrait_papiers: true },
  });
  return data;
}

// ── Enrich list (top N) ───────────────────────────────────
export async function enrichAndScore(companies, limit = 15) {
  const top = companies.slice(0, limit);

  const enriched = await Promise.allSettled(
    top.map(async (c) => {
      try {
        const details = await getCompanyDetails(c.siren);
        const score = scoreArtisan({
          chiffre_affaires: details.chiffre_affaires,
          effectif_min: details.effectif_min,
          email: details.email,
          telephone: details.telephone,
          date_creation: details.date_creation,
          resultat_net: details.resultat_net,
          dirigeant_annee_prise_de_poste: details.representants?.[0]?.annee_prise_de_poste,
        });
        const hasContact = !!(details.email || details.telephone);
        return {
          siren: c.siren,
          nom: details.nom_entreprise || c.nom_entreprise,
          naf: details.code_naf,
          ville: details.siege?.ville,
          codePostal: details.siege?.code_postal,
          effectif: details.effectif_min,
          ca: details.chiffre_affaires,
          dirigeant: details.representants?.[0]
            ? `${details.representants[0].prenom || ''} ${details.representants[0].nom || ''}`.trim()
            : null,
          email: details.email || null,
          telephone: details.telephone || null,
          siteWeb: details.site_web || null,
          dateCreation: details.date_creation,
          score,
          priorite: priorityBucket(score, hasContact),
          source: 'pappers',
        };
      } catch {
        // Return basic info with low score if detail fetch fails
        return {
          siren: c.siren,
          nom: c.nom_entreprise,
          naf: c.code_naf,
          ville: c.siege?.ville,
          score: 10,
          priorite: 'P4',
          source: 'pappers',
        };
      }
    })
  );

  return enriched
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .sort((a, b) => b.score - a.score);
}
