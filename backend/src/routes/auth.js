import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

// Lecture lazy — dotenv est chargé après les imports ESM
const cfg = () => ({
  email:    process.env.AUTH_EMAIL    || 'admin@mdb.app',
  password: process.env.AUTH_PASSWORD || 'mdb2024',
  secret:   process.env.JWT_SECRET    || 'dev-secret-change-in-prod',
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'email et password requis' });
  const { email: E, password: P, secret: S } = cfg();
  if (email.toLowerCase() !== E.toLowerCase() || password !== P)
    return res.status(401).json({ error: 'Identifiants incorrects' });

  const token = jwt.sign({ email }, S, { expiresIn: '30d' });
  res.json({ token, email });
});

// Middleware exporté — protège toutes les routes sauf /api/auth/*
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = jwt.verify(token, cfg().secret);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

export default router;
