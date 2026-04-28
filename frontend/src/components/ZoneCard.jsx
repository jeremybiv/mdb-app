import { matchZone } from '../lib/zones.js';
import { useState } from 'react';
import { interpretZone } from '../lib/api.js';

function MdLite({ text }) {
  const bold = (s) => {
    const parts = s.split(/\*\*(.+?)\*\*/g);
    return parts.map((p, i) => i % 2 === 1 ? <strong key={i} className="text-text font-semibold">{p}</strong> : p);
  };
  return (
    <div className="space-y-1.5 text-sm text-dim leading-relaxed">
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (/^\*\*\d+\./.test(line))
          return <p key={i} className="font-semibold text-text mt-3 mb-1">{bold(line)}</p>;
        if (line.startsWith('- '))
          return <p key={i} className="pl-3 before:content-['·'] before:mr-2 before:text-blue">{bold(line.slice(2))}</p>;
        return <p key={i}>{bold(line)}</p>;
      })}
    </div>
  );
}

export function ZoneCard({ zone, doc, geo, commune }) {
  const libelle = zone.libelle || zone.typezone || '—';
  const info = matchZone(libelle);
  const badgeClass = info
    ? `badge-${info.color} text-2xl px-4 py-1.5 rounded-md inline-block mb-3`
    : 'badge-dim text-2xl px-4 py-1.5 rounded-md inline-block mb-3';

  const [analysis, setAnalysis] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const handleInterpret = async () => {
    setLoadingAI(true);
    try {
      const data = await interpretZone({
        zone: libelle,
        typeZone: zone.typezone,
        destDomi: zone.destdomi,
        commune,
      });
      setAnalysis(data.analysis);
    } catch {
      setAnalysis('Erreur lors de l\'analyse Claude.');
    }
    setLoadingAI(false);
  };

  return (
    <div className="card fade-in space-y-4">
      <p className="label">Zone PLUiH identifiée</p>

      <div>
        <div className={badgeClass}>{libelle}</div>
        {info && (
          <div>
            <p className="text-sm font-medium text-bright mb-1">{info.label}</p>
            <p className="text-sm text-dim">{info.desc}</p>
            {info.warning && (
              <p className="text-xs text-amber mt-1">⚠ CU informatif recommandé avant tout projet</p>
            )}
            {!info.constructible && (
              <p className="text-xs text-red mt-1 font-medium">⚠ Zone inconstructible</p>
            )}
          </div>
        )}
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { k: 'Type de zone', v: zone.typezone || libelle },
          { k: 'Destination dominante', v: zone.destdomi || '—' },
          { k: 'Coordonnées', v: geo ? `${geo.lon.toFixed(5)}, ${geo.lat.toFixed(5)}` : '—' },
          { k: 'Partition GPU', v: zone.partition || '—' },
          { k: 'Document', v: doc?.nom || 'PLUiH CCPG' },
          { k: 'Approuvé', v: doc?.datappro || '27/02/2020' },
        ].map(({ k, v }) => (
          <div key={k} className="bg-ink border border-border rounded p-2.5">
            <p className="label mb-1">{k}</p>
            <p className="font-mono text-xs text-text">{v}</p>
          </div>
        ))}
      </div>

      {/* Claude analysis */}
      {!analysis && (
        <button onClick={handleInterpret} disabled={loadingAI} className="btn-primary text-xs disabled:opacity-40">
          {loadingAI ? '⏳ Analyse Claude en cours…' : '✦ Interpréter la zone avec Claude'}
        </button>
      )}
      {analysis && (
        <div className="bg-blue/5 border border-blue/15 rounded-md p-4">
          <p className="label mb-2">Analyse réglementaire · Claude</p>
          <MdLite text={analysis} />
        </div>
      )}

      <p className="text-xs text-muted">
        Source : API Carto IGN · PLUiH CCPG approuvé 27/02/2020 · Données indicatives — vérification mairie recommandée
      </p>
    </div>
  );
}
