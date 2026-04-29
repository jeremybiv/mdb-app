import { useState } from 'react';
import { interpretZone } from '../lib/api.js';
import { matchZone } from '../lib/zones.js';

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

// Essaie d'extraire CES et hauteur depuis la description de zone
function parseZoneMetrics(info) {
  const ces     = info?.desc?.match(/CES\s*([\d,]+)/i)?.[1] || info?.desc?.match(/([\d]+)%/)?.[1];
  const hauteur = info?.desc?.match(/R\+(\d)/i)?.[1]
    ? `R+${info.desc.match(/R\+(\d)/i)[1]}`
    : info?.desc?.match(/(\d+)\s*m/i)?.[1]
      ? `${info.desc.match(/(\d+)\s*m/i)[1]} m`
      : null;
  return { ces: ces ? `${ces}%` : null, hauteur };
}

export function ZoneCard({ zone, doc, geo, commune }) {
  const libelle = zone.libelle || zone.typezone || '—';
  const info    = matchZone(libelle);
  const metrics = parseZoneMetrics(info);

  const typeLabel = info?.label || zone.typezone || null;
  const typeColor = info?.color === 'green' ? 'pill-green'
    : info?.color === 'amber' ? 'pill-amber'
    : info?.color === 'red'   ? 'pill-red'
    : 'pill-gray';

  const [analysis,  setAnalysis]  = useState(null);
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
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p className="section-label">Zone PLU</p>
        <span className="source-tag">IGN GPU</span>
      </div>

      {/* Zone badge + type */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="zone-badge">{libelle}</span>
        {typeLabel && <span className={`pill ${typeColor}`}>{typeLabel}</span>}
        {!info?.constructible && (
          <span className="pill pill-red">Inconstructible</span>
        )}
        {info?.warning && (
          <span className="pill pill-amber">CU conseillé</span>
        )}
      </div>

      {/* Description + métriques : uniquement après analyse Claude */}
      {analysis && info?.desc && (
        <p className="text-xs text-dim leading-relaxed">{info.desc}</p>
      )}

      {analysis && (metrics.ces || metrics.hauteur) && (
        <>
          <hr className="border-border" />
          <div className="grid grid-cols-2 gap-2">
            {metrics.ces && (
              <div className="card-sm">
                <p className="text-[10px] text-muted mb-1">Emprise sol (typ.)</p>
                <p className="text-base font-medium">{metrics.ces}</p>
              </div>
            )}
            {metrics.hauteur && (
              <div className="card-sm">
                <p className="text-[10px] text-muted mb-1">Hauteur max (typ.)</p>
                <p className="text-base font-medium">{metrics.hauteur}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Metadata compact */}
      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        {[
          { k: 'Type', v: zone.typezone || libelle },
          { k: 'Destination', v: zone.destdomi || '—' },
          { k: 'Document', v: doc?.nom || 'PLUiH' },
          { k: 'Approuvé', v: doc?.datappro || '—' },
        ].map(({ k, v }) => (
          <div key={k} className="flex gap-1">
            <span className="text-muted shrink-0">{k} :</span>
            <span className="text-dim truncate">{v}</span>
          </div>
        ))}
      </div>

      {/* Claude analysis */}
      {!analysis ? (
        <button onClick={handleInterpret} disabled={loadingAI}
          className="btn-primary w-full text-left text-xs px-3 py-2.5 border border-border rounded-md ">
          {loadingAI
            ? <span className="flex items-center gap-2"><span className="dot-spin" />Analyse Claude en cours…</span>
            : 'Analyser avec Claude (PLU officiel) →'}
        </button>
      ) : (
        <div className="bg-blue/5 border border-blue/15 rounded-md p-3.5">
          <p className="section-label mb-2">Analyse réglementaire · Claude</p>
          <MdLite text={analysis} />
        </div>
      )}

      <p className="text-[10px] text-muted">API Carto IGN · Données indicatives — vérifier en mairie</p>
    </div>
  );
}
