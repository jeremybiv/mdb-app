// scripts/fetch-plu-communes.ts
const PLU_SOURCES = require("./plu_data.json");

async function enrichWithCommunes() {
  for (const entry of PLU_SOURCES) {
    const res = await fetch(
      `https://geo.api.gouv.fr/epcis/${entry.epci_code}/communes?fields=nom,code`,
    );
    entry.communes = await res.json();
  }
  return PLU_SOURCES;
}
