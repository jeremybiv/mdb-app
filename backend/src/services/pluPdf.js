import { createRequire } from 'module';
import { cacheGet, cacheSet } from '../lib/memcache.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const PDF_FULL_TEXT = new Map();

async function fetchPdfText(url) {
  const cached = PDF_FULL_TEXT.get(url);
  if (cached && Date.now() < cached.expires) {
    console.log(`[PLU-PDF] Cache hit texte complet (${cached.text.length} chars) — ${url.slice(-70)}`);
    return cached.text;
  }

  console.log(`[PLU-PDF] Téléchargement PDF → ${url}`);
  const t0 = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40_000);

  let resp;
  try {
    resp = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  console.log(`[PLU-PDF] HTTP ${resp.status} en ${Date.now() - t0}ms`);
  if (!resp.ok) throw new Error(`PDF HTTP ${resp.status} — ${url}`);

  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  const size = resp.headers.get('content-length');
  console.log(`[PLU-PDF] Content-Type: ${contentType} | Content-Length: ${size ? Math.round(parseInt(size)/1024) + ' KB' : 'inconnu'}`);

  // Reject ZIPs immediately (many PLU portals distribute ZIPs of multiple PDFs)
  if (contentType.includes('zip') || contentType.includes('x-zip') || url.toLowerCase().endsWith('.zip')) {
    throw new Error(`Document ZIP non supporté — le portail distribue une archive multi-PDF. Lien direct vers le PDF règlement manquant.`);
  }

  if (size && parseInt(size) > 25 * 1024 * 1024) throw new Error(`PDF trop volumineux (${Math.round(parseInt(size)/1024/1024)} MB > 25 MB)`);

  const t1 = Date.now();
  const buf = Buffer.from(await resp.arrayBuffer());
  console.log(`[PLU-PDF] Buffer reçu : ${Math.round(buf.length / 1024)} KB en ${Date.now() - t1}ms`);

  const t2 = Date.now();
  console.log(`[PLU-PDF] Parsing PDF avec pdf-parse…`);
  const data = await pdfParse(buf, { max: 0 });
  const text = data.text;
  console.log(`[PLU-PDF] Parsing OK en ${Date.now() - t2}ms — ${data.numpages} pages, ${text.length} chars`);

  // Aperçu des 300 premiers chars pour vérifier la qualité du texte extrait
  const preview = text.slice(0, 300).replace(/\n/g, '↵');
  console.log(`[PLU-PDF] Aperçu texte : "${preview}"`);

  PDF_FULL_TEXT.set(url, { text, expires: Date.now() + 72 * 3_600_000 });
  return text;
}

// ── Extraction multi-paragraphes ──────────────────────────────
//
// Les PLU peuvent être structurés de deux façons :
//   A) Zone-par-bloc : "ZONE UA { Article 1… Article 13 }" — une section contiguë
//   B) Article-par-sujet : chaque article couvre toutes les zones avec des sous-sections
//      "Article N — Emprise au sol / Secteur UGp : 25% / Sous-secteur UGp1 : 18%"
//
// Cette fonction collecte TOUS les paragraphes où le zoneName (et son code parent)
// apparaissent, qu'ils soient contiguës ou éparpillés dans le document.

function extractZoneSection(text, zoneName) {
  const norm = text.replace(/\r\n?/g, '\n');

  // Dériver le code parent en supprimant le suffixe numérique/alphanumérique final
  // UGp1 → UGp  |  UB1h → UB  |  AU2 → AU  |  UA → UA (inchangé)
  const parentZone = zoneName.replace(/\d+[a-z]*$/i, '') || null;
  const hasParent  = parentZone && parentZone !== zoneName && parentZone.length >= 2;

  // Construire les patterns de recherche pour un nom de zone donné
  function patternsFor(name) {
    const e = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [
      // "Secteur UGp :", "Sous-secteur UGp1 :", "Article UGp.8"
      new RegExp(`\\n[^\\n]{0,30}(?:Sous-secteurs?|Secteurs?|Article|ARTICLE)\\s+${e}\\b`, 'ig'),
      // "ZONE UGp" en début de section
      new RegExp(`\\n\\s*ZONE\\s+${e}\\b`, 'ig'),
      // "UGp1 :" seul en début de ligne
      new RegExp(`\\n\\s*${e}\\s*[-–—:]`, 'ig'),
      // "UGp1" seul sur sa ligne
      new RegExp(`\\n\\s*${e}\\s*\\n`, 'ig'),
    ];
  }

  // Extraire un paragraphe à partir d'un offset.
  // maxChars : 1 800 pour les paragraphes zone, 3 000 pour les articles thématiques.
  function extractParagraph(offset, maxChars = 1_800) {
    const slice = norm.slice(offset, offset + maxChars);
    const cutAt = slice.slice(40).search(
      /\n\s*(?:Secteurs?\s+[A-Z]|Sous-secteurs?\s+[A-Z]|Article\s+[A-Za-z\d]|ARTICLE\s+[A-Za-z\d]|Zone\s+[A-Z]|ZONE\s+[A-Z]|\d+\/\s+[A-Z])/i
    );
    return (cutAt !== -1 ? slice.slice(0, cutAt + 40) : slice).trim();
  }

  // Heuristique anti-TOC : une entrée TOC a une ligne avec seulement un numéro de page
  function isNotToc(offset) {
    return !norm.slice(offset, offset + 400).split('\n').some(l => /^\s*\d{1,3}\s*$/.test(l));
  }

  // Collecter tous les paragraphes pertinents (zone spécifique + zone parente)
  const collected = new Map(); // offset → paragraph text

  for (const name of [zoneName, ...(hasParent ? [parentZone] : [])]) {
    let foundForThisName = false;
    for (const rx of patternsFor(name)) {
      const offsets = [];
      let m;
      while ((m = rx.exec(norm)) !== null) offsets.push(m.index);
      if (offsets.length === 0) continue;

      const good = offsets.filter(isNotToc);
      const toUse = (good.length > 0 ? good : offsets).slice(0, 8); // max 8 par pattern

      for (const offset of toUse) {
        // Dédupliquer : ignorer si un paragraphe très proche existe déjà
        if ([...collected.keys()].some(k => Math.abs(k - offset) < 60)) continue;
        const para = extractParagraph(offset);
        if (para.length > 40) {
          collected.set(offset, para);
          foundForThisName = true;
        }
      }

      if (foundForThisName) break; // Premier pattern productif pour ce nom → passer au suivant
    }
  }

  // ── Passe 2 : articles thématiques universels ──────────────────────────────
  // Dans certains PLU, des articles (desserte, stationnement, etc.) s'appliquent
  // à toutes les zones sans répéter le code de zone dans chaque paragraphe.
  // La passe 1 ne les collecte pas → on les recherche par titre d'article.
  const THEMATIC_RX_LIST = [
    // Bloc 2 — voirie & accès
    /\n[^\n]{0,60}(?:VOIRIE\s+ET\s+ACC[EÈ]S|DESSERTE\s+(?:PAR\s+LES?\s+)?VOIES?|ACC[EÈ]S\s+ET\s+VOIRIE|CONDITIONS?\s+(?:DE\s+)?DESSERTE)[^\n]{0,60}/gi,
    // Bloc 2 — réseaux
    /\n[^\n]{0,60}(?:DESSERTE\s+(?:PAR\s+LES?\s+)?R[EÉ]SEAUX?|ALIMENTATION\s+EN\s+EAU|ASSAINISSEMENT\s+(?:ET|DES?|COLLECTIF|NON))[^\n]{0,60}/gi,
    // Bloc 4 — aspect extérieur
    /\n[^\n]{0,60}(?:ASPECT\s+EXT[EÉ]RIEUR|ASPECT\s+DES\s+CONSTRUCTIONS?)[^\n]{0,60}/gi,
    // Bloc 5 — stationnement
    /\n[^\n]{0,60}(?:STATIONNEMENT|AIRES?\s+DE\s+STATIONNEMENT|R[EÈ]GLES?\s+DE\s+STATIONNEMENT)[^\n]{0,60}/gi,
    // Bloc 7 — énergie / environnement
    /\n[^\n]{0,60}(?:PERFORMANCE\s+[EÉ]NERG[EÉ]TIQUE|[EÉ]NERGIES?\s+RENOUVELABLES?|QUALIT[EÉ]\s+(?:ENVIRONNEMENTALE|[EÉ]NERG[EÉ]TIQUE))[^\n]{0,60}/gi,
    // Bloc 8 — divisions parcellaires
    /\n[^\n]{0,60}(?:DIVISIONS?\s+PARCELLAIRES?|TAILLE\s+DES?\s+(?:LOTS?|TERRAINS?)|SUPERFICIE\s+MINIMALE)[^\n]{0,60}/gi,
  ];
  // Si un paragraphe zone est déjà dans ce rayon, l'article thématique est déjà couvert
  const THEMATIC_DEDUP_RADIUS = 2_000;

  for (const rx of THEMATIC_RX_LIST) {
    let m;
    let addedForThisRx = 0;
    while ((m = rx.exec(norm)) !== null && addedForThisRx < 3) {
      const offset = m.index;
      if ([...collected.keys()].some(k => Math.abs(k - offset) < THEMATIC_DEDUP_RADIUS)) continue;
      if (!isNotToc(offset)) continue;
      const para = extractParagraph(offset, 3_000);
      if (para.length > 80) {
        collected.set(offset, para);
        addedForThisRx++;
      }
    }
  }

  if (collected.size === 0) {
    const esc = zoneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const raws = [];
    let m2;
    const simpleRx = new RegExp(esc, 'gi');
    while ((m2 = simpleRx.exec(norm)) !== null && raws.length < 10) {
      raws.push(`  offset=${m2.index} → "${norm.slice(Math.max(0, m2.index - 30), m2.index + 60).replace(/\n/g, '↵')}"`);
    }
    if (raws.length) {
      console.warn(`[PLU-PDF] "${zoneName}" : aucun paragraphe réglementaire mais présent ${raws.length}× :`);
      raws.forEach(r => console.warn(r));
    } else {
      console.warn(`[PLU-PDF] "${zoneName}" absent du texte — PDF scan image ?`);
    }
    return null;
  }

  // Trier par offset (ordre du document) et assembler
  const sorted   = [...collected.entries()].sort((a, b) => a[0] - b[0]);
  const combined = sorted.map(([, para]) => para).join('\n\n' + '─'.repeat(50) + '\n\n');
  const limited  = combined.slice(0, 30_000);

  console.log(`[PLU-PDF] Section "${zoneName}" : ${sorted.length} paragraphes (${combined.length} chars)${combined.length > 30_000 ? ' → tronqué à 30k' : ''}`);
  console.log(`[PLU-PDF] 1er paragraphe : "${sorted[0][1].slice(0, 150).replace(/\n/g, '↵')}"`);

  return limited;
}

// ── Extraction déterministe — règles numériques ────────────
//
// IMPORTANT — ordre des groupes dans une phrase PLU française :
//   "recul de 5 m par rapport à l'alignement des voies"
//   → le NOMBRE vient AVANT la référence (voirie, limites…)
// Les patterns capturent donc le nombre en premier, puis vérifient
// le contexte (voirie / limites) dans le reste de la phrase.

const NUMERIC_PATTERNS = {

  // BLOC 3 — emprise au sol (CES)
  empriseSol: [
    /emprise\s+au\s+sol[^%\n]{0,120}?(\d+(?:[,.]\d+)?)\s*%/i,
    /CES\b[^%\n]{0,80}?(\d+(?:[,.]\d+)?)\s*%/i,
    /(\d+(?:[,.]\d+)?)\s*%[^.\n]{0,80}?(?:de\s+la\s+superficie|de\s+l[''\s]unité\s+foncière|du\s+terrain)/i,
    /ne\s+(?:peut|doit)\s+(?:pas\s+)?excéder\s+(\d+(?:[,.]\d+)?)\s*%/i,
  ],

  // BLOC 3 — hauteur maximale (au faîtage ou faîte)
  hauteurMax: [
    /hauteur\b[^.\n]{0,30}?(?:maximale?|max(?:imum)?)\b[^.\n]{0,80}?(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?(?!\d)/i,
    /hauteur\b[^.\n]{0,80}?(?:ne\s+(?:peut|doit|devra)\s+(?:pas\s+)?(?:excéder|dépasser))\b[^.\n]{0,40}?(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?(?!\d)/i,
    /hauteur\b[^.\n]{0,80}?(?:est\s+)?(?:limitée?|fixée?|plafonnée?)\s+à\s+(\d+(?:[,.]\d+)?)\s*m/i,
    /(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?\s+(?:au\s+faît(?:age|e)|à\s+l['']acrotère)/i,
  ],

  // BLOC 3 — hauteur à l'égout des toitures
  hauteurEgout: [
    /hauteur\b[^.\n]{0,80}?(?:à\s+l['']égout|égout\s+(?:des?\s+)?toitures?)\b[^.\n]{0,60}?(\d+(?:[,.]\d+)?)\s*m(?!\d)/i,
    /(?:à\s+l['']égout|égout\s+(?:des?\s+)?toitures?)\b[^.\n]{0,60}?(\d+(?:[,.]\d+)?)\s*m(?!\d)/i,
    /(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?\s+à\s+l['']égout/i,
  ],

  // BLOC 3 — recul par rapport aux voies / domaine public
  // Phrases types :
  //   "recul de X m par rapport à l'alignement des voies"
  //   "retrait minimum de X m par rapport à la voie"
  //   "implantées à X m de l'alignement"
  reculVoirie: [
    // Exclure "voie ferrée", "voie verte", "voie cyclable" → (?!\s+ferrée|\s+verte|\s+cyclable)
    /(?:recul|retrait)\b[^.\n]{0,50}?(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?[^.\n]{0,100}?(?:voirie\b|voie[s]?(?!\s+ferrée[s]?|\s+verte[s]?|\s+cyclable[s]?)\b|route[s]?\b|rue[s]?\b|alignement\b|domaine\s+public\b)/i,
    /implantées?[^.\n]{0,50}?(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?[^.\n]{0,60}?(?:alignement|voirie|voie[s]?(?!\s+ferrée))/i,
    /(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?\s+(?:de\s+l['']alignement|par\s+rapport\s+(?:à|aux?)\s+(?:l['']alignement|la\s+voirie|les?\s+voies?(?!\s+ferrées?)|la\s+voie(?!\s+ferrée)))/i,
    // "X m de l'axe de la voie" (mais pas "voie ferrée")
    /(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?\s+de\s+l['']axe\s+(?:de\s+la\s+)?voie(?!\s+ferrée)/i,
  ],

  // BLOC 3 — recul par rapport aux limites séparatives
  // Phrases types :
  //   "recul de X m par rapport aux limites séparatives"
  //   "retrait minimum de X m sur une limite" (PLU Pays de Gex)
  //   "à X m des limites séparatives"
  reculLimites: [
    /recul\b[^.\n]{0,50}?(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?[^.\n]{0,80}?limites?\s+séparatives?/i,
    // "retrait [minimum] de X m sur une limite / des limites séparatives"
    /retrait\b[^.\n]{0,40}?(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?[^.\n]{0,60}?(?:limite[s]?(?:\s+séparatives?)?|séparatives?)/i,
    /(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?[^.\n]{0,40}?des?\s+limites?\s+séparatives?/i,
    /limites?\s+séparatives?\b[^.\n]{0,80}?(\d+(?:[,.]\d+)?)\s*m(?!\d)/i,
    /limites?\s+(?:de\s+propriété|parcellaires?)\b[^.\n]{0,80}?(\d+(?:[,.]\d+)?)\s*m(?!\d)/i,
  ],

  // BLOC 3 — distance minimale entre constructions
  // Pays de Gex : "distance minimale, égale à la hauteur à l'égout du toit du bâtiment le plus haut"
  distanceConstruction: [
    /distance\b[^.\n]{0,80}?(?:entre\s+(?:deux\s+)?constructions?|entre\s+bâtiments?)\b[^.\n]{0,60}?(\d+(?:[,.]\d+)?)\s*m(?!\d)/i,
    /constructions?\b[^.\n]{0,80}?séparées?\s+(?:de\s+)?(\d+(?:[,.]\d+)?)\s*m(?!\d)/i,
    /(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?\s+entre\s+(?:deux\s+)?(?:constructions?|bâtiments?)/i,
  ],

  // BLOC 2 — largeur minimale de voie d'accès / desserte
  // "voie d'accès d'une largeur minimale de X m", "gabarit de X m"
  largeurVoie: [
    /(?:voie|accès|chemin\s+d['']accès|desserte)\b[^.\n]{0,80}?(?:largeur\s+(?:minimale?|minimum)|gabarit)\b[^.\n]{0,60}?(\d+(?:[,.]\d+)?)\s*m(?!\d)/i,
    /(?:largeur|gabarit)\b[^.\n]{0,40}?(?:voie|voirie|accès|desserte)\b[^.\n]{0,60}?(\d+(?:[,.]\d+)?)\s*m(?!\d)/i,
    /(\d+(?:[,.]\d+)?)\s*m(?:ètres?)?\s+(?:de\s+largeur|de\s+gabarit)[^.\n]{0,60}?(?:voie|accès|desserte)/i,
  ],

  // BLOC 3 — surface de plancher maximale
  surfacePlancher: [
    /surface\s+(?:totale\s+)?de\s+plancher\b[^.\n]{0,100}?(?:maximale?|max)?\b[^.\n]{0,60}?(\d[\d\s]{0,7})\s*m²/i,
    /(?:SHON|SHOB|SDP)\b[^.\n]{0,80}?(?:maximale?|max)?\b[^.\n]{0,60}?(\d[\d\s]{0,7})\s*m²/i,
    /(?:ne\s+(?:peut|doit)\s+(?:pas\s+)?(?:excéder|dépasser))\s+(\d[\d\s]{0,7})\s*m²[^.\n]{0,60}?plancher/i,
  ],

  // BLOC 8 — surface minimale de lot / unité foncière
  surfaceMinLot: [
    /surface\s+(?:minimale?|min(?:imum)?)\b[^.\n]{0,80}?(\d[\d\s]{1,7})\s*m²/i,
    /superficie\s+(?:minimale?|min(?:imum)?)\b[^.\n]{0,80}?(\d[\d\s]{1,7})\s*m²/i,
    /(?:inférieure\s+à|moins\s+de)\s+(\d[\d\s]{1,7})\s*m²[^.\n]{0,60}?(?:surface|superficie|terrain|lot)/i,
    /(?:tout\s+terrain|toute\s+unité\s+foncière)\b[^.\n]{0,80}?(\d[\d\s]{1,7})\s*m²/i,
  ],

  // BLOC 8 — largeur minimale de façade sur rue / front bâti
  largeurFacade: [
    /largeur\s+(?:minimale?|min(?:imum)?)\b[^.\n]{0,80}?(?:façade|front)[^.\n]{0,60}?(\d+(?:[,.]\d+)?)\s*m(?!\d)/i,
    /façade[^.\n]{0,80}?(?:minimum|au\s+moins|minimale?)\s+(?:de\s+)?(\d+(?:[,.]\d+)?)\s*m(?!\d)/i,
    /front\s+(?:bâti|sur\s+(?:rue|voie|voirie))\b[^.\n]{0,60}?(\d+(?:[,.]\d+)?)\s*m(?!\d)/i,
  ],

  // BLOC 5 — stationnement : places par logement
  statLogement: [
    // "X places [de stationnement] [au minimum] par logement"
    /(\d+(?:[,.]\d+)?)\s+place[s]?\s+(?:de\s+stationnement\s+)?(?:au\s+minimum\s+|minimum\s+)?par\s+(?:logement|unité\s+de\s+logement)/i,
    // "par logement ... X places"
    /par\s+logement\b[^.\n]{0,80}?(\d+(?:[,.]\d+)?)\s+place[s]?/i,
    // "il est exigé / imposé / requis X places ... logement"
    /(?:il\s+est\s+)?(?:exigé|imposé|requis|demandé)\s+(?:au\s+minimum\s+)?(\d+(?:[,.]\d+)?)\s+place[s]?[^.\n]{0,80}?logement/i,
    // "logements : X places" ou "habitation : X places"
    /(?:logements?|habitations?)\s*[:-]\s*(\d+(?:[,.]\d+)?)\s+place[s]?/i,
    // "pour tout / chaque logement [,:]  X places"
    /pour\s+(?:tout\s+|chaque\s+)?logement[^.\n]{0,60}?[,:]?\s*(\d+(?:[,.]\d+)?)\s+place[s]?/i,
    // "habitation individuelle / collective : X places"
    /(?:habitation|logement)\s+(?:individuelle?|collective?|locatif)\b[^.\n]{0,60}?:\s*(\d+(?:[,.]\d+)?)\s+place[s]?/i,
  ],

  // BLOC 5 — stationnement : ratio bureaux/commerces (places/m²)
  statBureau: [
    // "X place(s) pour Y m² de bureau/commerce" — ne capture que le nb de places
    /(\d+(?:[,.]\d+)?)\s+place[s]?[^.\n]{0,60}?pour\s+\d+\s*m²[^.\n]{0,60}?(?:bureau|commerce|activité|surface)/i,
    /(\d+(?:[,.]\d+)?)\s+place[s]?[^.\n]{0,60}?par\s+tranche\s+de\s+\d+\s*m²/i,
    /(?:bureau|commerce|activité|surface\s+de\s+(?:vente|plancher))\b[^.\n]{0,80}?(\d+(?:[,.]\d+)?)\s+place[s]?\s+(?:par|pour)/i,
  ],

  // BLOC 5 — stationnement vélos / deux-roues
  statVelo: [
    /(\d+(?:[,.]\d+)?)\s+(?:places?\s+)?(?:de\s+stationnement\s+)?(?:pour\s+(?:les\s+)?)?(?:vélos?|cycles?|deux-roues?\s+non\s+motorisés?)\b/i,
    /(?:vélos?|cycles?|deux-roues?)\b[^.\n]{0,60}?(\d+(?:[,.]\d+)?)\s+(?:places?|emplacements?)/i,
    /abri[s]?\s+(?:à\s+)?vélos?\b[^.\n]{0,60}?(\d+(?:[,.]\d+)?)\s+(?:places?|emplacements?)/i,
  ],

  // BLOC 6 — espaces verts / surfaces végétalisées (%)
  espaceVert: [
    /(\d+(?:[,.]\d+)?)\s*%[^.\n]{0,80}?(?:végétalis|espaces?\s+verts?|non\s+imperméabilisé|planté[s]?)/i,
    /(?:espaces?\s+(?:verts?|végétalisés?|libres?)|surfaces?\s+(?:végétalisées?|perméables?|en\s+pleine\s+terre))\b[^.\n]{0,80}?(\d+(?:[,.]\d+)?)\s*%/i,
    /pleine\s+terre\b[^.\n]{0,60}?(\d+(?:[,.]\d+)?)\s*%/i,
  ],

  // BLOC 6 — coefficient de biotope
  coeffBiotope: [
    /coefficient\s+(?:de\s+)?biotope\b[^.\n]{0,60}?(?:égal\s+à\s+|de\s+|minimum\s+|:\s*)?(\d+(?:[,.]\d+)?)/i,
    /CBS\b[^.\n]{0,60}?(?:de\s+|à\s+|:\s*)?(\d+(?:[,.]\d+)?)/i,
  ],
};

// ── Extraction de paragraphes textuels (Bloc 1 — destinations) ──
// Extrait le premier paragraphe correspondant, limité à 1 500 chars.
const TEXT_PATTERNS = {
  destinationsAutorisees: [
    /(?:SONT\s+AUTORISÉES?S?\s*:?|OCCUPATIONS?\s+ET\s+UTILISATIONS?\s+DU\s+SOL\s+AUTORISÉES?S?\s*:?|UTILISATIONS?\s+DU\s+SOL\s+AUTORISÉES?S?\s*:?)\s*\n([\s\S]{20,1500}?)(?=\n\s*(?:SONT\s+INTERDIT|OCCUPATION|ARTICLE\s+[A-Z\d]|DESSERTE|IMPLANTATION|$))/im,
    /sont\s+autorisées?\s*[,:]\s*([\s\S]{20,1000}?)(?=\n\s*(?:sont\s+interdites?|article\s+[a-z]|\n\n\n))/im,
  ],
  destinationsInterdites: [
    /(?:SONT\s+INTERDITES?S?\s*:?|OCCUPATIONS?\s+ET\s+UTILISATIONS?\s+DU\s+SOL\s+INTERDITES?S?\s*:?)\s*\n([\s\S]{20,1500}?)(?=\n\s*(?:SONT\s+AUTORISÉES?|ARTICLE\s+[A-Z\d]|DESSERTE|IMPLANTATION|$))/im,
    /sont\s+interdites?\s*[,:]\s*([\s\S]{20,1000}?)(?=\n\s*(?:sont\s+autorisées?|article\s+[a-z]|\n\n\n))/im,
  ],
};

// ── Présence de contraintes réglementaires spéciales (Bloc 9) ──
const PRESENCE_PATTERNS = {
  presenceABF:  /(?:périmètre|abords?)\s+(?:d[eu]s?\s+)?(?:monuments?\s+historiques?|ABF)\b|architecte\s+des\s+bâtiments\s+de\s+France/i,
  presencePPRI: /plan\s+de\s+prévention\s+des\s+risques?[^.\n]{0,60}?(?:naturels?|(?:d[e']\s*)?inondation)|PPRi?\b|zone\s+(?:d[e']\s*)?inondable/i,
  presenceOAP:  /orientation[s]?\s+d[''e]\s*aménagement\s+et\s+de\s+programmation|OAP\b/i,
  // Bloc 7 — performance énergétique (RE2020, BBC, etc.)
  presenceRE2020: /\bRE\s*2020\b|\br[eé]glementation\s+(?:thermique\b|[eé]nerg[eé]tique\b)|bâtiment\s+(?:basse\s+consommation\b|BBC\b)|label\s+BBC\b|\bRT\s*201[25]\b/i,
};

export function extractRulesFromText(text) {
  const results = {};

  // ── Valeurs numériques ──────────────────────────────────────
  for (const [key, patterns] of Object.entries(NUMERIC_PATTERNS)) {
    let found = null;
    for (const rx of patterns) {
      const m = rx.exec(text);
      if (!m) continue;
      const rawVal = m[1].replace(/\s+/g, '').replace(',', '.');
      const value  = parseFloat(rawVal);
      if (isNaN(value)) continue;
      const ctxStart = Math.max(0, m.index - 10);
      const ctxEnd   = Math.min(text.length, m.index + m[0].length + 50);
      const ctx = text.slice(ctxStart, ctxEnd).replace(/\n/g, ' ').trim();
      found = { value, context: ctx };
      break;
    }
    results[key] = found;
  }

  // ── Paragraphes textuels (destinations) ────────────────────
  for (const [key, patterns] of Object.entries(TEXT_PATTERNS)) {
    let found = null;
    for (const rx of patterns) {
      const m = rx.exec(text);
      if (!m) continue;
      const excerpt = m[1].replace(/\n{3,}/g, '\n\n').trim().slice(0, 1200);
      if (excerpt.length < 20) continue;
      found = { text: excerpt };
      break;
    }
    results[key] = found;
  }

  // ── Présence de contraintes ─────────────────────────────────
  for (const [key, rx] of Object.entries(PRESENCE_PATTERNS)) {
    const m = rx.exec(text);
    if (m) {
      const ctxStart = Math.max(0, m.index - 10);
      const ctx = text.slice(ctxStart, ctxStart + 120).replace(/\n/g, ' ').trim();
      results[key] = { present: true, context: ctx };
    } else {
      results[key] = null;
    }
  }

  const numFound  = Object.keys(NUMERIC_PATTERNS).filter(k => results[k]).length;
  const textFound = Object.keys(TEXT_PATTERNS).filter(k => results[k]).length;
  const boolFound = Object.keys(PRESENCE_PATTERNS).filter(k => results[k]).length;
  const total     = Object.keys(NUMERIC_PATTERNS).length + Object.keys(TEXT_PATTERNS).length + Object.keys(PRESENCE_PATTERNS).length;

  console.log(`[PLU-PDF] extractRules : ${numFound + textFound + boolFound}/${total} extractions — numériques: [${Object.entries(NUMERIC_PATTERNS).map(([k]) => results[k] ? `${k}=${results[k].value}` : null).filter(Boolean).join(', ')}]`);
  return results;
}

export async function getPluZoneText(urlfic, zoneName) {
  // v5 : passe thématique (desserte, stationnement, etc.) + nouveaux patterns
  const cacheKey = `plu_section_v5_${zoneName}_${Buffer.from(urlfic).toString('base64').slice(-24)}`;
  const hit = cacheGet(cacheKey);
  if (hit) {
    console.log(`[PLU-PDF] Cache hit section "${zoneName}" (${hit.section?.length ?? 0} chars, ${Object.values(hit.rules).filter(Boolean).length} règles)`);
    return hit;
  }

  console.log(`[PLU-PDF] ── Début extraction zone "${zoneName}" ──`);
  console.log(`[PLU-PDF] URL : ${urlfic}`);

  const fullText = await fetchPdfText(urlfic);
  console.log(`[PLU-PDF] Texte complet : ${fullText.length} chars — recherche section "${zoneName}"…`);

  const section = extractZoneSection(fullText, zoneName);
  const rules   = section ? extractRulesFromText(section) : {};

  const result = { section: section ?? null, rules };

  if (section) {
    cacheSet(cacheKey, result, 72 * 3_600_000);
    console.log(`[PLU-PDF] ✓ Section "${zoneName}" mise en cache`);
  } else {
    console.warn(`[PLU-PDF] ✗ Section "${zoneName}" introuvable — Claude travaillera sans document`);
  }

  return result;
}
