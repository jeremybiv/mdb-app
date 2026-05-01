import { useEffect, useState } from 'react';
import { AddressSearch } from '../components/AddressSearch.jsx';
import { ApiSteps } from '../components/ApiSteps.jsx';
import { ArtisansTable } from '../components/ArtisansTable.jsx';
import { DebugPanel } from '../components/DebugPanel.jsx';
import { PrixMarche } from '../components/PrixMarche.jsx';
import { RisquesMdb } from '../components/RisquesMdb.jsx';
import { TradeSelector } from '../components/TradeSelector.jsx';
import { ZoneCard } from '../components/ZoneCard.jsx';
import { useArtisans } from '../hooks/useArtisans.js';
import { usePLU } from '../hooks/usePLU.js';
import { computeStats, fetchTransactions } from '../lib/dvf.js';

const DEBUG_ENABLED = import.meta.env.VITE_DEBUG === 'true';
const TABS = [
  { key: 'plu',      label: 'Analyse PLU' },
  { key: 'risques',  label: 'Risques MdB' },
  { key: 'marche',   label: 'Marché DVF'  },
  { key: 'artisans', label: 'Artisans'    },
  { key: 'synthese', label: 'Synthèse'    },
];

// ── Mini composants Synthèse ──────────────────────────────

function DvfMiniCard({ stats, loading }) {
  if (loading) return (
    <div className="card flex items-center gap-2 py-3">
      <span className="dot-spin" /><span className="text-xs text-dim">Chargement DVF…</span>
    </div>
  );
  if (!stats?.bati) return (
    <div className="card py-3">
      <p className="section-label mb-2">Prix marché DVF</p>
      <p className="text-xs text-muted">Aucune donnée sur 12 mois</p>
    </div>
  );
  const { median, count } = stats.bati;
  const evo = stats.evolutionPct;
  const spark = stats.sparkline || [];
  const maxSpark = Math.max(...spark.map(s => s.median), 1);
  return (
    <div className="card">
      <p className="section-label mb-2">Prix marché DVF</p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-medium">{median?.toLocaleString('fr-FR')}</span>
        <span className="text-sm text-dim">€/m²</span>
        {evo != null && (
          <span className={`pill ml-auto ${evo >= 0 ? 'pill-green' : 'pill-red'}`}>
            {evo > 0 ? '+' : ''}{evo}%
          </span>
        )}
      </div>
      <p className="text-xs text-muted mt-1">{count} transactions · 12 mois</p>
      {spark.length > 1 && (
        <div className="flex items-end gap-0.5 h-7 mt-2.5">
          {spark.map((s, i) => {
            const h = Math.max(15, Math.round((s.median / maxSpark) * 100));
            const isLast = i === spark.length - 1;
            return (
              <div key={s.year} title={`${s.year}: ${s.median?.toLocaleString('fr-FR')}€/m²`}
                className={`flex-1 rounded-t-sm ${isLast ? 'bg-blue' : 'bg-blue/30'}`}
                style={{ height: `${h}%` }} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SocioMiniCard({ socio, commune }) {
  if (!socio) return (
    <div className="card py-3">
      <p className="section-label mb-2">Socio-éco · {commune || '—'}</p>
      <p className="text-xs text-muted">Chargement…</p>
    </div>
  );
  const { profile, score } = socio;
  const revenu   = profile?.revenus?.medianDisponible;
  const proprio  = profile?.logement?.tauxProprietaires;
  const scoreColor = score >= 70 ? 'text-green' : score >= 45 ? 'text-amber' : 'text-red';
  const barColor   = score >= 70 ? 'bg-green' : score >= 45 ? 'bg-amber' : 'bg-red';
  return (
    <div className="card">
      <p className="section-label mb-2">Socio-éco · {commune || '—'}</p>
      <div className="flex gap-2 mb-3">
        {revenu && (
          <div className="card-sm flex-1 text-center">
            <div className="text-sm font-medium">{(revenu / 1000).toFixed(0)} k€</div>
            <div className="text-[10px] text-muted mt-0.5">Revenu médian</div>
          </div>
        )}
        {proprio != null && (
          <div className="card-sm flex-1 text-center">
            <div className="text-sm font-medium">{proprio}%</div>
            <div className="text-[10px] text-muted mt-0.5">Propriétaires</div>
          </div>
        )}
      </div>
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted">Score attractivité</span>
          <span className={`font-medium ${scoreColor}`}>{score} / 100</span>
        </div>
        <div className="bar-wrap">
          <div className={`bar-fill ${barColor}`} style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}

function ArtisansTopCard({ artisans, onSearch }) {
  const top3 = (artisans || []).slice(0, 3);
  const AVATAR_COLORS = [
    'bg-blue/15 text-blue',
    'bg-amber/15 text-amber',
    'bg-green/15 text-green',
  ];
  if (!top3.length) return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <p className="section-label">Artisans</p>
        <span className="source-tag">SIRENE + RGE</span>
      </div>
      <p className="text-xs text-muted mb-3">Aucune recherche lancée</p>
      <button onClick={onSearch} className="btn-primary text-xs w-full">Trouver les artisans →</button>
    </div>
  );
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <p className="section-label">Artisans · top {top3.length}</p>
        <span className="source-tag">SIRENE + RGE</span>
      </div>
      {top3.map((a, i) => {
        const initials = (a.nom || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
        return (
          <div key={a.siren || i} className="artisan-row">
            <div className={`avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>{initials}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{a.nom}</p>
              <p className="text-[11px] text-muted truncate">{a.naf ? `NAF ${a.naf}` : ''} · {a.ville || '—'}{a.effectif ? ` · ${a.effectif} sal.` : ''}</p>
            </div>
            <div className="text-right shrink-0">
              <span className={`pill ${a.priorite === 'P1' ? 'pill-green' : a.priorite === 'P2' ? 'pill-blue' : 'pill-amber'}`}>
                {a.priorite || 'P3'}
              </span>
              <p className="text-[10px] text-muted mt-1">{a.score} pts</p>
            </div>
          </div>
        );
      })}
      <button onClick={onSearch} className="text-xs text-blue hover:underline mt-2">Voir tous les artisans →</button>
    </div>
  );
}

function RisquesMiniCard({ onOpen }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <p className="section-label">Risques MdB</p>
      </div>
      <p className="text-xs text-muted mb-3">Analyse juridique, fiscale et réglementaire de l'opération envisagée.</p>
      <button onClick={onOpen} className="btn-primary text-xs w-full">Analyser les risques →</button>
    </div>
  );
}

// ── DashboardPage ─────────────────────────────────────────
export function DashboardPage() {
  const plu      = usePLU();
  const artisans = useArtisans();
  const [trades,          setTrades]         = useState([]);
  const [source,          setSource]         = useState('sirene');
  const [debugMode,       setDebugMode]      = useState(false);
  const [activeTab,       setActiveTab]      = useState('plu');
  const [darkMode,        setDarkMode]       = useState(
    () => document.documentElement.classList.contains('dark')
  );

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };
  const [propertyType,    setPropertyType]   = useState('maison');
  const [dvfSummary,      setDvfSummary]     = useState(null);
  const [dvfLoading,      setDvfLoading]     = useState(false);

  const citycode   = plu.geo?.citycode;
  const communeNom = plu.geo?.label?.split(',').pop()?.trim();

  // Auto-fetch DVF summary when address is resolved
  useEffect(() => {
    if (!plu.geo?.lon || !citycode) return;
    setDvfSummary(null);
    setDvfLoading(true);
    fetchTransactions(plu.geo.lon, plu.geo.lat, 1500, 12, citycode)
      .then(({ transactions }) => setDvfSummary(computeStats(transactions)))
      .catch(() => setDvfSummary(null))
      .finally(() => setDvfLoading(false));
  }, [plu.geo?.lon, plu.geo?.lat, citycode]);

  const handleAddressSearch = (address) => {
    plu.reset();
    artisans.reset();
    setDvfSummary(null);
    setActiveTab('plu');
    plu.lookup(address);
  };

  const handleArtisanSearch = () => {
    const dept = plu.geo?.citycode?.substring(0, 2) || '01';
    artisans.search({
      trades, source, debug: debugMode,
      departement: dept,
      codePostal:  plu.geo?.postcode,
      citycode:    plu.geo?.citycode,
      adresse:     plu.geo?.label,
      lat: plu.geo?.lat, lon: plu.geo?.lon,
      zonePlu: plu.zone?.libelle, typeZone: plu.zone?.typezone,
    });
    setActiveTab('artisans');
  };

  return (
    <div className="min-h-screen bg-ink">

      {/* ── Header ─────────────────────────────── */}
      <header className="border-b border-border px-5 py-3.5 sticky top-0 bg-ink/95 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-blue flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="8" width="4" height="6" rx="1" fill="white"/>
              <rect x="6" y="5" width="4" height="9" rx="1" fill="white" opacity=".7"/>
              <rect x="10" y="2" width="4" height="12" rx="1" fill="white" opacity=".5"/>
            </svg>
          </div>
          <div className="shrink-0">
            <p className="text-sm font-medium text-bright leading-tight">MdB Intelligence</p>
            <p className="text-[11px] text-muted">Analyse foncière · France entière</p>
          </div>
          <div className="flex-1 flex items-center gap-2 max-w-xl">
            <select value={propertyType} onChange={e => setPropertyType(e.target.value)}
              className="input w-32 text-xs shrink-0 py-1.5">
              <option value="maison">Maison</option>
              <option value="appartement">Appartement</option>
              <option value="terrain">Terrain</option>
            </select>
            <AddressSearch onSearch={handleAddressSearch} loading={plu.status === 'loading'} />
          </div>
          <span className="pill pill-green shrink-0 hidden sm:inline-flex">
            <span className="dot dot-g" />3 APIs actives
          </span>
          <button onClick={toggleTheme} title={darkMode ? 'Mode clair' : 'Mode sombre'}
            className="p-1.5 rounded-md text-muted hover:text-dim hover:bg-border/40 transition-colors shrink-0">
            {darkMode ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-5 py-5 space-y-4">

        {/* Loading */}
        {plu.status === 'loading' && <ApiSteps steps={plu.steps} />}

        {/* Error */}
        {plu.status === 'error' && (
          <div className="card border-red/20">
            <p className="text-red text-sm">⚠ {plu.error}</p>
            <a href="https://www.geoportail-urbanisme.gouv.fr" target="_blank" rel="noopener"
              className="text-xs text-blue hover:underline mt-1 block">Géoportail →</a>
          </div>
        )}

        {/* Content */}
        {plu.status === 'done' && (
          <>
            {/* Geo context bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="pill pill-blue">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1.5A4.5 4.5 0 0 0 3.5 6c0 2.9 4.5 8.5 4.5 8.5S12.5 8.9 12.5 6A4.5 4.5 0 0 0 8 1.5Zm0 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/>
                </svg>
                {plu.geo?.label}
              </span>
              {plu.zone && (
                <span className="pill pill-amber">Zone {plu.zone.libelle}</span>
              )}
              <span className="text-xs text-muted font-mono ml-auto hidden sm:block">
                {plu.geo?.lon.toFixed(5)}, {plu.geo?.lat.toFixed(5)}
              </span>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 border-b border-border overflow-x-auto -mb-1">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`tab ${activeTab === t.key ? 'active' : ''}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Analyse PLU ───────────────────── */}
            {activeTab === 'plu' && (
              <div className="fade-in max-w-2xl">
                {plu.zone
                  ? <ZoneCard zone={plu.zone} doc={plu.doc} geo={plu.geo} commune={communeNom}
                      onAnalyzeStart={() => setActiveTab('plu')} />
                  : <div className="card py-6 text-center">
                      <p className="text-sm text-muted">Aucune zone PLU trouvée pour cette adresse.</p>
                    </div>
                }
              </div>
            )}

            {/* ── Synthèse ──────────────────────── */}
            {activeTab === 'synthese' && (
              <div className="space-y-2.5 fade-in">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                  {(dvfLoading || dvfSummary?.bati) && <DvfMiniCard stats={dvfSummary} loading={dvfLoading} />}
                  <RisquesMiniCard onOpen={() => setActiveTab('risques')} />
                </div>
                <ArtisansTopCard artisans={artisans.results}
                  onSearch={() => setActiveTab('artisans')} />
              </div>
            )}

            {/* ── Marché DVF ────────────────────── */}
            {activeTab === 'marche' && (
              <div className="fade-in">
                <PrixMarche lon={plu.geo?.lon} lat={plu.geo?.lat} commune={communeNom}
                  citycode={citycode} propertyType={propertyType} />
              </div>
            )}

            {/* ── Artisans ──────────────────────── */}
            {activeTab === 'artisans' && (
              <div className="space-y-4 fade-in">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <TradeSelector selected={trades} onChange={setTrades}
                      source={source} onSourceChange={setSource} />
                  </div>
                  <div className="flex items-end gap-2">
                    <button onClick={handleArtisanSearch}
                      disabled={!trades.length || artisans.status === 'loading'}
                      className="btn-primary flex-1 disabled:opacity-40">
                      {artisans.status === 'loading' ? 'Recherche…' : 'Trouver les artisans'}
                    </button>
                    {DEBUG_ENABLED && (
                      <button onClick={() => setDebugMode(d => !d)} title="Debug"
                        className={`px-3 py-2 text-xs rounded-md border transition-colors ${debugMode ? 'border-amber/40 text-amber bg-amber/8' : 'border-border text-muted hover:text-dim'}`}>
                        ⚙
                      </button>
                    )}
                  </div>
                </div>
                <DebugPanel data={artisans.debugData} />
                <ArtisansTable artisans={artisans.results}
                  loading={artisans.status === 'loading'}
                  error={artisans.error}
                  done={artisans.status === 'done'} />
              </div>
            )}

            {/* ── Risques MdB ───────────────────── */}
            {activeTab === 'risques' && (
              <div className="fade-in">
                <RisquesMdb
                  zone={plu.zone?.libelle}
                  typeZone={plu.zone?.typezone}
                  adresse={plu.geo?.label}
                  commune={communeNom}
                  departement={plu.geo?.citycode?.substring(0, 2)}
                  geo={plu.geo}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
