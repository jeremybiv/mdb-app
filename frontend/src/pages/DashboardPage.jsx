import { useState } from 'react';
import { AddressSearch } from '../components/AddressSearch.jsx';
import { ApiSteps } from '../components/ApiSteps.jsx';
import { ZoneCard } from '../components/ZoneCard.jsx';
import { PrixMarche } from '../components/PrixMarche.jsx';
import { SocioEco } from '../components/SocioEco.jsx';
import { RisquesMdb } from '../components/RisquesMdb.jsx';
import { ArtisansTable } from '../components/ArtisansTable.jsx';
import { TradeSelector } from '../components/TradeSelector.jsx';
import { usePLU } from '../hooks/usePLU.js';
import { useArtisans } from '../hooks/useArtisans.js';
import { getSyntheseMarche } from '../lib/api.js';

const TABS = [
  { key: 'zone',      label: '🗺 Zone PLU' },
  { key: 'marche',    label: '💶 Marché' },
  { key: 'socio',     label: '👥 Socio-éco' },
  { key: 'artisans',  label: '🔧 Artisans' },
  { key: 'risques',   label: '⚖️ Risques MdB' },
];

export function DashboardPage() {
  const plu = usePLU();
  const artisans = useArtisans();
  const [trades, setTrades] = useState([]);
  const [activeTab, setActiveTab] = useState('zone');
  const [synthese, setSynthese] = useState(null);
  const [loadingSynthese, setLoadingSynthese] = useState(false);

  const handleAddressSearch = (address) => {
    plu.reset();
    artisans.reset();
    setSynthese(null);
    plu.lookup(address);
  };

  const handleArtisanSearch = () => {
    const dept = plu.geo?.citycode?.substring(0, 2) || '01';
    artisans.search({
      trades, departement: dept,
      adresse: plu.geo?.label,
      lat: plu.geo?.lat, lon: plu.geo?.lon,
      zonePlu: plu.zone?.libelle, typeZone: plu.zone?.typezone,
    });
  };

  const handleSynthese = async (dvfStats, socioProfile) => {
    setLoadingSynthese(true);
    try {
      const d = await getSyntheseMarche({
        zone: plu.zone?.libelle,
        commune: plu.geo?.label?.split(' ').pop(),
        dvfStats, socioProfile,
        operationType: 'MdB division/valorisation',
      });
      setSynthese(d.synthese);
    } catch { setSynthese(null); }
    setLoadingSynthese(false);
  };

  const citycode = plu.geo?.citycode;
  const communeNom = plu.geo?.label?.split(',').pop()?.trim();

  return (
    <div className="min-h-screen bg-ink">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 sticky top-0 bg-ink/95 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-shrink-0">
            <h1 className="font-mono text-sm font-semibold text-bright">
              PLUiH <span className="text-muted">+</span> Market Intel
            </h1>
            <p className="text-xs text-muted">France entière · MdB Dashboard</p>
          </div>
          <div className="flex-1 w-full sm:max-w-xl">
            <AddressSearch onSearch={handleAddressSearch} loading={plu.status === 'loading'} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* API steps while loading */}
        {plu.status === 'loading' && <ApiSteps steps={plu.steps} />}

        {plu.status === 'error' && (
          <div className="card border-red/20">
            <p className="text-red text-sm">⚠ {plu.error}</p>
            <div className="mt-2 text-xs text-muted space-x-3">
              <a href="https://www.geoportail-urbanisme.gouv.fr" target="_blank" rel="noopener" className="text-blue hover:underline">Géoportail ↗</a>
            </div>
          </div>
        )}

        {/* Geo header when done */}
        {plu.status === 'done' && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-mono text-xs text-blue bg-blue/8 border border-blue/15 px-3 py-1.5 rounded-md">
              📍 {plu.geo?.label}
            </div>
            {plu.zone && (
              <div className="font-mono text-xs text-amber bg-amber/8 border border-amber/15 px-3 py-1.5 rounded-md">
                Zone {plu.zone.libelle}
              </div>
            )}
            {plu.geo && (
              <div className="font-mono text-xs text-muted">
                {plu.geo.lon.toFixed(5)}, {plu.geo.lat.toFixed(5)}
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        {plu.status === 'done' && (
          <>
            <div className="flex gap-1 border-b border-border overflow-x-auto">
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                    activeTab === t.key
                      ? 'text-blue border-blue'
                      : 'text-dim border-transparent hover:text-text'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="space-y-5">

              {activeTab === 'zone' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <ZoneCard zone={plu.zone} doc={plu.doc} geo={plu.geo} />
                  {/* Claude synthèse */}
                  {(synthese || loadingSynthese) ? (
                    <div className="card">
                      <p className="label mb-3">Brief marché · Claude</p>
                      {loadingSynthese
                        ? <div className="flex items-center gap-2"><span className="dot-spin" /><span className="text-sm text-dim">Synthèse en cours…</span></div>
                        : <p className="text-sm text-dim leading-relaxed">{synthese}</p>
                      }
                    </div>
                  ) : null}
                </div>
              )}

              {activeTab === 'marche' && (
                <div className="space-y-5">
                  <PrixMarche lon={plu.geo?.lon} lat={plu.geo?.lat} citycode={citycode} commune={communeNom} />
                  {!synthese && (
                    <button onClick={() => handleSynthese(null, null)} disabled={loadingSynthese}
                      className="btn-primary text-xs disabled:opacity-40">
                      {loadingSynthese ? '⏳ Génération…' : '✦ Générer le brief marché Claude'}
                    </button>
                  )}
                  {synthese && (
                    <div className="card">
                      <p className="label mb-3">Brief marché · Claude</p>
                      <p className="text-sm text-dim leading-relaxed">{synthese}</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'socio' && (
                <SocioEco citycode={citycode} communeNom={communeNom} />
              )}

              {activeTab === 'artisans' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                      <TradeSelector selected={trades} onChange={setTrades} />
                    </div>
                    <div className="flex items-end">
                      <button onClick={handleArtisanSearch}
                        disabled={!trades.length || artisans.status === 'loading'}
                        className="btn-primary w-full disabled:opacity-40">
                        {artisans.status === 'loading' ? '⏳ Recherche…' : '🔍 Trouver les artisans'}
                      </button>
                    </div>
                  </div>
                  <ArtisansTable
                    artisans={artisans.results}
                    loading={artisans.status === 'loading'}
                    error={artisans.error}
                  />
                </div>
              )}

              {activeTab === 'risques' && (
                <RisquesMdb
                  zone={plu.zone?.libelle}
                  typeZone={plu.zone?.typezone}
                  adresse={plu.geo?.label}
                  commune={communeNom}
                  departement={plu.geo?.citycode?.substring(0, 2)}
                  geo={plu.geo}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
