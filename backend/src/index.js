import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import './lib/axiosLogger.js';
import authRouter, { requireAuth } from './routes/auth.js';
import pappersRouter from './routes/pappers.js';
import claudeRouter  from './routes/claude.js';
import cacheRouter   from './routes/cache.js';
import dvfRouter     from './routes/dvf.js';
import sireneRouter  from './routes/sirene.js';
import searchRouter  from './routes/search.js';

// Charge .env.local à la racine du monorepo (priorité), puis .env
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });
dotenv.config({ path: resolve(__dirname, '../../.env') });

const app  = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

const corsOrigin = process.env.VERCEL
  ? true
  : (process.env.FRONTEND_URL || ((o, cb) => cb(null, /^http:\/\/localhost(:\d+)?$/.test(o || ''))));
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

const limiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true });
app.use('/api', limiter);

app.use('/api/auth', authRouter);
app.use('/api', requireAuth);
app.use('/api/pappers', pappersRouter);
app.use('/api/claude',  claudeRouter);
app.use('/api/cache',   cacheRouter);
app.use('/api/dvf',     dvfRouter);
app.use('/api/sirene',  sireneRouter);
app.use('/api/search',  searchRouter);

app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend http://localhost:${PORT}`);
    console.log(`  AUTH_EMAIL=${process.env.AUTH_EMAIL || '(défaut)'}`);
    console.log(`  JWT_SECRET=${process.env.JWT_SECRET ? '✓ chargé' : '(défaut dev)'}`);
  });
} else {
  console.log(`Backend démarré en mode Vercel (serverless, pas de listen)`);
}
