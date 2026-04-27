import axios from 'axios';

axios.interceptors.request.use((config) => {
  const url = new URL(config.url, config.baseURL || 'http://x');
  Object.entries(config.params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  console.log(`\n→ ${config.method?.toUpperCase()} ${url.toString()}`);
  return config;
});

axios.interceptors.response.use(
  (res) => {
    const count = res.data?.results?.length ?? res.data?.features?.length ?? res.data?.count ?? '?';
    console.log(`← ${res.status} ${res.config.url}  (résultats: ${count})`);
    return res;
  },
  (err) => {
    const status  = err.response?.status ?? 'NO_RESPONSE';
    const url     = err.config?.url ?? '?';
    const detail  = err.response?.data ?? err.message;
    console.error(`✗ ${status} ${url}`);
    console.error('  detail:', JSON.stringify(detail).slice(0, 300));
    if (err.code === 'ECONNREFUSED')  console.error('  → Le serveur distant refuse la connexion (URL incorrecte ou service hors ligne)');
    if (err.code === 'ENOTFOUND')     console.error('  → DNS introuvable — vérifier le nom de domaine');
    if (err.code === 'ETIMEDOUT')     console.error('  → Timeout — le serveur ne répond pas dans les délais');
    return Promise.reject(err);
  }
);
