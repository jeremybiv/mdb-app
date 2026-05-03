import { useState } from 'react';
import { AddressSearch } from './AddressSearch.jsx';
import { ApiSteps } from './ApiSteps.jsx';
import { ArtisansTable } from './ArtisansTable.jsx';
import { DebugPanel } from './DebugPanel.jsx';
import { PrixMarche } from './PrixMarche.jsx';
import { RisquesMdb } from './RisquesMdb.jsx';
import { TradeSelector } from './TradeSelector.jsx';
import { ZoneCard } from './ZoneCard.jsx';

const DEBUG_ENABLED = import.meta.env.VITE_DEBUG === 'true';

// ── Icons ────────────────────────────────────────────────
const IconMap = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 11 12 2 21 11 21 22 15 22 15 15 9 15 9 22 3 22"/>
  </svg>
);
const IconShield = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IconChart = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);
const IconWrench = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);
const IconGrid = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
);
const IconSun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const IconMoon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

// ── Bottom Nav Tab Config ────────────────────────────────
const MOBILE_TABS = [
  { key: 'plu',      label: 'PLU',      Icon: IconMap    },
  { key: 'risques',  label: 'Risques',  Icon: IconShield },
  { key: 'marche',   label: 'Marché',   Icon: IconChart  },
  { key: 'artisans', label: 'Artisans', Icon: IconWrench },
  { key: 'synthese', label: 'Synthèse', Icon: IconGrid   },
];

// ── Mini cards ───────────────────────────────────────────
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

function ArtisansTopCard({ artisans, onSearch }) {
  const top3 = (artisans || []).slice(0, 3);
  const AVATAR_COLORS = ['bg-blue/15 text-blue', 'bg-amber/15 text-amber', 'bg-green/15 text-green'];
  if (!top3.length) return (
    <div className="card">
      <p className="section-label mb-2">Artisans</p>
      <p className="text-xs text-muted mb-3">Aucune recherche lancée</p>
      <button onClick={onSearch} className="btn-primary text-xs w-full">Trouver les artisans →</button>
    </div>
  );
  return (
    <div className="card">
      <p className="section-label mb-2">Artisans · top {top3.length}</p>
      {top3.map((a, i) => {
        const initials = (a.nom || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
        return (
          <div key={a.siren || i} className="artisan-row">
            <div className={`avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>{initials}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{a.nom}</p>
              <p className="text-[11px] text-muted truncate">{a.naf ? `NAF ${a.naf}` : ''} · {a.ville || '—'}</p>
            </div>
            <span className={`pill ${a.priorite === 'P1' ? 'pill-green' : a.priorite === 'P2' ? 'pill-blue' : 'pill-amber'}`}>
              {a.priorite || 'P3'}
            </span>
          </div>
        );
      })}
      <button onClick={onSearch} className="text-xs text-blue hover:underline mt-2">Voir tous →</button>
    </div>
  );
}

// ── MobileDashboard ──────────────────────────────────────
export function MobileDashboard({
  plu, artisans,
  trades, setTrades,
  source, setSource,
  propertyType, setPropertyType,
  activeTab, setActiveTab,
  darkMode, toggleTheme,
  dvfSummary, dvfLoading,
  communeNom, citycode,
  onAddressSearch, onArtisanSearch,
  debugMode, setDebugMode,
}) {
  const hasResult = plu.status === 'done';

  return (
    <div className="fixed inset-0 flex flex-col bg-ink overflow-hidden">

      {/* ── Top bar ──────────────────────────────── */}
      <div className="shrink-0 border-b border-border px-4 py-3 flex items-center gap-3 bg-ink/95 backdrop-blur">
        <div className="w-7 h-7 rounded-md bg-blue flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="8" width="4" height="6" rx="1" fill="white"/>
            <rect x="6" y="5" width="4" height="9" rx="1" fill="white" opacity=".7"/>
            <rect x="10" y="2" width="4" height="12" rx="1" fill="white" opacity=".5"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          {hasResult ? (
            <div className="flex items-center gap-1.5 overflow-hidden">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="text-blue shrink-0">
                <path d="M8 1.5A4.5 4.5 0 0 0 3.5 6c0 2.9 4.5 8.5 4.5 8.5S12.5 8.9 12.5 6A4.5 4.5 0 0 0 8 1.5Zm0 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/>
              </svg>
              <span className="text-xs text-text truncate">{plu.geo?.label}</span>
              {plu.zone && (
                <span className="pill pill-amber text-[10px] shrink-0">Zone {plu.zone.libelle}</span>
              )}
            </div>
          ) : (
            <p className="text-sm font-medium text-bright">MdB Intelligence</p>
          )}
        </div>
        <button onClick={toggleTheme}
          className="p-1.5 rounded-md text-muted hover:text-dim hover:bg-border/40 transition-colors shrink-0">
          {darkMode ? <IconSun /> : <IconMoon />}
        </button>
      </div>

      {/* ── Main scrollable content ───────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">

        {/* ── No address yet: hero search screen ── */}
        {!hasResult && plu.status !== 'loading' && (
          <div className="flex flex-col items-center justify-center min-h-full px-6 pb-24 pt-8">
            <div className="w-16 h-16 rounded-2xl bg-blue/10 border border-blue/20 flex items-center justify-center mb-6">
              <svg width="32" height="32" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="8" width="4" height="6" rx="1" fill="currentColor" className="text-blue" style={{fill:'rgb(var(--blue))'}}/>
                <rect x="6" y="5" width="4" height="9" rx="1" fill="currentColor" style={{fill:'rgb(var(--blue))',opacity:.7}}/>
                <rect x="10" y="2" width="4" height="12" rx="1" fill="currentColor" style={{fill:'rgb(var(--blue))',opacity:.5}}/>
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-bright text-center mb-1">Analyse foncière</h1>
            <p className="text-sm text-muted text-center mb-8">PLU · Risques · Marché · Artisans</p>

            <div className="w-full max-w-sm space-y-3">
              <select
                value={propertyType}
                onChange={e => setPropertyType(e.target.value)}
                className="input text-base py-3 text-center"
              >
                <option value="maison">Maison</option>
                <option value="appartement">Appartement</option>
                <option value="terrain">Terrain</option>
              </select>

              <MobileSearchForm onSearch={onAddressSearch} loading={false} />
            </div>

            {plu.status === 'error' && (
              <div className="mt-4 w-full max-w-sm card border-red/20">
                <p className="text-red text-sm">⚠ {plu.error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Loading ─────────────────────────── */}
        {plu.status === 'loading' && (
          <div className="px-4 pt-6 pb-24">
            <ApiSteps steps={plu.steps} />
          </div>
        )}

        {/* ── Done: tab content ────────────────── */}
        {hasResult && (
          <div className="px-4 pt-4 pb-24 space-y-4">

            {/* ── Analyse PLU ── */}
            {activeTab === 'plu' && (
              <div className="fade-in">
                {plu.zone
                  ? <ZoneCard zone={plu.zone} doc={plu.doc} geo={plu.geo} commune={communeNom}
                      onAnalyzeStart={() => setActiveTab('plu')} />
                  : <div className="card py-6 text-center">
                      <p className="text-sm text-muted">Aucune zone PLU pour cette adresse.</p>
                    </div>
                }
              </div>
            )}

            {/* ── Risques ── */}
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

            {/* ── Marché ── */}
            {activeTab === 'marche' && (
              <div className="fade-in">
                <PrixMarche
                  lon={plu.geo?.lon} lat={plu.geo?.lat}
                  commune={communeNom} citycode={citycode}
                  propertyType={propertyType}
                />
              </div>
            )}

            {/* ── Artisans ── */}
            {activeTab === 'artisans' && (
              <div className="space-y-4 fade-in">
                <TradeSelector
                  selected={trades} onChange={setTrades}
                  source={source} onSourceChange={setSource}
                />
                <button
                  onClick={onArtisanSearch}
                  disabled={!trades.length || artisans.status === 'loading'}
                  className="btn-primary w-full py-3 text-base disabled:opacity-40"
                >
                  {artisans.status === 'loading' ? 'Recherche…' : 'Trouver les artisans'}
                </button>
                <DebugPanel data={artisans.debugData} />
                <ArtisansTable
                  artisans={artisans.results}
                  loading={artisans.status === 'loading'}
                  error={artisans.error}
                  done={artisans.status === 'done'}
                />
              </div>
            )}

            {/* ── Synthèse ── */}
            {activeTab === 'synthese' && (
              <div className="space-y-3 fade-in">
                <div className="card">
                  <p className="section-label mb-3">Changer d'adresse</p>
                  <select
                    value={propertyType}
                    onChange={e => setPropertyType(e.target.value)}
                    className="input text-sm mb-2"
                  >
                    <option value="maison">Maison</option>
                    <option value="appartement">Appartement</option>
                    <option value="terrain">Terrain</option>
                  </select>
                  <MobileSearchForm onSearch={onAddressSearch} loading={plu.status === 'loading'} compact />
                </div>
                {(dvfLoading || dvfSummary?.bati) && <DvfMiniCard stats={dvfSummary} loading={dvfLoading} />}
                <div className="card">
                  <p className="section-label mb-3">Risques MdB</p>
                  <p className="text-xs text-muted mb-3">Analyse juridique, fiscale et réglementaire.</p>
                  <button onClick={() => setActiveTab('risques')} className="btn-primary text-sm w-full">
                    Analyser les risques →
                  </button>
                </div>
                <ArtisansTopCard artisans={artisans.results} onSearch={() => setActiveTab('artisans')} />
              </div>
            )}

          </div>
        )}
      </div>

      {/* ── Bottom nav (only when address is set) ─── */}
      {hasResult && (
        <nav className="shrink-0 border-t border-border bg-ink/95 backdrop-blur safe-bottom">
          <div className="flex">
            {MOBILE_TABS.map(({ key, label, Icon }) => {
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors
                    ${active ? 'text-blue' : 'text-muted'}`}
                >
                  <Icon />
                  <span className="text-[10px] font-medium leading-tight">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

// ── Inline search form for mobile ────────────────────────
function MobileSearchForm({ onSearch, loading, compact }) {
  const [address, setAddress] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (address.trim()) onSearch(address.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        className={`input w-full ${compact ? 'py-2 text-sm' : 'py-3.5 text-base'}`}
        placeholder="ex: 10 rue de la Paix, Paris"
        value={address}
        onChange={e => setAddress(e.target.value)}
        disabled={loading}
        autoComplete="street-address"
      />
      <button
        type="submit"
        disabled={loading || !address.trim()}
        className={`w-full btn-primary disabled:opacity-40 disabled:cursor-not-allowed
          ${compact ? 'py-2 text-sm' : 'py-3.5 text-base font-semibold'}`}
      >
        {loading ? 'Analyse en cours…' : 'Analyser cette adresse'}
      </button>
    </form>
  );
}
