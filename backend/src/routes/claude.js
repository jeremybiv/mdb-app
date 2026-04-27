import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { NAF_BY_TRADE } from '../services/pappers.js';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `Tu es un expert en droit de l'urbanisme français et en opérations de marchands de biens (MdB).
Tu maîtrises : PLU/PLUiH, TVA sur marge, division parcellaire, permis de construire, DP, contentieux administratifs,
recours des tiers, ABF, servitudes, fiscalité immobilière, bail locatif.
Réponds toujours en français, directement et de façon opérationnelle, sans préambule.`;

// ── interpret-zone ────────────────────────────────────────
router.post('/interpret-zone', async (req, res) => {
  try {
    const { zone, typeZone, destDomi, projetDescription, commune } = req.body;
    if (!zone) return res.status(400).json({ error: 'zone required' });

    const prompt = `Zone PLU : ${zone} (type: ${typeZone || '?'}, destination: ${destDomi || '?'})
${commune ? `Commune : ${commune}` : ''}
${projetDescription ? `Projet : ${projetDescription}` : ''}

3 points courts :
1. **Constructibilité** : autorisé / interdit
2. **Contraintes** : emprise, hauteur, matériaux, reculs
3. **Artisans nécessaires** pour ce type de projet`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 600, system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    res.json({ analysis: msg.content[0].text });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ── refine-search ─────────────────────────────────────────
router.post('/refine-search', async (req, res) => {
  try {
    const { query } = req.body;
    const trades = Object.keys(NAF_BY_TRADE).join(', ');
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 200, system: SYSTEM,
      messages: [{ role: 'user', content: `Requête: "${query}"\nTrades: ${trades}\nJSON only: {"trades":[],"departement":"","keywords":"","raisonnement":""}` }],
    });
    res.json(JSON.parse(msg.content[0].text.trim().replace(/```json|```/g, '')));
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ── risques-mdb ───────────────────────────────────────────
router.post('/risques-mdb', async (req, res) => {
  try {
    const {
      zone, typeZone, adresse, commune, departement,
      operationType = 'division', projetDescription,
      surfaceTerrain, prixAchat, nbLots, periodeConstruction,
      presenceABF = false, zoneInondable = false, locataireEnPlace = false,
    } = req.body;
    if (!zone) return res.status(400).json({ error: 'zone required' });

    const ctx = [
      `Adresse: ${adresse || '?'} | Commune: ${commune || '?'} (dpt ${departement || '?'})`,
      `Zone PLU: ${zone} (${typeZone || '?'}) | Opération: ${operationType}`,
      projetDescription ? `Projet: ${projetDescription}` : '',
      surfaceTerrain   ? `Surface: ${surfaceTerrain}m²` : '',
      prixAchat        ? `Prix achat: ${Number(prixAchat).toLocaleString('fr-FR')}€` : '',
      nbLots           ? `Nb lots: ${nbLots}` : '',
      periodeConstruction ? `Construction: ${periodeConstruction}` : '',
      presenceABF      ? '⚠ Périmètre ABF' : '',
      zoneInondable    ? '⚠ Zone inondable' : '',
      locataireEnPlace ? '⚠ Locataire en place' : '',
    ].filter(Boolean).join('\n');

    const prompt = `Contexte MdB:
${ctx}

Identifie les risques pour cette opération de marchand de biens.
Inclus minimum: recours tiers, TVA sur marge, risque PLU, zone ${zone}.
${presenceABF ? 'Inclus: risque ABF.' : ''}
${locataireEnPlace ? 'Inclus: risques locataire en place.' : ''}
${zoneInondable ? 'Inclus: risque PPRi/inondation.' : ''}

JSON only (sans markdown):
{
  "risques": [{"titre":"","categorie":"juridique|fiscal|administratif|technique|marché","niveau":"critique|élevé|modéré|faible","description":"","probabilite":"certain|probable|possible|rare","mitigation":"","referenceJuridique":""}],
  "scoreRisqueGlobal": 0,
  "recommandationPrincipale": ""
}
scoreRisqueGlobal 0=très risqué → 100=très sécurisé. Max 8 risques, du plus au moins critique.`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 2000, system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    const parsed = JSON.parse(msg.content[0].text.trim().replace(/```json|```/g, ''));
    res.json(parsed);
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ── synthese-marche ───────────────────────────────────────
router.post('/synthese-marche', async (req, res) => {
  try {
    const { zone, commune, dvfStats, socioProfile, operationType } = req.body;

    const lines = [
      `Zone: ${zone} | Commune: ${commune || '?'}`,
      dvfStats?.bati?.median ? `Prix médian bâti: ${dvfStats.bati.median}€/m² (${dvfStats.bati.count} tx)` : '',
      dvfStats?.evolutionPct != null ? `Évolution 12m: ${dvfStats.evolutionPct > 0 ? '+' : ''}${dvfStats.evolutionPct}%` : '',
      socioProfile?.commune?.population ? `Population: ${socioProfile.commune.population.toLocaleString('fr-FR')} hab` : '',
      socioProfile?.revenus?.medianDisponible ? `Revenu médian/UC: ${socioProfile.revenus.medianDisponible.toLocaleString('fr-FR')}€` : '',
      socioProfile?.emploi?.tauxCadres ? `Cadres: ${socioProfile.emploi.tauxCadres}%` : '',
      socioProfile?.logement?.tauxProprietaires ? `Propriétaires: ${socioProfile.logement.tauxProprietaires}%` : '',
      `Opération: ${operationType || 'MdB division/valorisation'}`,
    ].filter(Boolean).join('\n');

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 400, system: SYSTEM,
      messages: [{ role: 'user', content: `${lines}\n\nBrief marché 4-5 phrases pour investisseur MdB. Attractivité, dynamique prix, profil acheteur cible, tension locative. Pas de titre ni bullet points.` }],
    });
    res.json({ synthese: msg.content[0].text });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

export default router;
