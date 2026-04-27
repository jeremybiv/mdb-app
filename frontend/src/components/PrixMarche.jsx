import { useState, useEffect } from 'react';
import { fetchTransactions, computeStats, normalizeType } from '../lib/dvf.js';

const TYPE_LABELS = { maison: 'Maison', appartement: 'Appartement', terrain: 'Terrain', autre: 'Autre' };
const FILTERS = ['tous', 'maison', 'appartement', 'terrain'];

function Sparkline({ data }) {
  if (!data?.length) return null;
  const vals = data.map((d) => d.median);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 200, H = 40, pad = 4;
  const points = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="mt-3">
      <svg width={W} height={H} className="overflow-visible">
        <polyline points={points} fill="none" stroke="#6ba3e8" strokeWidth="1.5" strokeLinejoin="round" />
        {data.map((d, i) => {
          const x = pad + (i / (vals.length - 1)) * (W - pad * 2);
          const y = H - pad - ((vals[i] - min) / range) * (H - pad * 2);
          return (
            <g key={d.year}>
              <circle cx={x} cy={y} r="2.5" fill="#6ba3e8" />
              <text x={x} y={H} textAnchor="middle" fontSize="8" fill="#444b63">{d.year}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function PrixMarche({ lon, lat, citycode, commune }) {
  const [state, setState]     = useState({ status: 'idle', transactions: [], error: null });
  const [typeFilter, setType] = useState('tous');

  useEffect(() => {
    if (!citycode) return;
    setState({ status: 'loading', transactions: [], error: null });
    fetchTransactions(lon, lat, citycode, 1500, 12)
      .then((tx) => setState({ status: 'done', transactions: tx, error: null }))
      .catch((e) => setState({ status: 'error', transactions: [], error: e.message }));
  }, [citycode]);

  // Filter by type locally — no re-fetch
  const filtered = state.transactions.filter((t) => {
    if (typeFilter === 'tous') return true;
    if (typeFilter === 'terrain') return t.surfaceBati < 10 && t.surfaceTerrain > 0;
    return normalizeType(t.typeLocal) === typeFilter;
  });

  const stats = computeStats(filtered);

  // Available types in the dataset
  const availableTypes = new Set(state.transactions.map((t) => normalizeType(t.typeLocal)));

  // Recent sales list (max 15, sorted by date desc)
  const recentSales = [...filtered]
    .filter((t) => t.valeur > 0)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 15);

  if (state.status === 'idle') return null;

  return (
    <div className="card fade-in space-y-4">
      <div className="flex items-center justify-between">
        <p className="label">Prix marché · DVF</p>
        {commune && <span className="font-mono text-xs text-muted">{commune}</span>}
      </div>

      {state.status === 'loading' && (
        <div className="flex items-center gap-2">
          <span className="dot-spin" />
          <span className="text-sm text-dim">Interrogation DVF CEREMA…</span>
        </div>
      )}

      {state.status === 'error' && (
        <p className="text-sm text-red">⚠ {state.error}</p>
      )}

      {state.status === 'done' && state.transactions.length === 0 && (
        <p className="text-sm text-dim">Aucune transaction trouvée sur 12 derniers mois.</p>
      )}

      {state.status === 'done' && state.transactions.length > 0 && (
        <>
          {/* Type filter */}
          <div className="flex gap-1.5 flex-wrap">
            {FILTERS.filter((f) => f === 'tous' || availableTypes.has(f)).map((f) => (
              <button key={f} onClick={() => setType(f)}
                className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                  typeFilter === f
                    ? 'bg-blue/15 border-blue/40 text-blue'
                    : 'border-border text-dim hover:text-text'
                }`}>
                {f === 'tous' ? `Tous (${state.transactions.length})` : `${TYPE_LABELS[f]} (${state.transactions.filter((t) => {
                  if (f === 'terrain') return t.surfaceBati < 10 && t.surfaceTerrain > 0;
                  return normalizeType(t.typeLocal) === f;
                }).length})`}
              </button>
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="text-sm text-dim">Aucune transaction de ce type sur la période.</p>
          )}

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-2">
              {stats.bati && typeFilter !== 'terrain' && (
                <div className="bg-ink border border-border rounded-md p-3 col-span-2 sm:col-span-1">
                  <p className="label mb-2">
                    {typeFilter === 'tous' ? 'Bâti' : TYPE_LABELS[typeFilter]}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-semibold text-blue">
                      {stats.bati.median.toLocaleString('fr-FR')}
                    </span>
                    <span className="text-sm text-dim">€/m²</span>
                    {stats.evolutionPct != null && (
                      <span className={`font-mono text-xs ml-auto ${stats.evolutionPct >= 0 ? 'text-green' : 'text-red'}`}>
                        {stats.evolutionPct > 0 ? '+' : ''}{stats.evolutionPct}% /an
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-1">
                    P25 {stats.bati.p25.toLocaleString('fr-FR')} — P75 {stats.bati.p75.toLocaleString('fr-FR')} €/m²
                    &nbsp;· {stats.bati.count} ventes
                  </p>
                  <Sparkline data={stats.sparkline} />
                </div>
              )}
              {stats.terrain && (typeFilter === 'tous' || typeFilter === 'terrain') && (
                <div className="bg-ink border border-border rounded-md p-3">
                  <p className="label mb-2">Terrain</p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xl font-semibold text-amber">
                      {stats.terrain.median.toLocaleString('fr-FR')}
                    </span>
                    <span className="text-sm text-dim">€/m²</span>
                  </div>
                  <p className="text-xs text-muted mt-1">{stats.terrain.count} ventes</p>
                </div>
              )}
            </div>
          )}

          {/* Recent sales list */}
          {recentSales.length > 0 && (
            <div className="space-y-1">
              <p className="label mb-2">Dernières ventes</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted border-b border-border">
                      <th className="text-left pb-1.5 pr-3 font-medium">Date</th>
                      <th className="text-left pb-1.5 pr-3 font-medium">Type</th>
                      <th className="text-right pb-1.5 pr-3 font-medium">Prix</th>
                      <th className="text-right pb-1.5 pr-3 font-medium">Surface</th>
                      <th className="text-right pb-1.5 font-medium">€/m²</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSales.map((t, i) => {
                      const surf = t.surfaceBati > 0 ? t.surfaceBati : t.surfaceTerrain;
                      const ppm2 = surf > 0 ? Math.round(t.valeur / surf) : null;
                      return (
                        <tr key={i} className="border-b border-border/50 hover:bg-border/20">
                          <td className="py-1.5 pr-3 text-dim font-mono">{t.date?.substring(0, 7) || '—'}</td>
                          <td className="py-1.5 pr-3 text-text">{TYPE_LABELS[normalizeType(t.typeLocal)] || t.typeLocal}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-bright">
                            {t.valeur.toLocaleString('fr-FR')} €
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono text-dim">
                            {surf > 0 ? `${surf} m²` : '—'}
                          </td>
                          <td className="py-1.5 text-right font-mono text-blue">
                            {ppm2 ? `${ppm2.toLocaleString('fr-FR')}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-muted">
            Source : DVF / CEREMA · {filtered.length} mutations · 12 derniers mois
            {stats?.dateRange?.min && ` · ${stats.dateRange.min.substring(0,7)} → ${stats.dateRange.max?.substring(0,7)}`}
          </p>
        </>
      )}
    </div>
  );
}
