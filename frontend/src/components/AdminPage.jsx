import { useEffect, useState } from 'react';
import { getAdminUsage } from '../lib/api.js';

function Bar({ value, total }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const color = pct >= 100 ? 'bg-red' : pct >= 75 ? 'bg-amber' : 'bg-blue';
  return (
    <div className="bar-wrap w-20">
      <div className={`bar-fill ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function AdminPage({ onBack }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    getAdminUsage()
      .then(data => setState({ status: 'done', data, error: null }))
      .catch(e  => setState({ status: 'error', data: null, error: e.message }));
  }, []);

  return (
    <div className="min-h-screen bg-ink">
      <header className="border-b border-border px-5 py-3.5 sticky top-0 bg-ink/95 backdrop-blur z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button onClick={onBack} className="text-xs text-muted hover:text-dim transition-colors">
            ← Retour
          </button>
          <p className="text-sm font-medium text-bright">Administration — Recherches utilisateurs</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {state.status === 'loading' && (
          <div className="flex items-center gap-2 text-dim text-sm">
            <span className="dot-spin" /> Chargement…
          </div>
        )}

        {state.status === 'error' && (
          <div className="card border-red/20">
            <p className="text-red text-sm">⚠ {state.error}</p>
          </div>
        )}

        {state.status === 'done' && state.data && (() => {
          const { users, total } = state.data;
          const totalSearches = users.reduce((s, u) => s + u.searches.length, 0);
          const totalCost     = users.reduce((s, u) => s + (u.cost?.totalUsd || 0), 0);
          const totalCalls    = users.reduce((s, u) => s + (u.cost?.calls || 0), 0);
          return (
            <>
              {/* Stats globales */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Utilisateurs actifs', value: users.length },
                  { label: 'Adresses recherchées', value: totalSearches },
                  { label: 'Appels Claude',        value: totalCalls },
                  { label: 'Coût total estimé',    value: `$${totalCost.toFixed(3)}` },
                ].map(({ label, value }) => (
                  <div key={label} className="card text-center">
                    <p className="text-2xl font-medium text-bright">{value}</p>
                    <p className="text-[11px] text-muted mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* Stats globales */}
              {state.data.maxBudgetUsd && (
                <div className="card border-amber/20 bg-amber/5">
                  <p className="text-xs text-dim">Budget max par user : <span className="text-bright font-mono">${state.data.maxBudgetUsd}</span></p>
                </div>
              )}

              {/* Table utilisateurs */}
              <div className="card overflow-hidden p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-2.5 text-muted font-medium">Email</th>
                      <th className="px-4 py-2.5 text-muted font-medium">Adresses</th>
                      <th className="px-4 py-2.5 text-muted font-medium">Appels Claude</th>
                      <th className="px-4 py-2.5 text-muted font-medium">Coût total</th>
                      <th className="px-4 py-2.5 text-muted font-medium w-20">Quota</th>
                      <th className="px-4 py-2.5 text-muted font-medium">Dernières adresses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={u.email} className={`border-b border-border/50 ${i % 2 === 0 ? '' : 'bg-white/[.02]'}`}>
                        <td className="px-4 py-3 font-mono text-dim">
                          {u.cost?.exceeded && <span className="text-red mr-1">⚠</span>}
                          {u.email}
                        </td>
                        <td className="px-4 py-3">
                          <span className={u.remaining === 0 ? 'text-red font-medium' : 'text-bright'}>
                            {u.searches.length}/{u.total}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-dim">{u.cost?.calls ?? 0}</td>
                        <td className="px-4 py-3 font-mono">
                          <span className={u.cost?.exceeded ? 'text-red' : 'text-bright'}>
                            ${(u.cost?.totalUsd || 0).toFixed(3)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Bar value={u.searches.length} total={u.total} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            {u.searches.slice(-3).map((s, j) => (
                              <div key={j} className="flex items-center gap-2">
                                <span className="text-dim truncate max-w-[200px]">{s.adresse}</span>
                                <span className="text-muted shrink-0">
                                  {new Date(s.ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-muted">
                          Aucune recherche enregistrée
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </main>
    </div>
  );
}
