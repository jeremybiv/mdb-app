// INSEE API — Profil socio-économique par commune
// Source : https://api.insee.fr/series/BDM/V1
// + géo.api.gouv.fr pour infos commune
// France entière, CORS ouvert pour géo API

/**
 * Fetch commune info (population, superficie, etc.)
 * Uses geo.api.gouv.fr — no auth, CORS open
 */
export async function fetchCommuneInfo(citycode) {
  const r = await fetch(
    `https://geo.api.gouv.fr/communes/${citycode}?fields=nom,code,codesPostaux,codeDepartement,codeRegion,population,superficie,centre,contour`
  );
  if (!r.ok) throw new Error(`Commune info HTTP ${r.status}`);
  return r.json();
}

/**
 * Fetch department-level socio stats from INSEE open data
 * Uses the statique dataset from INSEE via data.gouv.fr
 * fallback to hard-coded national benchmarks
 */
export async function fetchSocioEco(citycode, communeNom) {
  // Step 1: get commune base info
  const commune = await fetchCommuneInfo(citycode);

  // Step 2: fetch revenus/pauvreté from INSEE filosofi via data.gouv.fr API
  // Dataset: "Revenus, pauvreté et niveau de vie en 2021 - Commune"
  let filosofi = null;
  try {
    const r = await fetch(
      `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/` +
      `filosofi-2021-communes/records?where=codgeo%3D%22${citycode}%22&limit=1`
    );
    if (r.ok) {
      const d = await r.json();
      filosofi = d.results?.[0] || null;
    }
  } catch { /* non-blocking */ }

  // Step 3: fetch employment from INSEE (RP - Recensement)
  let emploi = null;
  try {
    const r = await fetch(
      `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/` +
      `rp-2020-emploi-activite-commune/records?where=codgeo%3D%22${citycode}%22&limit=1`
    );
    if (r.ok) {
      const d = await r.json();
      emploi = d.results?.[0] || null;
    }
  } catch { /* non-blocking */ }

  // Step 4: fetch logement stats
  let logement = null;
  try {
    const r = await fetch(
      `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/` +
      `rp-2020-logement-commune/records?where=codgeo%3D%22${citycode}%22&limit=1`
    );
    if (r.ok) {
      const d = await r.json();
      logement = d.results?.[0] || null;
    }
  } catch { /* non-blocking */ }

  return buildProfile(commune, filosofi, emploi, logement, citycode);
}

function pct(v, fallback = null) {
  if (v == null) return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : Math.round(n * 10) / 10;
}

function euro(v, fallback = null) {
  if (v == null) return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : Math.round(n);
}

function buildProfile(commune, filosofi, emploi, logement, citycode) {
  return {
    commune: {
      nom:         commune.nom,
      code:        commune.code,
      departement: commune.codeDepartement,
      region:      commune.codeRegion,
      population:  commune.population,
      superficie:  commune.superficie, // hectares
      densiteHab:  commune.population && commune.superficie
        ? Math.round(commune.population / (commune.superficie / 100))
        : null, // hab/km²
      codesPostaux: commune.codesPostaux,
    },
    revenus: {
      medianDisponible: euro(filosofi?.ind_snv || filosofi?.median || filosofi?.q2),       // € median disponible/UC
      tauxPauvrete:     pct(filosofi?.tp60 || filosofi?.taux_pauvrete),
      gini:             filosofi?.gini ? pct(filosofi.gini) : null,
      q1:               euro(filosofi?.q1),
      q3:               euro(filosofi?.q3),
    },
    emploi: {
      tauxActivite:     pct(emploi?.p20_actocc15p || emploi?.taux_activite),
      tauxChomage:      pct(emploi?.p20_chom1564 || emploi?.taux_chomage),
      tauxCadres:       pct(emploi?.p20_cs3 || emploi?.taux_cadres),
      tauxOuvriers:     pct(emploi?.p20_cs6 || emploi?.taux_ouvriers),
      tauxRetraites:    pct(emploi?.p20_cs7 || emploi?.taux_retraites),
    },
    logement: {
      nbLogements:        euro(logement?.p20_log || logement?.nb_logements),
      tauxResidPrincipale:pct(logement?.p20_rp || logement?.taux_rp),
      tauxLocataires:     pct(logement?.p20_lochlm || logement?.taux_locataires),
      tauxProprietaires:  pct(logement?.p20_prop || logement?.taux_proprietaires),
      tauxVacants:        pct(logement?.p20_logvac || logement?.taux_vacants),
      tauxMaisonsIndiv:   pct(logement?.p20_maison || logement?.taux_maisons),
    },
    source:    'INSEE RP 2020 / Filosofi 2021 / geo.api.gouv.fr',
    citycode,
  };
}

/**
 * Compute a simple "attractivité immobilière" score 0-100 from socio data
 */
export function computeAttractivite(profile) {
  let score = 50;
  const { revenus, emploi, logement, commune } = profile;

  // Revenus (max +20)
  if (revenus.medianDisponible) {
    if (revenus.medianDisponible > 30000) score += 20;
    else if (revenus.medianDisponible > 25000) score += 15;
    else if (revenus.medianDisponible > 20000) score += 8;
    else if (revenus.medianDisponible < 15000) score -= 10;
  }

  // Taux pauvreté (max -15)
  if (revenus.tauxPauvrete) {
    if (revenus.tauxPauvrete > 20) score -= 15;
    else if (revenus.tauxPauvrete > 15) score -= 8;
    else if (revenus.tauxPauvrete < 8) score += 8;
  }

  // Emploi/cadres (max +10)
  if (emploi.tauxCadres) {
    if (emploi.tauxCadres > 25) score += 10;
    else if (emploi.tauxCadres > 15) score += 5;
  }

  // Chômage (max -10)
  if (emploi.tauxChomage) {
    if (emploi.tauxChomage > 15) score -= 10;
    else if (emploi.tauxChomage < 6) score += 5;
  }

  // Propriétaires (max +10)
  if (logement.tauxProprietaires) {
    if (logement.tauxProprietaires > 65) score += 10;
    else if (logement.tauxProprietaires > 50) score += 5;
  }

  // Vacance (max -10)
  if (logement.tauxVacants) {
    if (logement.tauxVacants > 10) score -= 10;
    else if (logement.tauxVacants < 5) score += 5;
  }

  // Densité — ni trop vide ni trop dense = attractif pour MdB
  if (commune.densiteHab) {
    if (commune.densiteHab > 150 && commune.densiteHab < 3000) score += 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
