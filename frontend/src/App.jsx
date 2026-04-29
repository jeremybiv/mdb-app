import { useState } from 'react';
import { LoginPage } from './components/LoginPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { AddressSearch } from './components/AddressSearch.jsx';
import { ApiSteps } from './components/ApiSteps.jsx';
import { ZoneCard } from './components/ZoneCard.jsx';
import { TradeSelector } from './components/TradeSelector.jsx';
import { ArtisansTable } from './components/ArtisansTable.jsx';
import { usePLU } from './hooks/usePLU.js';
import { useArtisans } from './hooks/useArtisans.js';

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('auth_token'));
  const [mode,   setMode]   = useState('dashboard');

  if (!authed) return <LoginPage onAuth={() => setAuthed(true)} />;

  return mode === 'dashboard'
    ? <DashboardPage onSwitchSimple={() => setMode('simple')} />
    : <SimplePage onSwitchDash={() => setMode('dashboard')} />;
}

// Original simple view (app existante)
function SimplePage({ onSwitchDash }) {
  const plu = usePLU();
  const artisans = useArtisans();
  const [trades, setTrades] = useState([]);

  const handleSearch = (address) => { plu.reset(); artisans.reset(); plu.lookup(address); };
  const handleArtisanSearch = () => {
    const dept = plu.geo?.citycode?.substring(0, 2) || '01';
    artisans.search({ trades, departement: dept, adresse: plu.geo?.label, lat: plu.geo?.lat, lon: plu.geo?.lon, zonePlu: plu.zone?.libelle });
  };

  return (
    <div className="min-h-screen bg-ink">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-semibold text-bright">PLUiH <span className="text-muted">+</span> Artisans</h1>
            <p className="text-xs text-muted mt-0.5">France entière</p>
          </div>
          <button onClick={onSwitchDash} className="btn-primary text-xs">→ Dashboard MdB</button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="card">
          <p className="label mb-3">Adresse</p>
          <AddressSearch onSearch={handleSearch} loading={plu.status === 'loading'} />
        </div>
        {(plu.status === 'loading' || plu.status === 'error') && <ApiSteps steps={plu.steps} />}
        {plu.status === 'error' && <div className="card border-red/20"><p className="text-red text-sm">⚠ {plu.error}</p></div>}
        {plu.status === 'done' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ZoneCard zone={plu.zone} doc={plu.doc} geo={plu.geo} />
            <div className="space-y-4">
              <TradeSelector selected={trades} onChange={setTrades} />
              <button onClick={handleArtisanSearch} disabled={!trades.length || artisans.status === 'loading'}
                className="btn-primary w-full disabled:opacity-40">
                {artisans.status === 'loading' ? '⏳ Recherche…' : '🔍 Trouver les artisans'}
              </button>
            </div>
          </div>
        )}
        {(artisans.status === 'loading' || artisans.results.length > 0 || artisans.status === 'error') && (
          <ArtisansTable artisans={artisans.results} loading={artisans.status === 'loading'} error={artisans.error} />
        )}
      </main>
    </div>
  );
}
