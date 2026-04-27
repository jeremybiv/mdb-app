import { TRADES } from '../lib/zones.js';

export function TradeSelector({ selected, onChange }) {
  const toggle = (key) => {
    onChange(
      selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
    );
  };

  return (
    <div className="card space-y-3">
      <p className="label">Corps de métier</p>
      <div className="flex flex-wrap gap-2">
        {TRADES.map((t) => {
          const active = selected.includes(t.key);
          return (
            <button
              key={t.key}
              onClick={() => toggle(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                active
                  ? 'bg-blue/15 text-blue border-blue/30'
                  : 'bg-transparent text-dim border-border hover:border-blue/20 hover:text-text'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-muted">{selected.length} trade{selected.length > 1 ? 's' : ''} sélectionné{selected.length > 1 ? 's' : ''}</p>
      )}
    </div>
  );
}
