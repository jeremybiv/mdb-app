export const ZONES = {
  UA:    { cat: 'U',  color: 'blue',  label: 'Centre ancien', desc: 'Morphologie dense, matériaux traditionnels. Implantation à l\'alignement.', constructible: true },
  UCa:   { cat: 'U',  color: 'blue',  label: 'Centre ancien élargi', desc: 'Tissu mixte dense, extension des centres anciens.', constructible: true },
  UCb:   { cat: 'U',  color: 'blue',  label: 'Centre bourg', desc: 'Communes rurales. Morphologie identitaire à préserver.', constructible: true },
  UC1:   { cat: 'U',  color: 'blue',  label: 'Centralité dense', desc: 'Densité élevée, mixité fonctionnelle. R+2 à R+3.', constructible: true },
  UG:    { cat: 'U',  color: 'blue',  label: 'Résidentiel périurbain', desc: 'Habitat individuel. Emprise ≤ 25–30%, hauteur R+1+combles.', constructible: true },
  UGp1:  { cat: 'U',  color: 'blue',  label: 'Résidentiel protégé niv.1', desc: 'Caractère paysager marqué. Emprise ≤ 20%, intégration renforcée.', constructible: true },
  UGp2:  { cat: 'U',  color: 'blue',  label: 'Résidentiel protégé niv.2', desc: 'Hameaux diffus. Emprise ≤ 15%. Constructibilité très contrainte.', constructible: true, warning: true },
  '1AUG':{ cat: 'AU', color: 'amber', label: 'À urbaniser résidentiel', desc: 'Urbanisation conditionnée à l\'OAP et aux équipements.', constructible: true },
  '1AUC':{ cat: 'AU', color: 'amber', label: 'À urbaniser centralité', desc: 'Futurs secteurs de centralité mixte.', constructible: true },
  '1AUA':{ cat: 'AU', color: 'amber', label: 'À urbaniser activités', desc: 'Futures zones d\'activités économiques.', constructible: true },
  '2AU': { cat: 'AU', color: 'amber', label: 'À urbaniser différé', desc: 'Réserve foncière. Inconstructible en l\'état.', constructible: false },
  A:     { cat: 'A',  color: 'green', label: 'Agricole', desc: 'Seules constructions agricoles autorisées. Résidentiel interdit.', constructible: false },
  Ap:    { cat: 'A',  color: 'green', label: 'Agricole protégée', desc: 'Inconstructible. Entretien bâtiments existants uniquement.', constructible: false },
  N:     { cat: 'N',  color: 'green', label: 'Naturelle', desc: 'Inconstructible. Équipements d\'intérêt collectif légers seulement.', constructible: false },
  Np:    { cat: 'N',  color: 'green', label: 'Naturelle protégée', desc: 'Strictement inconstructible. Corridors écologiques / ZNIEFF.', constructible: false },
  Nl:    { cat: 'N',  color: 'green', label: 'Naturelle loisirs', desc: 'Activités sportives et touristiques sous conditions.', constructible: false },
};

export function matchZone(libelle) {
  if (!libelle) return null;
  const l = libelle.trim();
  if (ZONES[l]) return { key: l, ...ZONES[l] };
  // Prefix match, longest first
  const sorted = Object.keys(ZONES).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    if (l.toUpperCase().startsWith(k.toUpperCase())) return { key: k, ...ZONES[k] };
  }
  return null;
}

export const TRADES = [
  { key: 'plomberie',    label: 'Plomberie / Sanitaire',    icon: '🔧' },
  { key: 'chauffage',    label: 'Chauffage / PAC',          icon: '🔥' },
  { key: 'electricite',  label: 'Électricité',              icon: '⚡' },
  { key: 'maconnerie',   label: 'Maçonnerie / Gros œuvre',  icon: '🧱' },
  { key: 'charpente',    label: 'Charpente',                icon: '🏗️' },
  { key: 'couverture',   label: 'Couverture / Toiture',     icon: '🏠' },
  { key: 'menuiserie',   label: 'Menuiserie',               icon: '🚪' },
  { key: 'peinture',     label: 'Peinture / Revêtements',   icon: '🎨' },
  { key: 'isolation',    label: 'Isolation',                icon: '🌡️' },
  { key: 'architecture', label: 'Architecture / MOE',       icon: '📐' },
  { key: 'geometre',     label: 'Géomètre-Expert',          icon: '📏' },
  { key: 'terrassement', label: 'Terrassement / VRD',       icon: '🚜' },
];
