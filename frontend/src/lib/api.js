const BASE = import.meta.env.VITE_API_URL || '';

const getToken = () => localStorage.getItem('auth_token');

export function authHeaders(extra = {}) {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (r.status === 401) { logout(); return; }
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${r.status}`);
  }
  return r.json();
}

async function get(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null));
  const r = await fetch(`${BASE}${path}${qs.toString() ? '?' + qs : ''}`, { headers: authHeaders() });
  if (r.status === 401) { logout(); return; }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export const login  = (email, password) =>
  fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(async r => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Erreur connexion');
    localStorage.setItem('auth_token', d.token);
    return d;
  });

export const logout = () => {
  localStorage.removeItem('auth_token');
  window.location.reload();
};

// ── Pappers (via backend proxy) ───────────────────────────
export const searchArtisans = (body) => post('/api/pappers/search', body);

// ── Claude (via backend) ──────────────────────────────────
export const interpretZone  = (body) => post('/api/claude/interpret-zone', body);
export const refineSearch   = (body) => post('/api/claude/refine-search', body);

// ── Claude — new endpoints ────────────────────────────────
export const getRisquesMdb      = (body) => post('/api/claude/risques-mdb', body);
export const getSyntheseMarche  = (body) => post('/api/claude/synthese-marche', body);

// ── Cache KV (read via backend) ───────────────────────────
export const getSavedArtisans  = (params) => get('/api/cache/artisans', params);
export const getRecentSearches = (params) => get('/api/cache/recherches', params);
