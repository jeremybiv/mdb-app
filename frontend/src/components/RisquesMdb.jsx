import { useState } from 'react';
import { getRisquesMdb } from '../lib/api.js';

const NIVEAU_CONFIG = {
  critique: { class: 'text-red border-red/30 bg-red/5',       dot: 'bg-red',   label: 'Critique' },
  élevé:    { class: 'text-amber border-amber/30 bg-amber/5', dot: 'bg-amber', label: 'Élevé' },
  modéré:   { class: 'text-blue border-blue/30 bg-blue/5',    dot: 'bg-blue',  label: 'Modéré' },
  faible:   { class: 'text-dim border-border bg-white/[.02]', dot: 'bg-dim',   label: 'Faible' },
};

const CAT_ICONS = {
  juridique:      '⚖️',
  fiscal:         '💶',
  administratif:  '🏛️',
  technique:      '🔧',
  marché:         '📊',
};

const PROBA_LABEL = {
  certain:  'Certain',
  probable: 'Probable',
  possible: 'Possible',
  rare:     'Rare',
};

function ScoreGauge({ score }) {
  const color = score >= 65 ? 'text-green' : score >= 40 ? 'text-amber' : 'text-red';
  const label = score >= 65 ? 'Opération peu risquée' : score >= 40 ? 'Risques modérés' : 'Opération risquée';
  return (
    <div className="flex items-center gap-3 p-3 bg-ink border border-border rounded-md">
      <span className={`font-mono text-3xl font-bold ${color}`}>{score}</span>
      <div>
        <p className="text-sm font-medium text-bright">{label}</p>
        <p className="text-xs text-muted">Score de sécurité (0 = très risqué · 100 = très sécurisé)</p>
      </div>
    </div>
  );
}

export function RisquesMdb({ zone, typeZone, adresse, commune, departement, geo }) {
  const [form, setForm] = useState({
    operationType: 'division',
    projetDescription: '',
    surfaceTerrain: '',
    prixAchat: '',
    nbLots: '',
    periodeConstruction: '',
    presenceABF: false,
    zoneInondable: false,
    locataireEnPlace: false,
  });
  const [state, setState] = useState({ status: 'idle', data: null, error: null });

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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="card fade-in space-y-4">
      <p className="label">Risques juridiques · Marchand de biens</p>

      {/* Form */}
      {state.status !== 'done' && (
        <div className="space-y-3">
          {/* Operation type */}
          <div>
            <p className="label mb-2">Type d'opération</p>
            <div className="flex gap-2 flex-wrap">
              {[
                { v: 'division',      l: 'Division parcellaire' },
                { v: 'valorisation',  l: 'Valorisation / rénovation' },
                { v: 'mixte',         l: 'Division + valorisation' },
                { v: 'surseoir',      l: 'Achat-revente nu' },
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

          {/* Numeric inputs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { k: 'surfaceTerrain',      l: 'Surface terrain (m²)',  t: 'number', ph: '850' },
              { k: 'prixAchat',           l: "Prix d'achat (€)",       t: 'text',   ph: '380 000' },
              { k: 'nbLots',              l: 'Nb lots envisagés',      t: 'number', ph: '3' },
              { k: 'periodeConstruction', l: 'Période construction',   t: 'text',   ph: 'années 70' },
            ].map(({ k, l, t, ph }) => (
              <div key={k}>
                <p className="label mb-1">{l}</p>
                <input type={t} placeholder={ph} value={form[k]}
                  onChange={(e) => set(k, e.target.value)}
                  className="input text-xs" />
              </div>
            ))}
          </div>

          {/* Checkboxes */}
          <div className="flex gap-4 flex-wrap">
            {[
              { k: 'presenceABF',      l: 'Périmètre ABF' },
              { k: 'zoneInondable',    l: 'Zone inondable' },
              { k: 'locataireEnPlace', l: 'Locataire en place' },
            ].map(({ k, l }) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)}
                  className="accent-blue w-3.5 h-3.5" />
                <span className="text-xs text-dim">{l}</span>
              </label>
            ))}
          </div>

          {/* Projet description */}
          <div>
            <p className="label mb-1">Description du projet (optionnel)</p>
            <input type="text" placeholder="ex: division en 3 lots + rénovation corps de ferme"
              value={form.projetDescription}
              onChange={(e) => set('projetDescription', e.target.value)}
              className="input text-xs" />
          </div>

          <button onClick={handleAnalyse} disabled={state.status === 'loading'}
            className="btn-primary disabled:opacity-40">
            {state.status === 'loading' ? '⏳ Analyse Claude en cours…' : '⚖️ Analyser les risques'}
          </button>
        </div>
      )}

      {/* Error */}
      {state.status === 'error' && (
        <p className="text-sm text-red">⚠ {state.error}</p>
      )}

      {/* Results */}
      {state.status === 'done' && state.data && (() => {
        const { risques, scoreRisqueGlobal, recommandationPrincipale } = state.data;
        return (
          <div className="space-y-4">
            <ScoreGauge score={scoreRisqueGlobal} />

            {recommandationPrincipale && (
              <div className="p-3 bg-blue/5 border border-blue/15 rounded-md">
                <p className="label mb-1">Recommandation principale</p>
                <p className="text-sm text-text">{recommandationPrincipale}</p>
              </div>
            )}

            <div className="space-y-2">
              {risques.map((r, i) => {
                const cfg = NIVEAU_CONFIG[r.niveau] || NIVEAU_CONFIG.faible;
                return (
                  <details key={i} className={`border rounded-md p-3 cursor-pointer ${cfg.class}`}>
                    <summary className="flex items-center gap-2 list-none select-none">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <span className="text-sm font-medium flex-1">{r.titre}</span>
                      <span className="text-[10px] font-mono opacity-60">{CAT_ICONS[r.categorie]} {r.categorie}</span>
                      <span className="text-[10px] font-mono opacity-60 ml-2">{PROBA_LABEL[r.probabilite]}</span>
                    </summary>
                    <div className="mt-3 space-y-2 pl-4">
                      <p className="text-xs text-dim leading-relaxed">{r.description}</p>
                      <div className="p-2 bg-black/20 rounded">
                        <p className="text-[10px] font-mono text-muted mb-0.5">MITIGATION</p>
                        <p className="text-xs text-text">{r.mitigation}</p>
                      </div>
                      {r.referenceJuridique && (
                        <p className="text-[10px] font-mono text-muted">📋 {r.referenceJuridique}</p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>

            <button onClick={() => setState({ status: 'idle', data: null, error: null })}
              className="btn-ghost text-xs">
              ← Modifier le projet
            </button>
            <p className="text-xs text-muted">Analyse IA à titre indicatif — consulter un notaire ou avocat avant toute opération.</p>
          </div>
        );
      })()}
    </div>
  );
}
