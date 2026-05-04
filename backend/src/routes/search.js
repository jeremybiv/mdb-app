import { Router } from 'express';
import { getUserSearches, registerSearch } from '../lib/usageTracker.js';

const router = Router();

const max = () => parseInt(process.env.MAX_SEARCHES_PER_USER || '4', 10);

// GET /api/search/usage — quota courant de l'utilisateur connecté
router.get('/usage', async (req, res) => {
  try {
    const searches = await getUserSearches(req.user.email);
    res.json({ searches, remaining: Math.max(0, max() - searches.length), total: max() });
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
