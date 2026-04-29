import { useState } from 'react';
import { login } from '../lib/api.js';

export function LoginPage({ onAuth }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      onAuth();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-9 h-9 rounded-md bg-blue flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="8" width="4" height="6" rx="1" fill="white"/>
              <rect x="6" y="5" width="4" height="9" rx="1" fill="white" opacity=".7"/>
              <rect x="10" y="2" width="4" height="12" rx="1" fill="white" opacity=".5"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-bright leading-tight">MdB Intelligence</p>
            <p className="text-[11px] text-muted">Analyse foncière · France entière</p>
          </div>
        </div>

        {/* Form */}
        <div className="card space-y-4">
          <p className="section-label">Connexion</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <p className="text-[10px] text-muted mb-1">Email</p>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="invite@mdb.app" required autoFocus
                className="input text-sm" />
            </div>
            <div>
              <p className="text-[10px] text-muted mb-1">Mot de passe</p>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                className="input text-sm" />
            </div>

            {error && <p className="text-xs text-red">⚠ {error}</p>}

            <button type="submit" disabled={loading || !email || !password}
              className="btn-primary w-full disabled:opacity-40">
              {loading
                ? <span className="flex items-center justify-center gap-2"><span className="dot-spin" />Connexion…</span>
                : 'Se connecter'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
