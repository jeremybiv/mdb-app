import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envDir: '..', // lit le .env à la racine du projet
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (_, req) => {
            console.log(`[proxy →] ${req.method} ${req.url}`);
          });
          proxy.on('proxyRes', (res, req) => {
            console.log(`[proxy ←] ${res.statusCode} ${req.url}`);
          });
          proxy.on('error', (err, req) => {
            console.error(`[proxy ERR] ${req.url} — ${err.code || err.message}`);
            console.error(`  target: http://localhost:3001`);
            console.error(`  hint: le backend tourne-t-il sur :3001 ? (npm run dev --workspace=backend)`);
          });
        },
      },
    },
  },
});
