// All IGN/data.gouv.fr APIs are called directly from the browser — no proxy needed (CORS open)

export async function geocodeAddress(address, citycode) {
  const params = new URLSearchParams({ q: address, limit: 1 });
  if (citycode) params.set('citycode', citycode);
  const r = await fetch(`https://api-adresse.data.gouv.fr/search/?${params}`);
  if (!r.ok) throw new Error(`Geocode HTTP ${r.status}`);
  const d = await r.json();
  if (!d.features?.length) throw new Error('Adresse introuvable dans la BAN');
  const f = d.features[0];
  return {
    lon:      f.geometry.coordinates[0],
    lat:      f.geometry.coordinates[1],
    score:    f.properties.score,
    label:    f.properties.label,
    citycode: f.properties.citycode,
    postcode: f.properties.postcode,
  };
}

export async function getZonePLU(lon, lat) {
  const geom = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));
  const r = await fetch(`https://apicarto.ign.fr/api/gpu/zone-urba?geom=${geom}`);
  if (!r.ok) throw new Error(`Zone PLU HTTP ${r.status}`);
  const d = await r.json();
  if (!d.features?.length) throw new Error('Aucune zone PLU trouvée');
  return d.features[0].properties;
}

export async function getDocumentUrbanisme(lon, lat) {
  const geom = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));
  const r = await fetch(`https://apicarto.ign.fr/api/gpu/document?geom=${geom}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.features?.[0]?.properties || null;
}

export async function getParcelle(lon, lat) {
  const geom = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));
  const r = await fetch(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${geom}`);
  if (!r.ok) return null;
  const d = await r.json();
  if (!d.features?.length) return null;
  const p = d.features[0].properties;
  return {
    id:      p.id_parcelle,
    section: p.section,
    numero:  p.numero,
    commune: p.commune,
    prefixe: p.prefixe,
  };
}
