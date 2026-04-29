import { createRequire } from 'module';
import { cacheGet, cacheSet } from '../lib/memcache.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// Cache mémoire pour le texte complet des PDFs (1 entrée par URL, TTL 24h)
const PDF_FULL_TEXT = new Map();

async function fetchPdfText(url) {
  const cached = PDF_FULL_TEXT.get(url);
  if (cached && Date.now() < cached.expires) return cached.text;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40_000);

  let resp;
  try {
    resp = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!resp.ok) throw new Error(`PDF HTTP ${resp.status}`);

  const size = resp.headers.get('content-length');
  if (size && parseInt(size) > 25 * 1024 * 1024) throw new Error('PDF > 25 MB — ignoré');

  const buf = Buffer.from(await resp.arrayBuffer());
  const data = await pdfParse(buf, { max: 0 }); // max:0 = toutes les pages
  const text = data.text;

  console.log(`[PLU-PDF] ${url.slice(-60)} — ${data.numpages} pages, ${text.length} chars`);
  PDF_FULL_TEXT.set(url, { text, expires: Date.now() + 72 * 3_600_000 }); // 3 jours
  return text;
}

// Cherche la section de la zone dans le texte du règlement
function extractZoneSection(text, zoneName) {
  const norm = text.replace(/\r\n?/g, '\n');
  const esc  = zoneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Tentatives du plus spécifique au plus large
  const patterns = [
    new RegExp(`\\n\\s*(?:TITRE\\s+[\\w\\s]+\\n)?\\s*ZONE\\s+${esc}\\b`, 'i'),
    new RegExp(`\\n\\s*${esc}\\s*[-–—:]`, 'i'),
    new RegExp(`\\n\\s*${esc}\\s*\\n`, 'i'),
    new RegExp(`\\b${esc}\\b`),
  ];

  let startIdx = -1;
  for (const rx of patterns) {
    const m = rx.exec(norm);
    if (m) { startIdx = m.index; break; }
  }

  if (startIdx === -1) return null;

  // Extrait jusqu'à la prochaine section de zone ou 25 000 chars (~6 000 tokens)
  const window = norm.slice(startIdx, startIdx + 25_000);

  // Cherche le début de la section suivante (autre code de zone)
  // Pattern : saut de ligne + code zone (lettres+chiffres, 2-8 chars) en début de ligne
  const nextSection = window.slice(500).search(
    /\n\s*(?:ZONE\s+)?[A-Z][A-Za-z0-9]{1,7}\s*(?:\n|[-–—:])/
  );

  return nextSection !== -1
    ? window.slice(0, nextSection + 500).trim()
    : window.trim();
}

/**
 * Télécharge le PDF, extrait le texte, isole la section de la zone.
 * Résultat mis en cache 24h (PDF) + 6h (section extraite).
 * @returns {string|null} texte de la section ou null si introuvable
 */
export async function getPluZoneText(urlfic, zoneName) {
  const cacheKey = `plu_section_${zoneName}_${Buffer.from(urlfic).toString('base64').slice(-24)}`;
  const hit = cacheGet(cacheKey);
  if (hit) return hit;

  const fullText = await fetchPdfText(urlfic);
  const section  = extractZoneSection(fullText, zoneName);

  if (section) {
    console.log(`[PLU-PDF] Section "${zoneName}" extraite : ${section.length} chars`);
    cacheSet(cacheKey, section, 72 * 3_600_000); // 3 jours
  } else {
    console.warn(`[PLU-PDF] Section "${zoneName}" introuvable dans le document`);
  }

  return section;
}
