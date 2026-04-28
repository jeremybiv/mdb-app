import { TRADES } from '../lib/zones.js';

const SOURCES = [
  { key: 'sirene', label: 'SIRENE + RGE', badge: 'Gratuit', color: 'green',
    desc: 'INSEE officiel + certifications ADEME. Sans clé API.' },
  /*{ key: 'pappers', label: 'Pappers', badge: 'Payant', color: 'blue',
    desc: 'Données financières (CA, bilans). Nécessite une clé API.' },
  { key: 'both', label: 'Les deux fusionnés', badge: 'Recommandé', color: 'amber',
    desc: 'SIRENE enrichi par Pappers quand disponible. Meilleure couverture.' }*/,
];

export function TradeSelector({ selected, onChange, source = 'sirene', onSourceChange }) {
  const toggle = (key) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  return (
    <div className="card space-y-4">
      {/* Source selector */}
      <div>
        <p className="label mb-2">Source de données</p>
        <div className="flex flex-col gap-2">
          {SOURCES.map((s) => {
            const active = source === s.key;
            const borderColor = active
              ? s.color === 'green' ? 'border-green/40 bg-green/5'
              : s.color === 'amber' ? 'border-amber/40 bg-amber/5'
              : 'border-blue/40 bg-blue/5'
              : 'border-border hover:border-white/20';
            const textColor = active
              ? s.color === 'green' ? 'text-green'
              : s.color === 'amber' ? 'text-amber'
              : 'text-blue'
              : 'text-dim';
            return (
              <button key={s.key} onClick={() => onSourceChange?.(s.key)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md border text-left transition-all ${borderColor}`}>
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-medium ${textColor}`}>{s.label}</span>
                  <span className={`ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    s.color === 'green' ? 'bg-green/10 text-green' :
                    s.color === 'amber' ? 'bg-amber/10 text-amber' : 'bg-blue/10 text-blue'
                  }`}>{s.badge}</span>
                  <p className="text-[10px] text-muted mt-0.5">{s.desc}</p>
                </div>
                {active && <span className={textColor}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Trade selector */}
      <div>
        <p className="label mb-2">Corps de métier</p>
        <div className="flex flex-wrap gap-2">
          {TRADES.map((t) => {
            const active = selected.includes(t.key);
            return (
              <button key={t.key} onClick={() => toggle(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                  active
                    ? 'bg-blue/15 text-blue border-blue/30'
                    : 'bg-transparent text-dim border-border hover:border-blue/20 hover:text-text'
                }`}>
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
        {selected.length > 0 && (
          <p className="text-xs text-muted mt-2">
            {selected.length} trade{selected.length > 1 ? 's' : ''} sélectionné{selected.length > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
