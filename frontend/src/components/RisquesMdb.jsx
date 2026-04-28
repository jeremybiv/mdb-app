import { useState } from 'react';
import { getRisquesMdb } from '../lib/api.js';

const NIVEAU = {
  critique: { pill: 'pill-red',   icon: '▲', iconBg: 'bg-red/10 text-red'    },
  élevé:    { pill: 'pill-amber', icon: '◆', iconBg: 'bg-amber/10 text-amber' },
  modéré:   { pill: 'pill-blue',  icon: '●', iconBg: 'bg-blue/10 text-blue'   },
  faible:   { pill: 'pill-gray',  icon: '✓', iconBg: 'bg-white/5 text-dim'    },
};

const CAT_ICONS = {
  juridique: '⚖', fiscal: '€', administratif: '🏛', technique: '⚙', marché: '↗',
};

export function RisquesMdb({ zone, typeZone, adresse, commune, departement }) {
  const [form, setForm] = useState({
    operationType:      'division',
    projetDescription:  '',
    surfaceTerrain:     '',
    prixAchat:          '',
    nbLots:             '',
    periodeConstruction: '',
    presenceABF:        false,
    zoneInondable:      false,
    locataireEnPlace:   false,
  });
  const [state, setState] = useState({ status: 'idle', data: null, error: null });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleAnalyse = async () => {
    setState({ status: 'loading', data: null, error: null });
    try {
      const data = await getRisquesMdb({
        zone, typeZone, adresse, commune, departement,
        ...form,
        surfaceTerrain: form.surfaceTerrain ? Number(form.surfaceTerrain) : undefined,
        prixAchat:      form.prixAchat      ? Number(form.prixAchat.replace(/\s/g, '')) : undefined,
        nbLots:         form.nbLots         ? Number(form.nbLots) : undefined,
      });
      setState({ status: 'done', data, error: null });
    } catch (e) {
      setState({ status: 'error', data: null, error: e.message });
    }
  };

  return (
    <div className="card fade-in space-y-4">
      <div className="flex items-center justify-between">
        <p className="section-label">Risques MdB</p>
        {state.status === 'done' && (
          <button onClick={() => setState({ status: 'idle', data: null, error: null })}
            className="text-xs text-muted hover:text-dim transition-colors">← Modifier</button>
        )}
      </div>

      {/* Form */}
      {state.status !== 'done' && (
        <div className="space-y-3">
          <div>
            <p className="section-label mb-2">Type d'opération</p>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { v: 'division',     l: 'Division' },
                { v: 'valorisation', l: 'Valorisation' },
                { v: 'mixte',        l: 'Division + rénov.' },
                { v: 'surseoir',     l: 'Achat-revente nu' },
              ].map(({ v, l }) => (
                <button key={v} onClick={() => set('operationType', v)}
                  className={`px-3 py-1.5 rounded-md text-xs border transition-all ${
                    form.operationType === v
                      ? 'bg-blue/15 text-blue border-blue/30'
                      : 'text-dim border-border hover:border-blue/20 hover:text-text'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { k: 'surfaceTerrain',      l: 'Surface (m²)',      t: 'number', ph: '850' },
              { k: 'prixAchat',           l: "Prix achat (€)",    t: 'text',   ph: '380 000' },
              { k: 'nbLots',              l: 'Nb lots',           t: 'number', ph: '3' },
              { k: 'periodeConstruction', l: 'Époque constr.',    t: 'text',   ph: 'années 70' },
            ].map(({ k, l, t, ph }) => (
              <div key={k}>
                <p className="text-[10px] text-muted mb-1">{l}</p>
                <input type={t} placeholder={ph} value={form[k]}
                  onChange={e => set(k, e.target.value)} className="input text-xs py-1.5" />
              </div>
            ))}
          </div>

          <div className="flex gap-4 flex-wrap">
            {[
              { k: 'presenceABF',      l: 'Périmètre ABF' },
              { k: 'zoneInondable',    l: 'Zone inondable' },
              { k: 'locataireEnPlace', l: 'Locataire en place' },
            ].map(({ k, l }) => (
              <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)}
                  className="accent-blue w-3.5 h-3.5" />
                <span className="text-xs text-dim">{l}</span>
              </label>
            ))}
          </div>

          <input type="text" placeholder="Description du projet (optionnel)"
            value={form.projetDescription}
            onChange={e => set('projetDescription', e.target.value)}
            className="input text-xs" />

          {state.status === 'error' && (
            <p className="text-xs text-red">⚠ {state.error}</p>
          )}

          <button onClick={handleAnalyse} disabled={state.status === 'loading'}
            className="btn-primary w-full disabled:opacity-40">
            {state.status === 'loading'
              ? <span className="flex items-center justify-center gap-2"><span className="dot-spin" />Analyse Claude…</span>
              : 'Analyser les risques'}
          </button>
        </div>
      )}

      {/* Results */}
      {state.status === 'done' && state.data && (() => {
        const { risques, scoreRisqueGlobal, recommandationPrincipale } = state.data;
        const scoreColor = scoreRisqueGlobal >= 65 ? 'text-green' : scoreRisqueGlobal >= 40 ? 'text-amber' : 'text-red';
        const barColor   = scoreRisqueGlobal >= 65 ? 'bg-green'   : scoreRisqueGlobal >= 40 ? 'bg-amber'   : 'bg-red';
        return (
          <div className="space-y-4">
            {/* Score bar */}
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <p className="section-label">Score de sécurité</p>
                <span className={`text-xl font-medium font-mono ${scoreColor}`}>
                  {scoreRisqueGlobal}<span className="text-xs text-muted font-sans font-normal"> /100</span>
                </span>
              </div>
              <div className="bar-wrap">
                <div className={`bar-fill ${barColor}`} style={{ width: `${scoreRisqueGlobal}%` }} />
              </div>
            </div>

            {/* Recommandation */}
            {recommandationPrincipale && (
              <div className="card-sm border-blue/20 bg-blue/5">
                <p className="text-xs text-dim leading-relaxed">{recommandationPrincipale}</p>
              </div>
            )}

            {/* Risk rows */}
            <div>
              {risques.map((r, i) => {
                const cfg = NIVEAU[r.niveau] || NIVEAU.faible;
                return (
                  <details key={i} className="risk-row group">
                    <summary className="flex items-start gap-2.5 cursor-pointer list-none select-none w-full">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0 mt-0.5 ${cfg.iconBg}`}>
                        {cfg.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">{r.titre}</p>
                        <p className="text-[11px] text-muted mt-0.5">
                          {CAT_ICONS[r.categorie]} {r.categorie} · {r.probabilite}
                        </p>
                      </div>
                      <span className={`pill ${cfg.pill} shrink-0 mt-0.5`}>{r.niveau}</span>
                    </summary>
                    <div className="mt-2 ml-9 space-y-2">
                      <p className="text-xs text-dim leading-relaxed">{r.description}</p>
                      <div className="card-sm">
                        <p className="text-[10px] text-muted mb-1 uppercase tracking-wide">Mitigation</p>
                        <p className="text-xs text-text">{r.mitigation}</p>
                      </div>
                      {r.referenceJuridique && (
                        <p className="text-[10px] text-muted font-mono">{r.referenceJuridique}</p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>

            <p className="text-[10px] text-muted">Analyse IA indicative — consulter un notaire avant toute opération.</p>
          </div>
        );
      })()}
    </div>
  );
}
