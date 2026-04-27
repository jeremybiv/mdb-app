import Papa from 'papaparse';

export function exportArtisansCSV(artisans, filename = 'artisans-pays-de-gex.csv') {
  const rows = artisans.map((a) => ({
    Nom:          a.nom || a.Nom || '',
    SIREN:        a.siren || a.SIREN || '',
    NAF:          a.naf || a.NAF || '',
    Ville:        a.ville || a.Ville || '',
    'Code Postal':a.codePostal || a.CodePostal || '',
    Effectif:     a.effectif || a.Effectif || '',
    'CA (€)':     a.ca || a.CA || '',
    Dirigeant:    a.dirigeant || a.Dirigeant || '',
    Email:        a.email || a.Email || '',
    Téléphone:    a.telephone || a.Telephone || '',
    'Site web':   a.siteWeb || a.SiteWeb || '',
    Score:        a.score || a.Score || '',
    Priorité:     a.priorite || a.Priorite || '',
    Trade:        a.trade || a.Trade || '',
    Source:       a.source || a.Source || '',
  }));

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
