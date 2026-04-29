import { useState, useEffect } from 'react';
import { interpretZone } from '../lib/api.js';
import { matchZone } from '../lib/zones.js';
import { getParcelle } from '../lib/ign.js';

const DEBUG_ENABLED = import.meta.env.VITE_DEBUG === 'true';

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

function parseZoneMetrics(info) {
  const ces     = info?.desc?.match(/CES\s*([\d,]+)/i)?.[1] || info?.desc?.match(/([\d]+)%/)?.[1];
  const hauteur = info?.desc?.match(/R\+(\d)/i)?.[1]
    ? `R+${info.desc.match(/R\+(\d)/i)[1]}`
    : info?.desc?.match(/(\d+)\s*m/i)?.[1]
      ? `${info.desc.match(/(\d+)\s*m/i)[1]} m`
      : null;
  return { ces: ces ? `${ces}%` : null, hauteur };
}

function DebugPanel({ zone, doc, geo, parcelle, analysis, logs }) {
  return (
    <div className="space-y-3 text-[11px] font-mono">
      {/* GPU doc — clé pour diagnostiquer le lien PLU */}
      <div>
        <p className="text-muted mb-1 uppercase tracking-wide">GPU document</p>
        <pre className="bg-ink rounded p-2 overflow-x-auto text-dim whitespace-pre-wrap break-all">
          {JSON.stringify(doc, null, 2)}
        </pre>
      </div>
      <div>
        <p className="text-muted mb-1 uppercase tracking-wide">Zone PLU</p>
        <pre className="bg-ink rounded p-2 overflow-x-auto text-dim whitespace-pre-wrap break-all">
          {JSON.stringify(zone, null, 2)}
        </pre>
      </div>
      {parcelle && (
        <div>
          <p className="text-muted mb-1 uppercase tracking-wide">Parcelle cadastrale</p>
          <pre className="bg-ink rounded p-2 overflow-x-auto text-dim whitespace-pre-wrap break-all">
            {JSON.stringify(parcelle, null, 2)}
          </pre>
        </div>
      )}
      {geo && (
        <div>
          <p className="text-muted mb-1 uppercase tracking-wide">Géo</p>
          <pre className="bg-ink rounded p-2 overflow-x-auto text-dim whitespace-pre-wrap break-all">
            {JSON.stringify(geo, null, 2)}
          </pre>
        </div>
      )}
      {logs.length > 0 && (
        <div>
          <p className="text-muted mb-1 uppercase tracking-wide">Logs Claude</p>
          <div className="bg-ink rounded p-2 space-y-1">
            {logs.map((l, i) => (
              <p key={i} className={`${l.type === 'error' ? 'text-red' : l.type === 'warn' ? 'text-amber' : 'text-dim'}`}>
                {l.type === 'error' ? '✗' : l.type === 'warn' ? '⚠' : '›'} {l.msg}
              </p>
            ))}
          </div>
        </div>
      )}
      {analysis && (
        <div>
          <p className="text-muted mb-1 uppercase tracking-wide">Réponse brute Claude</p>
          <pre className="bg-ink rounded p-2 overflow-x-auto text-dim whitespace-pre-wrap text-[10px]">
            {analysis}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ZoneCard({ zone, doc, geo, commune, onAnalyzeStart }) {
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
  const [parcelle,  setParcelle]  = useState(null);
  const [debugMode, setDebugMode] = useState(false);
  const [logs,      setLogs]      = useState([]);

  const addLog = (msg, type = 'info') => setLogs(l => [...l, { msg, type }]);

  useEffect(() => {
    if (!geo?.lon || !geo?.lat) return;
    addLog(`Fetch parcelle → lon=${geo.lon} lat=${geo.lat}`);
    getParcelle(geo.lon, geo.lat)
      .then(p => {
        setParcelle(p);
        addLog(p ? `Parcelle trouvée : ${p.id}` : 'Aucune parcelle trouvée');
      })
      .catch(e => addLog(`Parcelle error: ${e.message}`, 'error'));
  }, [geo?.lon, geo?.lat]);

  // Lien PLU : urlfic (PDF direct) en priorité, sinon GPU portail
  const pluUrl = zone?.urlfic
    ? zone.urlfic
    : doc?.urlbase
      ? doc.urlbase
      : doc?.partition
        ? `https://www.geoportail-urbanisme.gouv.fr/map/#tile=7&lon=${geo?.lon}&lat=${geo?.lat}&zoom=16&partition=${doc.partition}`
        : `https://www.geoportail-urbanisme.gouv.fr/map/#tile=7&lon=${geo?.lon}&lat=${geo?.lat}&zoom=16`;

  // ID parcelle : retourné par l'API ou reconstruit depuis citycode + section + numero
  const parcelleId = parcelle?.id
    || (geo?.citycode && parcelle?.section && parcelle?.numero
      ? `${geo.citycode}000${parcelle.section}${parcelle.numero}`
      : null);

  const cadastreUrl = parcelleId
    ? `https://cadastre.data.gouv.fr/map?style=ortho&parcelleId=${parcelleId}#18/${geo.lat}/${geo.lon}`
    : null;

  const handleInterpret = async () => {
    onAnalyzeStart?.();
    setLoadingAI(true);
    addLog(`Envoi requête Claude — zone=${libelle} commune=${commune}`);
    try {
      const data = await interpretZone({
        zone: libelle,
        typeZone: zone.typezone,
        destDomi: zone.destdomi,
        commune,
      });
      addLog(`Réponse Claude reçue — ${data.analysis?.length} caractères${data.fromCache ? ' (cache)' : ''}`);
      setAnalysis(data.analysis);
    } catch (e) {
      addLog(`Erreur Claude: ${e.message}`, 'error');
      setAnalysis('Erreur lors de l\'analyse Claude.');
    }
    setLoadingAI(false);
  };

  return (
    <div className="card fade-in space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p className="section-label">Zone PLU</p>
        <div className="flex items-center gap-2">
          {DEBUG_ENABLED && (
            <button onClick={() => setDebugMode(d => !d)} title="Mode debug"
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                debugMode ? 'border-amber/40 text-amber bg-amber/8' : 'border-border text-muted hover:text-dim'
              }`}>
              debug
            </button>
          )}
          <span className="source-tag">IGN GPU</span>
        </div>
      </div>

      {/* Zone badge + type */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="zone-badge">{libelle}</span>
        {typeLabel && <span className={`pill ${typeColor}`}>{typeLabel}</span>}
        {!info?.constructible && <span className="pill pill-red">Inconstructible</span>}
        {info?.warning        && <span className="pill pill-amber">CU conseillé</span>}
      </div>

      {/* Parcelle cadastrale */}
      {(parcelle?.section || parcelle?.numero) && (
        <div className="flex items-center justify-between gap-3 bg-blue/5 border border-blue/15 rounded-md px-3 py-2.5">
          <div>
            <p className="text-[10px] text-muted mb-0.5 uppercase tracking-wide">Parcelle cadastrale</p>
            <p className="text-sm font-mono font-semibold text-text">
              Section {parcelle.section} &nbsp;·&nbsp; n°{parcelle.numero}
            </p>
          </div>
          {cadastreUrl && (
            <a href={cadastreUrl} target="_blank" rel="noopener"
              className="text-[11px] font-mono text-blue hover:underline flex items-center gap-1 shrink-0">
              {parcelleId}
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
                <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
              </svg>
            </a>
          )}
        </div>
      )}

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
          { k: 'Type',        v: zone.typezone || libelle },
          { k: 'Destination', v: zone.destdomi || '—' },
          { k: 'Document',    v: doc?.nom || 'PLUiH' },
          { k: 'Approuvé',    v: doc?.datappro || '—' },
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
          className="btn-primary w-full text-left text-xs px-3 py-2.5">
          {loadingAI
            ? <span className="flex items-center gap-2"><span className="dot-spin" />Analyse Claude en cours…</span>
            : 'Analyser avec Claude (PLU officiel) →'}
        </button>
      ) : (
        <div className="bg-blue/5 border border-blue/15 rounded-md p-3.5 space-y-3">
          <p className="section-label mb-2">Analyse réglementaire · Claude</p>
          <MdLite text={analysis} />
          <a href={pluUrl} target="_blank" rel="noopener"
            className="flex items-center gap-1.5 text-[11px] text-blue hover:underline pt-1">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
              <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
            </svg>
            {zone?.urlfic ? 'Règlement PLU officiel (PDF) ↗' : 'Consulter le PLU officiel · Géoportail Urbanisme'}
          </a>
        </div>
      )}

      {/* Debug panel */}
      {debugMode && (
        <div className="border border-amber/20 rounded-md p-3 bg-amber/5">
          <p className="text-[10px] font-medium text-amber uppercase tracking-wide mb-3">Mode debug</p>
          <DebugPanel zone={zone} doc={doc} geo={geo} parcelle={parcelle} analysis={analysis} logs={logs} />
        </div>
      )}

      <p className="text-[10px] text-muted">API Carto IGN · Données indicatives — vérifier en mairie</p>
    </div>
  );
}
