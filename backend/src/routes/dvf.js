import { Router } from 'express';
import axios from 'axios';

const router = Router();

const CEREMA = 'https://apidf-preprod.cerema.fr/dvf_opendata/geomutations/';

// GET /api/dvf?citycode=&lon=&lat=&radius=&months=
router.get('/', async (req, res) => {
  const { citycode, lon, lat, radius = 1500, months = 24 } = req.query;
  if (!citycode) return res.status(400).json({ error: 'citycode required' });

  const since = new Date();
  since.setMonth(since.getMonth() - Number(months));
  const dateMin = since.toISOString().split('T')[0];

  try {
    const { data } = await axios.get(CEREMA, {
      params: {
        code_insee: citycode,
        anneemut_min: new Date().getFullYear() - Math.ceil(Number(months) / 12),
        page_size: 100,
      },
      headers: { Accept: 'application/json' },
      timeout: 15000,
    });
    res.json(data);
  } catch (err) {
    const status  = err.response?.status || 502;
    const detail  = err.response?.data   || err.message;
    console.error('DVF error', status, detail);
    res.status(status).json({ error: 'DVF unavailable', detail });
  }
});

export default router;
