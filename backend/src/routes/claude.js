import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import { NAF_BY_TRADE } from "../services/pappers.js";

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `Tu es un expert senior en droit de l'urbanisme français spécialisé dans les opérations de marchands de biens (MdB).
Ton profil :
- Tu opères en France, secteur périurbain et rural
- Tu maîtrises : PLU/PLUiH/POS, règlement de zone, OAP, servitudes, SUP
- Tu maîtrises : TVA sur marge, droits de mutation, fiscalité MdB, SCI/SASU
- Tu maîtrises : division parcellaire, bornage, arpentage, géomètre-expert
- Tu maîtrises : PC, DP, permis d'aménager, recours gracieux et contentieux
- Tu maîtrises : ABF, ZPPAUP, AVAP, monuments historiques
- Tu maîtrises : bail locatif, congé vente, préemption, droit de retrait

RÈGLES IMPÉRATIVES :
- Tu analyses TOUJOURS la zone demandée. Jamais de refus, jamais de "je ne peux pas sans le document".
- Tu NE te fies JAMAIS à ta seule mémoire pour les règles PLU — tu CHERCHES toujours le document officiel
- Tu cites TOUJOURS tes sources (article du règlement, lien GPU, date d'approbation)
- Si une information est manquante ou incertaine, tu le dis EXPLICITEMENT
- Les codes de zones PLU obéissent à des conventions nationales françaises : tu les connais parfaitement.
- Tu déduis les caractéristiques typiques d'une zone à partir de son code (UA = centre dense, UB = mixte péricentral, UC = pavillonnaire, N = naturel protégé, AU = à urbaniser…) et du contexte communal.
- Si une donnée précise est inconnue, tu fournis la fourchette réglementaire typique pour ce type de zone et l'indiques par "(typique)" — tu ne bloques jamais l'analyse.
- Réponds en français, directement, sans préambule ni mise en garde. Format markdown autorisé.`;

// ── interpret-zone ────────────────────────────────────────
router.post("/interpret-zone", async (req, res) => {
  try {
    const { zone, typeZone, destDomi, projetDescription, commune } = req.body;
    if (!zone) return res.status(400).json({ error: "zone required" });

    const zoneCtx = [
      `Zone PLU : **${zone}**`,
      typeZone ? `Type réglementaire : ${typeZone}` : null,
      destDomi ? `Destination dominante : ${destDomi}` : null,
      commune ? `Commune : ${commune}` : null,
      projetDescription ? `Projet envisagé : ${projetDescription}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `${zoneCtx}

Tu es mandaté par un marchand de biens pour analyser cette zone avant acquisition. Produis une analyse opérationnelle en 3 points détaillés :

**1. DROITS À CONSTRUIRE & RÈGLEMENT**
Identifie les caractéristiques réglementaires typiques de cette zone dans ce type de commune :
- Destinations autorisées (habitation, commerce, activité…) et interdites
- Emprise au sol (CES) et hauteur maximale admise (en mètres et/ou niveaux)
- Reculs obligatoires : voirie (marge de recul), limites séparatives
- Conditions de division parcellaire (surface minimale des lots)
- Changement de destination : possible / soumis à PC / interdit

**2. STRATÉGIE MARCHAND DE BIENS**
En fonction du règlement de cette zone, quelle(s) opération(s) sont les plus pertinentes :
- Division + vente à la découpe : faisabilité et conditions
- Rénovation / surélévation / extension : droits mobilisables
- Changement de destination ou création de surface habitable : marge de manœuvre
- Potentiel de densification : est-ce une zone favorable ou contraignante ?

**3. POINTS DE VIGILANCE & RISQUES SPÉCIFIQUES**
- Risques PLU propres à ce type de zone (inconstructibilité partielle, règles ABF probables, zones humides/inondables…)
- Délais et procédures à anticiper (PC / DP / modification PLU)
- 2 ou 3 questions à poser impérativement en mairie avant acquisition

Conclus par une phrase de synthèse : opportunité ou prudence pour un MdB ?`;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1400,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    res.json({ analysis: msg.content[0].text });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── refine-search ─────────────────────────────────────────
router.post("/refine-search", async (req, res) => {
  try {
    const { query } = req.body;
    const trades = Object.keys(NAF_BY_TRADE).join(", ");
    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Requête: "${query}"\nTrades: ${trades}\nJSON only: {"trades":[],"departement":"","keywords":"","raisonnement":""}`,
        },
      ],
    });
    res.json(
      JSON.parse(msg.content[0].text.trim().replace(/```json|```/g, "")),
    );
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── risques-mdb ───────────────────────────────────────────
router.post("/risques-mdb", async (req, res) => {
  try {
    const {
      zone,
      typeZone,
      adresse,
      commune,
      departement,
      operationType = "division",
      projetDescription,
      surfaceTerrain,
      prixAchat,
      nbLots,
      periodeConstruction,
      presenceABF = false,
      zoneInondable = false,
      locataireEnPlace = false,
    } = req.body;
    if (!zone) return res.status(400).json({ error: "zone required" });

    const ctx = [
      `Adresse: ${adresse || "?"} | Commune: ${commune || "?"} (dpt ${departement || "?"})`,
      `Zone PLU: ${zone} (${typeZone || "?"}) | Opération: ${operationType}`,
      projetDescription ? `Projet: ${projetDescription}` : "",
      surfaceTerrain ? `Surface: ${surfaceTerrain}m²` : "",
      prixAchat
        ? `Prix achat: ${Number(prixAchat).toLocaleString("fr-FR")}€`
        : "",
      nbLots ? `Nb lots: ${nbLots}` : "",
      periodeConstruction ? `Construction: ${periodeConstruction}` : "",
      presenceABF ? "⚠ Périmètre ABF" : "",
      zoneInondable ? "⚠ Zone inondable" : "",
      locataireEnPlace ? "⚠ Locataire en place" : "",
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `Contexte MdB:
${ctx}

Identifie les risques pour cette opération de marchand de biens.
Inclus minimum: recours tiers, TVA sur marge, risque PLU, zone ${zone}.
${presenceABF ? "Inclus: risque ABF." : ""}
${locataireEnPlace ? "Inclus: risques locataire en place." : ""}
${zoneInondable ? "Inclus: risque PPRi/inondation." : ""}

JSON only (sans markdown):
{
  "risques": [{"titre":"","categorie":"juridique|fiscal|administratif|technique|marché","niveau":"critique|élevé|modéré|faible","description":"","probabilite":"certain|probable|possible|rare","mitigation":"","referenceJuridique":""}],
  "scoreRisqueGlobal": 0,
  "recommandationPrincipale": ""
}
scoreRisqueGlobal 0=très risqué → 100=très sécurisé. Max 8 risques, du plus au moins critique.`;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = JSON.parse(
      msg.content[0].text.trim().replace(/```json|```/g, ""),
    );
    res.json(parsed);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── synthese-marche ───────────────────────────────────────
router.post("/synthese-marche", async (req, res) => {
  try {
    const { zone, commune, dvfStats, socioProfile, operationType } = req.body;

    const lines = [
      `Zone: ${zone} | Commune: ${commune || "?"}`,
      dvfStats?.bati?.median
        ? `Prix médian bâti: ${dvfStats.bati.median}€/m² (${dvfStats.bati.count} tx)`
        : "",
      dvfStats?.evolutionPct != null
        ? `Évolution 12m: ${dvfStats.evolutionPct > 0 ? "+" : ""}${dvfStats.evolutionPct}%`
        : "",
      socioProfile?.commune?.population
        ? `Population: ${socioProfile.commune.population.toLocaleString("fr-FR")} hab`
        : "",
      socioProfile?.revenus?.medianDisponible
        ? `Revenu médian/UC: ${socioProfile.revenus.medianDisponible.toLocaleString("fr-FR")}€`
        : "",
      socioProfile?.emploi?.tauxCadres
        ? `Cadres: ${socioProfile.emploi.tauxCadres}%`
        : "",
      socioProfile?.logement?.tauxProprietaires
        ? `Propriétaires: ${socioProfile.logement.tauxProprietaires}%`
        : "",
      `Opération: ${operationType || "MdB division/valorisation"}`,
    ]
      .filter(Boolean)
      .join("\n");

    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `${lines}\n\nBrief marché 4-5 phrases pour investisseur MdB. Attractivité, dynamique prix, profil acheteur cible, tension locative. Pas de titre ni bullet points.`,
        },
      ],
    });
    res.json({ synthese: msg.content[0].text });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
