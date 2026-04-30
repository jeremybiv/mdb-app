/**
 * Inspecte la structure du PLU Pays de Gex autour de l'offset 182707
 * pour comprendre comment extraire la section parente "UGp"
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const URL = 'https://www.paysdegexagglo.fr/cms_viewFile.php?idtf=58894&path=15-PLUiH-PAYS-DE-GEX-REGLEMENT.pdf';
const SUB_OFFSET = 182707;

console.log('Téléchargement…');
const resp = await fetch(URL);
const buf  = Buffer.from(await resp.arrayBuffer());
const data = await pdfParse(buf, { max: 0 });
const text = data.text.replace(/\r\n?/g, '\n');

// Chercher "ZONE UGp" avant l'offset 182707
const searchFrom = Math.max(0, SUB_OFFSET - 80_000);
const before = text.slice(searchFrom, SUB_OFFSET);

// Trouver toutes les occurrences de "UGp" (sans chiffre suivant) avant le sous-secteur
const rx = /\n[^\n]{0,10}UGp[^0-9\n][^\n]*/gi;
let m;
const hits = [];
while ((m = rx.exec(before)) !== null) {
  hits.push({ offset: searchFrom + m.index, ctx: m[0].slice(0, 100).replace(/\n/g, '↵') });
}
console.log(`\n=== Occurrences "UGp" (sans chiffre) dans les 80k chars avant offset ${SUB_OFFSET} ===`);
hits.slice(-20).forEach(h => console.log(`  [${h.offset}] ${h.ctx}`));

// Dernière occurrence = probable entête de la zone UGp
if (hits.length > 0) {
  const lastHit = hits[hits.length - 1];
  console.log(`\n=== Contexte 2000 chars à partir de la dernière occurrence (offset ${lastHit.offset}) ===`);
  console.log(text.slice(lastHit.offset, lastHit.offset + 2000).replace(/\n/g, '\n'));
}

// Aussi afficher les 500 chars autour de l'offset 182707
console.log(`\n=== 500 chars autour du sous-secteur UGp1 (offset ${SUB_OFFSET}) ===`);
console.log(text.slice(SUB_OFFSET - 100, SUB_OFFSET + 600).replace(/\n/g, '\n'));
