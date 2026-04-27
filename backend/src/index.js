import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Charge .env.local à la racine du monorepo (priorité), puis .env
dotenv.config({ path: resolve(__dirname, '../../../.env.local') });
dotenv.config({ path: resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pappersRouter from './routes/pappers.js';
import claudeRouter  from './routes/claude.js';
import cacheRouter   from './routes/cache.js';
import dvfRouter     from './routes/dvf.js';

const app  = express();
const PORT = process.env.PORT || 3001;

const corsOrigin = process.env.VERCEL
  ? true
  : (process.env.FRONTEND_URL || ((o, cb) => cb(null, /^http:\/\/localhost(:\d+)?$/.test(o || ''))));
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

const limiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true });
app.use('/api', limiter);

app.use('/api/pappers', pappersRouter);
app.use('/api/claude',  claudeRouter);
app.use('/api/cache',   cacheRouter);
app.use('/api/dvf',     dvfRouter);   // ← était /api/airtable

app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Vercel serverless: export the app as default handler
export default app;

// Local dev only
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`🚀 Backend on http://localhost:${PORT}`));
}
