import { useState } from 'react';
import { exportArtisansCSV } from '../lib/export.js';

const PRIORITY_CLASS = { P1: 'p1', P2: 'p2', P3: 'p3', P4: 'p4' };

function SortIcon({ dir }) {
  if (!dir) return <span className="text-muted">↕</span>;
  return <span className="text-blue">{dir === 'asc' ? '↑' : '↓'}</span>;
}

export function ArtisansTable({ artisans, loading, error }) {
  const [sort, setSort] = useState({ key: 'score', dir: 'desc' });
  const [filter, setFilter] = useState('');

  if (loading) return (
    <div className="card">
      <p className="label mb-3">Recherche en cours…</p>
      <div className="flex items-center gap-2"><span className="dot-spin" /><span className="text-sm text-dim">Interrogation Pappers…</span></div>
    </div>
  );

  if (error) return (
    <div className="card">
      <p className="label mb-2">Erreur</p>
      <p className="text-sm text-red">{error}</p>
    </div>
  );

  if (!artisans?.length) return null;

  // Filter
  const q = filter.toLowerCase();
  const filtered = artisans.filter((a) =>
    !q || (a.nom||'').toLowerCase().includes(q) || (a.ville||'').toLowerCase().includes(q)
  );

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let av = a[sort.key], bv = b[sort.key];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av == null) return 1;
    if (bv == null) return -1;
    return sort.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  const Col = ({ k, label }) => (
    <th
      onClick={() => toggleSort(k)}
      className="label text-left py-2 px-3 cursor-pointer hover:text-text transition-colors select-none whitespace-nowrap"
    >
      {label} <SortIcon dir={sort.key === k ? sort.dir : null} />
    </th>
  );

  return (
    <div className="card space-y-4 fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="label">Artisans trouvés</p>
          <p className="text-sm text-dim mt-0.5">{sorted.length} / {artisans.length} résultats</p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            className="input w-48 text-xs"
            placeholder="Filtrer…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            onClick={() => exportArtisansCSV(sorted)}
            className="btn-primary text-xs"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-ink border-b border-border">
            <tr>
              <Col k="priorite" label="P" />
              <Col k="score"    label="Score" />
              <Col k="nom"      label="Nom" />
              <Col k="ville"    label="Ville" />
              <Col k="effectif" label="Effectif" />
              <Col k="ca"       label="CA" />
              <th className="label text-left py-2 px-3 whitespace-nowrap">Contact</th>
              <th className="label text-left py-2 px-3 whitespace-nowrap">Site</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => (
              <tr key={a.siren || i} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                <td className="py-2 px-3">
                  <span className={PRIORITY_CLASS[a.priorite] || 'p4'}>{a.priorite || 'P4'}</span>
                </td>
                <td className="py-2 px-3 font-mono text-dim">{a.score}</td>
                <td className="py-2 px-3">
                  <p className="text-text font-medium">{a.nom}</p>
                  <p className="text-muted text-[10px] font-mono">{a.siren}</p>
                </td>
                <td className="py-2 px-3 text-dim">{a.ville}</td>
                <td className="py-2 px-3 text-dim">{a.effectif ? `${a.effectif}+` : '—'}</td>
                <td className="py-2 px-3 text-dim">
                  {a.ca ? `${(a.ca / 1000).toFixed(0)}k€` : '—'}
                </td>
                <td className="py-2 px-3">
                  <div className="flex flex-col gap-0.5">
                    {a.email && <a href={`mailto:${a.email}`} className="text-blue hover:underline truncate max-w-[160px]">{a.email}</a>}
                    {a.telephone && <span className="text-dim">{a.telephone}</span>}
                    {!a.email && !a.telephone && <span className="text-muted">—</span>}
                  </div>
                </td>
                <td className="py-2 px-3">
                  <div className="flex flex-col gap-0.5">
                    {a.siteWeb && <a href={a.siteWeb} target="_blank" rel="noopener" className="text-blue hover:underline text-[10px]">↗ site</a>}
                    {a.rge && <span className="text-[10px] font-mono text-green bg-green/10 border border-green/20 px-1 rounded">RGE ✓</span>}
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(`"${a.nom}" ${a.ville} artisan`)}`}
                      target="_blank" rel="noopener"
                      className="text-muted hover:text-dim text-[10px]"
                      title="Rechercher sur Google"
                    >🔍 Google</a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        {sorted[0]?.source === 'rge'    && 'Source : RGE ADEME · Certifications à jour'}
        {sorted[0]?.source === 'sirene' && 'Source : SIRENE INSEE + RGE ADEME · Données officielles, sans contact direct'}
        {sorted[0]?.source === 'pappers'&& 'Source : Pappers (RCS) · Données déclaratives, peuvent être obsolètes'}
        {!sorted[0]?.source             && 'Source : SIRENE INSEE + Pappers fusionnés'}
      </p>
    </div>
  );
}
