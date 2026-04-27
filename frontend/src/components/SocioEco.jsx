import { useState, useEffect } from 'react';
import { fetchSocioEco, computeAttractivite } from '../lib/insee.js';

function Bar({ value, max = 100, color = 'blue' }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const colors = { blue: 'bg-blue', green: 'bg-green', amber: 'bg-amber', red: 'bg-red', dim: 'bg-dim' };
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colors[color] || 'bg-blue'} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-dim w-10 text-right">{value != null ? value + '%' : '—'}</span>
    </div>
  );
}

function ScoreDial({ score }) {
  const color = score >= 70 ? 'text-green' : score >= 45 ? 'text-amber' : 'text-red';
  const label = score >= 70 ? 'Attractif' : score >= 45 ? 'Moyen' : 'Faible';
  return (
    <div className="flex flex-col items-center">
      <span className={`font-mono text-3xl font-bold ${color}`}>{score}</span>
      <span className="text-xs text-muted mt-0.5">{label}</span>
    </div>
  );
}

export function SocioEco({ citycode, communeNom }) {
  const [state, setState] = useState({ status: 'idle', profile: null, score: null, error: null });

  useEffect(() => {
    if (!citycode) return;
    setState({ status: 'loading', profile: null, score: null, error: null });
    fetchSocioEco(citycode, communeNom)
      .then((profile) => {
        setState({ status: 'done', profile, score: computeAttractivite(profile), error: null });
      })
      .catch((e) => setState({ status: 'error', profile: null, score: null, error: e.message }));
  }, [citycode]);

  if (state.status === 'idle') return null;

  return (
    <div className="card fade-in space-y-4">
      <div className="flex items-center justify-between">
        <p className="label">Profil socio-économique</p>
        {communeNom && <span className="font-mono text-xs text-muted">{communeNom}</span>}
      </div>

      {state.status === 'loading' && (
        <div className="flex items-center gap-2">
          <span className="dot-spin" />
          <span className="text-sm text-dim">Interrogation INSEE / geo.api.gouv.fr…</span>
        </div>
      )}

      {state.status === 'error' && (
        <p className="text-sm text-red">⚠ {state.error}</p>
      )}

      {state.status === 'done' && state.profile && (() => {
        const { commune, revenus, emploi, logement } = state.profile;
        return (
          <div className="space-y-4">
            {/* Score + commune header */}
            <div className="flex items-center gap-4 p-3 bg-ink border border-border rounded-md">
              <ScoreDial score={state.score} />
              <div className="flex-1">
                <p className="text-sm font-medium text-bright">{commune.nom}</p>
                <div className="flex gap-3 mt-1 flex-wrap">
                  {commune.population && (
                    <span className="font-mono text-xs text-dim">
                      {commune.population.toLocaleString('fr-FR')} hab
                    </span>
                  )}
                  {commune.densiteHab && (
                    <span className="font-mono text-xs text-dim">
                      {commune.densiteHab} hab/km²
                    </span>
                  )}
                  {commune.codesPostaux?.[0] && (
                    <span className="font-mono text-xs text-dim">{commune.codesPostaux[0]}</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="label mb-1">Score attractivité</p>
                <p className="font-mono text-xs text-muted">MdB / investissement</p>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Revenus */}
              <div className="bg-ink border border-border rounded-md p-3 space-y-2">
                <p className="label">Revenus</p>
                {revenus.medianDisponible ? (
                  <div>
                    <span className="font-mono text-lg font-semibold text-blue">
                      {revenus.medianDisponible.toLocaleString('fr-FR')} €
                    </span>
                    <p className="text-xs text-muted">médiane dispo/UC</p>
                  </div>
                ) : <p className="text-xs text-muted">N/D</p>}
                {revenus.tauxPauvrete != null && (
                  <div>
                    <p className="font-mono text-xs text-dim mb-1">Taux pauvreté</p>
                    <Bar value={revenus.tauxPauvrete} max={30}
                      color={revenus.tauxPauvrete > 20 ? 'red' : revenus.tauxPauvrete > 12 ? 'amber' : 'green'} />
                  </div>
                )}
              </div>

              {/* Emploi */}
              <div className="bg-ink border border-border rounded-md p-3 space-y-2">
                <p className="label">Emploi</p>
                {emploi.tauxChomage != null && (
                  <div>
                    <p className="font-mono text-xs text-dim mb-1">Chômage</p>
                    <Bar value={emploi.tauxChomage} max={25}
                      color={emploi.tauxChomage > 15 ? 'red' : emploi.tauxChomage > 9 ? 'amber' : 'green'} />
                  </div>
                )}
                {emploi.tauxCadres != null && (
                  <div>
                    <p className="font-mono text-xs text-dim mb-1">Cadres</p>
                    <Bar value={emploi.tauxCadres} max={40}
                      color={emploi.tauxCadres > 20 ? 'green' : 'blue'} />
                  </div>
                )}
                {emploi.tauxActivite != null && (
                  <div>
                    <p className="font-mono text-xs text-dim mb-1">Taux d'activité</p>
                    <Bar value={emploi.tauxActivite} max={80} color="blue" />
                  </div>
                )}
              </div>

              {/* Logement */}
              <div className="bg-ink border border-border rounded-md p-3 space-y-2">
                <p className="label">Logement</p>
                {logement.tauxProprietaires != null && (
                  <div>
                    <p className="font-mono text-xs text-dim mb-1">Propriétaires</p>
                    <Bar value={logement.tauxProprietaires} max={100}
                      color={logement.tauxProprietaires > 60 ? 'green' : 'blue'} />
                  </div>
                )}
                {logement.tauxVacants != null && (
                  <div>
                    <p className="font-mono text-xs text-dim mb-1">Vacance</p>
                    <Bar value={logement.tauxVacants} max={20}
                      color={logement.tauxVacants > 10 ? 'red' : logement.tauxVacants > 6 ? 'amber' : 'green'} />
                  </div>
                )}
                {logement.tauxMaisonsIndiv != null && (
                  <div>
                    <p className="font-mono text-xs text-dim mb-1">Maisons indiv.</p>
                    <Bar value={logement.tauxMaisonsIndiv} max={100} color="dim" />
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-muted">Source : INSEE RP 2020 · Filosofi 2021 · geo.api.gouv.fr</p>
          </div>
        );
      })()}
    </div>
  );
}
