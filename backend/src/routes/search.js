import { Router } from 'express';
import { getUserSearches, registerSearch, getAllUserSearches } from '../lib/usageTracker.js';
import { getUserBudget, getAllUserBudgets } from '../lib/costTracker.js';

const router = Router();

const max = () => parseInt(process.env.MAX_SEARCHES_PER_USER || '4', 10);

// GET /api/search/usage — quota adresses + budget Claude de l'utilisateur connecté
router.get('/usage', async (req, res) => {
  try {
    const [searches, budget] = await Promise.all([
      getUserSearches(req.user.email),
      getUserBudget(req.user.email),
    ]);
    res.json({ searches, remaining: Math.max(0, max() - searches.length), total: max(), budget });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/search/admin — vue complète de tous les utilisateurs (réservé à AUTH_EMAIL)
router.get('/admin', async (req, res) => {
  const adminEmail = process.env.AUTH_EMAIL || 'admin@mdb.app';
  if (req.user.email.toLowerCase() !== adminEmail.toLowerCase())
    return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
  try {
    const [users, costs] = await Promise.all([getAllUserSearches(), getAllUserBudgets()]);
    const costsMap = Object.fromEntries(costs.map(c => [c.email, c]));
    const merged = users.map(u => ({ ...u, cost: costsMap[u.email] || { totalUsd: 0, calls: 0 } }));
    res.json({ users: merged, total: max(), maxBudgetUsd: process.env.MAX_BUDGET_USD_PER_USER || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/search/register — enregistre une nouvelle adresse recherchée
router.post('/register', async (req, res) => {
  try {
    const { adresse, citycode, zone } = req.body;
    if (!adresse) return res.status(400).json({ error: 'adresse required' });
    const result = await registerSearch(req.user.email, { adresse, citycode, zone });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
