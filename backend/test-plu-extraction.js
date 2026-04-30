/**
 * Test d'extraction PLU sur 4 communes dans 4 départements
 * Usage : node --env-file=../.env.local test-plu-extraction.js
 *
 * Pipeline testée :
 *   geocodage BAN → zone GPU → document GPU → téléchargement PDF
 *   → extraction texte (pdf-parse) → extraction règles (regex)
 */

import { extractRulesFromText, getPluZoneText } from './src/services/pluPdf.js';

// ── Couleurs terminal ──────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', blue: '\x1b[34m',
};
const ok    = (s) => `${C.green}✓${C.reset} ${s}`;
const ko    = (s) => `${C.red}✗${C.reset} ${s}`;
const warn  = (s) => `${C.yellow}⚠${C.reset} ${s}`;
const head  = (s) => `\n${C.bold}${C.cyan}${'─'.repeat(60)}\n  ${s}\n${'─'.repeat(60)}${C.reset}`;
const label = (k, v, extra = '') => `  ${C.dim}${k.padEnd(26)}${C.reset}${C.bold}${v}${C.reset}${extra ? C.dim + '  ' + extra + C.reset : ''}`;

// ── Helpers API ────────────────────────────────────────────────
async function geocode(address) {
  const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
  const d = await r.json();
  if (!d.features?.length) throw new Error('Adresse introuvable');
  const f = d.features[0];
  return {
    lon:      f.geometry.coordinates[0],
    lat:      f.geometry.coordinates[1],
    label:    f.properties.label,
    citycode: f.properties.citycode,
    postcode: f.properties.postcode,
    score:    f.properties.score,
  };
}

async function getZone(lon, lat) {
  const geom = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));
  const r = await fetch(`https://apicarto.ign.fr/api/gpu/zone-urba?geom=${geom}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.features?.[0]?.properties ?? null;
}

async function getDocument(lon, lat) {
  const geom = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));
  const r = await fetch(`https://apicarto.ign.fr/api/gpu/document?geom=${geom}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.features?.[0]?.properties ?? null;
}

// ── Résumé des règles extraites ────────────────────────────────
function printRules(rules) {
  const numKeys = [
    ['empriseSol',           'Emprise sol (CES)',    '%'],
    ['hauteurMax',           'Hauteur max',          'm'],
    ['hauteurEgout',         'Hauteur égout',        'm'],
    ['reculVoirie',          'Recul voirie',         'm'],
    ['reculLimites',         'Recul lim. sép.',      'm'],
    ['distanceConstruction', 'Dist. constructions',  'm'],
    ['surfacePlancher',      'Surface plancher max', 'm²'],
    ['surfaceMinLot',        'Surface min lot',      'm²'],
    ['largeurFacade',        'Largeur façade min',   'm'],
    ['statLogement',         'Stat./logement',       'pl.'],
    ['statBureau',           'Stat./bureau',         'pl./m²'],
    ['espaceVert',           'Espaces verts min',    '%'],
    ['coeffBiotope',         'Coeff. biotope',       ''],
  ];

  const textKeys = ['destinationsAutorisees', 'destinationsInterdites'];
  const boolKeys = ['presenceABF', 'presencePPRI', 'presenceOAP'];

  let foundNum = 0;
  console.log(`\n  ${C.bold}Valeurs numériques${C.reset}`);
  for (const [key, lbl, unit] of numKeys) {
    const v = rules[key];
    if (v?.value != null) {
      foundNum++;
      const ctx = v.context ? `  «${v.context.slice(0, 70)}…»` : '';
      console.log(ok(label(lbl, `${v.value} ${unit}`, ctx.trim())));
    } else {
      console.log(ko(label(lbl, C.dim + 'non trouvé' + C.reset)));
    }
  }

  console.log(`\n  ${C.bold}Destinations (texte)${C.reset}`);
  for (const key of textKeys) {
    const v = rules[key];
    const lbl = key === 'destinationsAutorisees' ? 'Autorisées' : 'Interdites';
    if (v?.text) {
      const preview = v.text.replace(/\n/g, ' ').slice(0, 100);
      console.log(ok(`  ${lbl.padEnd(26)}${C.dim}${preview}…${C.reset}`));
    } else {
      console.log(ko(`  ${lbl.padEnd(26)}${C.dim}non trouvé${C.reset}`));
    }
  }

  console.log(`\n  ${C.bold}Contraintes (présence)${C.reset}`);
  for (const key of boolKeys) {
    const v = rules[key];
    const lbl = key.replace('presence', '');
    if (v?.present) {
      console.log(warn(`  ${lbl.padEnd(26)}${C.yellow}OUI${C.reset}  ${C.dim}${(v.context || '').slice(0, 70)}${C.reset}`));
    } else {
      console.log(`  ${C.dim}  ${lbl.padEnd(26)}absent${C.reset}`);
    }
  }

  const total = numKeys.length + textKeys.length + boolKeys.length;
  const found = Object.values(rules).filter(Boolean).length;
  console.log(`\n  ${C.bold}Score extraction : ${found}/${total}${C.reset}  (numériques : ${foundNum}/${numKeys.length})`);
}

// ── Cas de test ────────────────────────────────────────────────
const TESTS = [
  {
    desc:    'Ain (01) — Gex, PLUiH Pays de Gex',
    address: '7 chemin des rosiers, gex',
  },
  {
    desc:    'Gironde (33) — Mérignac (banlieue Bordeaux)',
    address: '15 avenue Kennedy, Mérignac',
  },
  {
    desc:    'Hérault (34) — Montpellier',
    address: '20 avenue Georges Clémenceau, Montpellier',
  },
  {
    desc:    'Ille-et-Vilaine (35) — Rennes',
    address: '5 rue Saint-Malo, Rennes',
  },
];

// ── Runner ────────────────────────────────────────────────────
async function runTest({ desc, address }) {
  console.log(head(desc));
  console.log(`  ${C.dim}Adresse : ${address}${C.reset}\n`);

  // 1. Géocodage
  let geo;
  try {
    geo = await geocode(address);
    console.log(ok(`Géocodage   : ${geo.label}  [${geo.lon.toFixed(5)}, ${geo.lat.toFixed(5)}]  score=${geo.score.toFixed(2)}`));
  } catch (e) {
    console.log(ko(`Géocodage : ${e.message}`));
    return;
  }

  // 2. Zone PLU
  let zone;
  try {
    zone = await getZone(geo.lon, geo.lat);
    if (!zone) throw new Error('Aucune zone trouvée');
    console.log(ok(`Zone PLU    : ${zone.libelle || zone.typezone}  (libelong: "${zone.libelong || '—'}")`));
    console.log(`  ${C.dim}typezone=${zone.typezone}  destdomi=${zone.destdomi || '—'}${C.reset}`);
  } catch (e) {
    console.log(ko(`Zone PLU : ${e.message}`));
    return;
  }

  // 3. Document
  let doc;
  try {
    doc = await getDocument(geo.lon, geo.lat);
    if (doc) {
      console.log(ok(`Document    : ${doc.nom || '—'}  approuvé=${doc.datappro || '—'}`));
    } else {
      console.log(warn('Document    : aucun document GPU trouvé'));
    }
  } catch (e) {
    console.log(warn(`Document : ${e.message}`));
  }

  // 4. URL du règlement PDF
  const urlfic = zone?.urlfic || null;
  if (urlfic) {
    console.log(ok(`URL PDF     : ${urlfic.slice(0, 90)}${urlfic.length > 90 ? '…' : ''}`));
  } else {
    console.log(warn('URL PDF     : urlfic absent — pas de PDF règlement dans les données GPU'));
    console.log(`\n  ${C.dim}→ Impossible de tester l'extraction PDF pour cette commune.${C.reset}`);
    return;
  }

  // 5. Extraction PDF + règles
  const zoneName = zone.libelle || zone.typezone;
  console.log(`\n  Extraction PDF pour zone "${zoneName}"…`);
  const t0 = Date.now();
  try {
    const { section, rules } = await getPluZoneText(urlfic, zoneName);
    const elapsed = Date.now() - t0;

    if (!section) {
      console.log(ko(`Section "${zoneName}" introuvable dans le PDF (${elapsed}ms)`));
      return;
    }

    console.log(ok(`Section extraite : ${section.length} chars en ${elapsed}ms`));
    console.log(`  ${C.dim}Début section : "${section.slice(0, 120).replace(/\n/g, '↵')}…"${C.reset}`);

    printRules(rules);
  } catch (e) {
    console.log(ko(`Extraction échouée : ${e.message}`));
    if (process.env.DEBUG) console.error(e);
  }
}

// ── Main ──────────────────────────────────────────────────────
console.log(`${C.bold}${C.magenta}
╔══════════════════════════════════════════════════════════╗
║         TEST EXTRACTION PLU — 4 COMMUNES / 4 DEPTS      ║
╚══════════════════════════════════════════════════════════╝
${C.reset}`);

for (const test of TESTS) {
  await runTest(test);
}

console.log(`\n${C.bold}${C.cyan}─── Fin des tests ───${C.reset}\n`);
