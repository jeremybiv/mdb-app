import { useState, useEffect, useMemo } from 'react';
import { fetchTransactions, computeStats, normalizeType } from '../lib/dvf.js';

const TYPES = [
  { key: 'maison',       label: 'Maison',       color: 'text-blue',  border: 'border-blue/30'  },
  { key: 'appartement',  label: 'Appartement',  color: 'text-green', border: 'border-green/30' },
  { key: 'terrain',      label: 'Terrain',      color: 'text-amber', border: 'border-amber/30' },
];

function filterByType(transactions, typeKey) {
  if (typeKey === 'terrain')     return transactions.filter((t) => t.surfaceBati < 10 && t.surfaceTerrain > 0);
  if (typeKey === 'maison')      return transactions.filter((t) => normalizeType(t.typeLocal) === 'maison' && t.surfaceBati > 0);
  if (typeKey === 'appartement') return transactions.filter((t) => normalizeType(t.typeLocal) === 'appartement' && t.surfaceBati > 0);
  return transactions.filter((t) => normalizeType(t.typeLocal) === typeKey);
}

function medianOf(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function TypeCard({ type, transactions, active, onClick }) {
  const items = filterByType(transactions, type.key);
  const surfKey = type.key === 'terrain' ? 'surfaceTerrain' : 'surfaceBati';
  const prices = items
    .map((t) => t[surfKey] > 0 ? t.valeur / t[surfKey] : null)
    .filter((p) => p && p > 200 && p < 25000);
  const median = medianOf(prices);

  return (
    <button onClick={onClick}
      className={`flex-1 bg-ink border rounded-md p-3 text-left transition-colors ${
        active ? `${type.border} bg-white/5` : 'border-border hover:border-border/80'
      }`}>
      <p className="text-xs text-muted mb-1">{type.label}</p>
      {median ? (
        <>
          <p className={`font-mono text-xl font-semibold ${type.color}`}>
            {Math.round(median).toLocaleString('fr-FR')}
            <span className="text-xs font-normal text-dim ml-1">€/m²</span>
          </p>
          <p className="text-xs text-muted mt-0.5">{items.length} vente{items.length > 1 ? 's' : ''}</p>
        </>
      ) : (
        <p className="text-xs text-muted">Pas de données</p>
      )}
    </button>
  );
}

function DvfDebugLog({ log }) {
  return (
    <div className="mt-1 border border-amber/20 rounded-md overflow-hidden">
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="bg-amber/5 text-muted">
            <th className="text-left px-2 py-1 font-medium">Source</th>
            <th className="text-center px-2 py-1 font-medium">Status</th>
            <th className="text-right px-2 py-1 font-medium">Count</th>
            <th className="text-left px-2 py-1 font-medium">URL / Erreur</th>
          </tr>
        </thead>
        <tbody>
          {log.map((entry, i) => (
            <tr key={i} className="border-t border-border/30">
              <td className="px-2 py-1 text-dim whitespace-nowrap">{entry.source}</td>
              <td className={`px-2 py-1 text-center ${entry.status === 200 ? 'text-green' : 'text-red'}`}>
                {entry.status ?? '—'}
              </td>
              <td className="px-2 py-1 text-right text-bright">{entry.count ?? '—'}</td>
              <td className="px-2 py-1 text-muted break-all">
                {entry.error && <span className="text-red">{entry.error} </span>}
                {entry.body && <span className="text-amber">[{entry.body}] </span>}
                {entry.url && <a href={entry.url} target="_blank" rel="noopener" className="text-blue/70 hover:text-blue underline">{entry.url.slice(0, 80)}…</a>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrixMarche({ lon, lat, commune, citycode, propertyType = 'maison' }) {
  const [state, setState]       = useState({ status: 'idle', transactions: [], source: null, error: null, debugLog: null });
  const [activeType, setType]   = useState(propertyType);
  const [showDebug, setDebug]   = useState(false);

  // Sync avec le sélecteur du header
  useEffect(() => { setType(propertyType); }, [propertyType]);

  useEffect(() => {
    if (!lon || !lat || !citycode) return;
    setState({ status: 'loading', transactions: [], source: null, error: null, debugLog: null });
    fetchTransactions(lon, lat, 1500, 12, citycode)
      .then(({ transactions, source, debugLog }) => setState({ status: 'done', transactions, source, error: null, debugLog }))
      .catch((e) => setState({ status: 'error', transactions: [], source: null, error: e.message, debugLog: e.debugLog || null }));
  }, [lon, lat, citycode]);

  const activeTransactions = useMemo(
    () => filterByType(state.transactions, activeType),
    [state.transactions, activeType]
  );

  const recentSales = useMemo(
    () => [...activeTransactions]
      .filter((t) => t.valeur > 0)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 20),
    [activeTransactions]
  );

  if (state.status === 'idle') return null;

  return (
    <div className="card fade-in space-y-4">
      <div className="flex items-center justify-between">
        <p className="label">Prix marché · DVF</p>
        <div className="flex items-center gap-2">
          {commune && <span className="font-mono text-xs text-muted">{commune} · 12 mois</span>}
          <button onClick={() => setDebug((d) => !d)}
            title="Debug DVF"
            className={`px-2 py-0.5 text-[10px] rounded border transition-colors font-mono ${showDebug ? 'border-amber/40 text-amber bg-amber/8' : 'border-border text-muted hover:text-dim'}`}>
            ⚙ debug
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="flex items-center gap-2">
          <span className="dot-spin" />
          <span className="text-sm text-dim">Interrogation DVF…</span>
        </div>
      )}

      {state.status === 'error' && (
        <p className="text-sm text-red">⚠ {state.error}</p>
      )}

      {/* Debug log — always rendered when showDebug, regardless of status */}
      {showDebug && state.debugLog && (
        <DvfDebugLog log={state.debugLog} />
      )}

      {state.status === 'done' && state.transactions.length === 0 && (
        <p className="text-sm text-dim">Aucune transaction trouvée sur les 12 derniers mois.</p>
      )}

      {state.status === 'done' && state.transactions.length > 0 && (
        <>
          {/* 3 stat cards — always visible */}
          <div className="flex gap-2">
            {TYPES.map((t) => (
              <TypeCard key={t.key} type={t}
                transactions={state.transactions}
                active={activeType === t.key}
                onClick={() => setType(t.key)} />
            ))}
          </div>

          {/* List of 20 for active type */}
          {recentSales.length === 0 ? (
            <p className="text-sm text-dim">Aucune vente de ce type sur la période.</p>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted mb-2">
                {TYPES.find((t) => t.key === activeType)?.label} — {activeTransactions.length} vente{activeTransactions.length > 1 ? 's' : ''}, {recentSales.length} affichées
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted border-b border-border">
                      <th className="text-left pb-1.5 pr-3 font-medium">Date</th>
                      <th className="text-left pb-1.5 pr-3 font-medium">Adresse</th>
                      <th className="text-right pb-1.5 pr-3 font-medium">Prix total</th>
                      <th className="text-right pb-1.5 pr-3 font-medium">Surface</th>
                      <th className="text-right pb-1.5 font-medium">€/m²</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSales.map((t, i) => {
                      const surf = activeType === 'terrain' ? t.surfaceTerrain : (t.surfaceBati || t.surfaceTerrain);
                      const ppm2 = surf > 0 ? Math.round(t.valeur / surf) : null;
                      const exploreUrl = t.idParcelle
                        ? `https://explore.data.gouv.fr/fr/immobilier?code=${t.idParcelle}&level=parcelle&onglet=carte`
                        : t.lat && t.lon
                          ? `https://explore.data.gouv.fr/fr/immobilier?lat=${t.lat.toFixed(5)}&lng=${t.lon.toFixed(5)}&zoom=18.00&onglet=carte`
                          : null;
                      return (
                        <tr key={i} className="border-b border-border/40 hover:bg-border/20">
                          <td className="py-1.5 pr-3 font-mono text-dim whitespace-nowrap">{t.date?.substring(0, 7) || '—'}</td>
                          <td className="py-1.5 pr-3 text-dim max-w-[180px]">
                            {t.adresse ? (
                              <span className="block truncate" title={`${t.adresse}, ${t.codePostal} ${t.commune}`}>
                                {t.adresse.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                              </span>
                            ) : <span className="text-muted">—</span>}
                            {exploreUrl && (
                              <a href={exploreUrl} target="_blank" rel="noopener"
                                className="text-blue/60 hover:text-blue text-[10px] font-mono">
                                voir parcelle ↗
                              </a>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono text-bright whitespace-nowrap">
                            {t.valeur.toLocaleString('fr-FR')} €
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono text-dim whitespace-nowrap">
                            {surf > 0 ? `${Math.round(surf)} m²` : '—'}
                          </td>
                          <td className={`py-1.5 text-right font-mono font-semibold whitespace-nowrap ${TYPES.find((tp) => tp.key === activeType)?.color}`}>
                            {ppm2 ? ppm2.toLocaleString('fr-FR') : '—'}
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
            Source : {state.source || 'DVF'} · {state.transactions.length} mutations (12 mois)
          </p>
        </>
      )}
    </div>
  );
}
