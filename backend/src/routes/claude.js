import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import { cacheGet, cacheSet } from "../lib/memcache.js";
import { NAF_BY_TRADE } from "../services/pappers.js";
import { getPluZoneText } from "../services/pluPdf.js";

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Récupère un JSON potentiellement tronqué (max_tokens atteint)
function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Tente de fermer le JSON tronqué : supprime le dernier objet incomplet et ferme les tableaux/objets ouverts
    let s = text;
    // Retire le dernier objet partiel (commence par { sans } fermant)
    const lastComma = s.lastIndexOf(",");
    if (lastComma !== -1) s = s.slice(0, lastComma);
    // Compte les accolades/crochets ouverts non fermés et ferme-les
    let braces = 0,
      brackets = 0,
      inStr = false,
      esc = false;
    for (const ch of s) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === "{") braces++;
      if (ch === "}") braces--;
      if (ch === "[") brackets++;
      if (ch === "]") brackets--;
    }
    s += "]".repeat(Math.max(0, brackets)) + "}".repeat(Math.max(0, braces));
    return JSON.parse(s);
  }
}

// Modèles : Sonnet pour analyses complexes, Haiku pour tâches simples
const MODEL_QUALITY = "claude-sonnet-4-20250514";
const MODEL_FAST = "claude-haiku-4-5-20251001";

// ── System prompt expert (Sonnet) ─────────────────────────
// Étendu à 1024+ tokens pour activer le prompt caching Anthropic
// (économie 90% sur tokens cachés, TTL 5 min côté Anthropic)
const SYSTEM_EXPERT_TEXT = `Tu es un expert senior en droit de l'urbanisme français spécialisé dans les opérations de marchands de biens (MdB).
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
- Réponds en français, directement, sans préambule ni mise en garde. Format markdown autorisé.

RÉFÉRENTIEL ZONES PLU — CONVENTIONS FRANÇAISES :

Zones Urbaines (U) :
- UA / UAa / 1UA — Centre urbain dense : emprise au sol 70-100%, hauteur R+3 à R+5 (9-17m), recul voirie 0 (alignement), changement destination libre avec DP/PC, pas de surface minimale de lot.
- UB / UB1 / UBa — Mixte péricentral : CES 50-70%, hauteur R+2 à R+3 (7-10m), recul voirie 3-5m, limites séparatives 2-3m, changement destination soumis à PC.
- UC / UC1 — Pavillonnaire résidentiel : CES 25-40%, hauteur R+1+combles (6-8m), recul voirie 5m, limites séparatives 3m, surface minimale lot 300-600m², division en lotissement possible.
- UD / UD1 — Résidentiel diffus périphérique : CES 15-25%, R+1 (5-6m), recul voirie 8-10m, surface min 500-1500m², constructibilité faible, extension limitée.
- UE / UEa / UX — Économique, activités, ZI/ZAE : logement interdit sauf gardien (≤100m²), CES 60-70%, hauteur 10-15m, pas de division résidentielle, usage industriel/commercial dominant.

Zones à Urbaniser (AU) :
- 1AU / 1AUH / OAP — Constructible si opération d'ensemble conforme à l'OAP. PC individuel refusable si incohérent avec l'OAP. Réseaux à la charge de l'aménageur. Permis d'aménager souvent requis.
- 2AU — Inconstructible sans modification ou révision du PLU. Procédure lourde : 6 mois (modification simplifiée) à 18 mois (révision générale).

Zones Agricoles (A) et Naturelles (N) :
- A — Agricole : seuls bâtiments d'exploitation agricole et logement de l'exploitant autorisés. Division résidentielle impossible. Exception : STECAL délimité au PLU.
- N — Naturel protégé : inconstructible sauf extension modérée de l'existant (20% SHON, variable selon PLU), annexes légères, changement de destination limité.
- Nh / Na / Nl — Hameaux/naturel aménagé : extension et réhabilitation du bâti existant possibles, nouvelle construction interdite, changement destination vers habitation sous conditions strictes.

FISCALITÉ MdB — REPÈRES :
- Engagement de revente ≤5 ans : droits de mutation réduits à 0,715% (au lieu de 5,80665%). Déclaration obligatoire à l'acte notarié. Pénalité si non-respect : rappel des droits + intérêts.
- TVA sur marge : assiette = prix vente TTC − prix achat TTC. S'applique si vendeur assujetti TVA ET achat réalisé sans TVA récupérée. Base légale : CGI art. 268.
- Plus-value professionnelle IS : imposition au taux IS (15% puis 25%) sur la PV. Pas d'abattement pour durée de détention. Applicable SCI/SASU à l'IS.
- Déficit foncier (SCI IR) : imputable sur revenu global dans la limite de 10 700€/an (travaux uniquement, hors intérêts d'emprunt). Report 10 ans.

PROCÉDURES ADMINISTRATIVES — DÉLAIS INDICATIFS :
- Déclaration Préalable : instruction 1 mois (maison indiv.) ou 2 mois. Purge recours tiers 2 mois. Total 3-4 mois.
- Permis de Construire maison individuelle : instruction 2 mois + purge recours 2 mois = 4 mois minimum.
- PC collectif / ERP / immeuble : instruction 3 mois + purge 2 mois = 5-6 mois.
- Permis d'Aménager (lotissement ≥2 lots avec VRD) : instruction 3 mois + purge recours 3 mois + DAACT 30 jours = 7 mois.
- Avis ABF conforme : délai d'instruction majoré de 2 mois, recours possible auprès du préfet de région.
- Modification PLU simplifiée : 4-6 mois. Modification de droit commun : 12-18 mois. Révision générale : 2-4 ans.`;

// Prompt caching Anthropic : bloc system > 1024 tokens requis pour Sonnet (TTL 5 min, -90% sur tokens cachés)
const SYSTEM_EXPERT = [
  {
    type: "text",
    text: SYSTEM_EXPERT_TEXT,
    cache_control: { type: "ephemeral" },
  },
];

// System prompt léger pour Haiku (tâches simples — pas de prompt caching, Haiku requiert 2048+ tokens)
const SYSTEM_HAIKU =
  "Tu es un assistant spécialisé en immobilier français et marchands de biens. Réponds en français, de façon concise et directe.";

// ── interpret-zone ────────────────────────────────────────
router.post("/interpret-zone", async (req, res) => {
  try {
    const { zone, typeZone, destDomi, libelong, urlfic, projetDescription, commune } = req.body;
    if (!zone) return res.status(400).json({ error: "zone required" });

    // Cache : clé inclut la présence du document pour ne pas mélanger analyses avec/sans PDF
    const cacheKey = `claude_zone_v3_${zone}_${(commune || "").toLowerCase()}${urlfic ? "_doc" : ""}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json({ ...cached, fromCache: true });

    const zoneCtx = [
      `Zone PLU : **${zone}**${libelong ? ` — ${libelong}` : ""}`,
      typeZone ? `Type réglementaire : ${typeZone}` : null,
      destDomi ? `Destination dominante : ${destDomi}` : null,
      commune ? `Commune : ${commune}` : null,
      projetDescription ? `Projet envisagé : ${projetDescription}` : null,
      `\n⚠️ Le texte du règlement PLU est fourni en fin de message. Extrais les valeurs EXACTES — ne déduis jamais une valeur typique si l'information figure dans le texte fourni. Si une donnée est absente du texte, marque **(typique — à confirmer)**.`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `${zoneCtx}

Tu es mandaté par un marchand de biens pour analyser cette zone avant acquisition. Produis une analyse opérationnelle structurée.

FORMAT IMPÉRATIF — respecte exactement ces conventions de mise en forme :
- Titres de blocs :  N — TITRE (jamais de ***)
- Tableaux : format markdown | col | col | avec ligne séparatrice |---|---|
- Listes : tirets simples -
- Données non confirmées : marque **(typique — à confirmer)**
- Données issues du règlement : marque **(source : doc)**

**1. DROITS À CONSTRUIRE & RÈGLEMENT**

 1 — OCCUPATION DU SOL

| Usage | Statut | Article / Source |
|---|---|---|

Extraire pour chaque catégorie applicable : Habitation individuelle, Habitation collective, Logement social, Commerce et services, Bureaux et tertiaires, Hébergement hôtelier, Activités artisanales, Activités industrielles, Équipements publics, Constructions agricoles, Affouillements/dépôts.
Statut : **Autorisé** / **Interdit** / **Conditionné** (préciser la condition)

---

 2 — DESSERTE ET RÉSEAUX

| Réseau | Règle extraite |
|---|---|

Extraire : Voirie et accès (largeur min, impasses), Eau potable, Assainissement eaux usées, Assainissement eaux pluviales, Réseaux divers (élec, télécom, VE)

---

 3 — IMPLANTATION ET VOLUMÉTRIE

| Paramètre | Règle extraite |
|---|---|

Extraire : Recul voies, Recul limites séparatives, Distance entre constructions, Emprise au sol (CES), Hauteur maximale (m + R+X), Surface de plancher maximale

---

 4 — ASPECT EXTÉRIEUR

| Élément | Règle extraite |
|---|---|

Extraire si présent : Façades, Toitures, Clôtures, Menuiseries, Éléments techniques (solaire, clim), Intégration paysagère / ABF

---

 5 — STATIONNEMENT

| Usage | Places exigées | Conditions |
|---|---|---|

Extraire : Logement individuel, Logement collectif, Bureaux/commerces, Hébergement, Activités. Inclure dimensions minimales et localisation.

---

 6 — ESPACES VERTS ET PAYSAGE

| Exigence | Règle extraite |
|---|---|

Extraire : Surface végétalisée minimale, Arbres existants, Plantations obligatoires, Espaces libres, Coefficient de biotope

---

 7 — PERFORMANCE ÉNERGÉTIQUE ET ENVIRONNEMENT

| Exigence | Règle extraite |
|---|---|

Extraire si présent : Normes énergétiques, Énergies renouvelables, Matériaux biosourcés, Gestion eaux pluviales, Perméabilité sols, Nuisances

---

 8 — DIVISIONS PARCELLAIRES ET LOTISSEMENTS

| Paramètre | Règle extraite |
|---|---|

Extraire : Surface minimale de lot, Largeur minimale de façade, Conditions de division, Règles lotissement, Détachements sans construction

---

 9 — DISPOSITIONS GÉNÉRALES APPLICABLES

| Disposition | Contenu |
|---|---|

Extraire : Définitions réglementaires, Adaptations mineures, SUP (servitudes), Protections patrimoniales (ABF, ZPPAUP), Risques naturels (PPRI, PPRN), OAP, Emplacements réservés

---

**2. STRATÉGIE MARCHAND DE BIENS**

- **Division + vente à la découpe :** faisabilité, surface minimale, procédure (DP / PA)
- **Rénovation / extension / surélévation :** droits mobilisables, marge disponible
- **Changement de destination :** possible / procédure / interdit
- **Densification :** zone favorable ou contraignante — pourquoi

---

**3. RISQUES & QUESTIONS MAIRIE**

- **Risque n°1 :** (ABF, OAP, zone humide, inconstructibilité partielle…)
- **Risque n°2 :** (servitude, PPRi, retrait-gonflement argiles…)
- **Procédure à anticiper :** PC / DP / permis d'aménager — délai estimé
- **Question 1 à poser en mairie :** formulation directe
- **Question 2 à poser en mairie :** formulation directe
- **Question 3 à poser en mairie :** formulation directe

---

**Synthèse :** opportunité à saisir / dossier à instruire avec précaution / zone à éviter — raison principale en une ligne.`;

    // Extraction texte PDF si disponible
    let zoneDocText = null;
    if (urlfic) {
      try {
        zoneDocText = await getPluZoneText(urlfic, zone);
      } catch (e) {
        console.warn(`[interpret-zone] PDF non lisible: ${e.message}`);
      }
    }

    // Injecter le texte extrait dans le prompt
    const fullPrompt = zoneDocText
      ? `${prompt}\n\n---\n\nEXTRAIT DU RÈGLEMENT PLU — ZONE ${zone} :\n\n${zoneDocText}`
      : prompt;

    const msg = await client.messages.create({
      model: MODEL_QUALITY,
      max_tokens: 4096,
      system: SYSTEM_EXPERT,
      messages: [{ role: "user", content: fullPrompt }],
    });

    const payload = { analysis: msg.content[0].text, hasDocument: !!zoneDocText };
    cacheSet(cacheKey, payload, 6 * 3_600_000);
    res.json(payload);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── refine-search — Haiku (extraction JSON simple) ────────
router.post("/refine-search", async (req, res) => {
  try {
    const { query } = req.body;
    const trades = Object.keys(NAF_BY_TRADE).join(", ");
    const msg = await client.messages.create({
      model: MODEL_FAST,
      max_tokens: 200,
      system: SYSTEM_HAIKU,
      messages: [
        {
          role: "user",
          content: `Requête: "${query}"\nTrades disponibles: ${trades}\nJSON only: {"trades":[],"departement":"","keywords":"","raisonnement":""}`,
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

    // Cache : même zone + commune + type d'opération (TTL 6h)
    const cacheKey = `claude_risques_${zone}_${(commune || "").toLowerCase()}_${operationType}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json({ ...cached, fromCache: true });

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
scoreRisqueGlobal 0=très risqué → 100=très sécurisé. Max 6 risques, du plus au moins critique.`;

    const msg = await client.messages.create({
      model: MODEL_QUALITY,
      max_tokens: 2048,
      system: SYSTEM_EXPERT,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = msg.content[0].text.trim().replace(/```json|```/g, "");
    const parsed = parseJsonSafe(raw);
    cacheSet(cacheKey, parsed, 6 * 3_600_000);
    res.json(parsed);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── synthese-marche — Haiku (résumé court) ───────────────
router.post("/synthese-marche", async (req, res) => {
  try {
    const { zone, commune, dvfStats, socioProfile, operationType } = req.body;

    const medianBati = dvfStats?.bati?.median;
    const cacheKey = `claude_synthese_${zone}_${(commune || "").toLowerCase()}_${medianBati || "0"}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json({ ...cached, fromCache: true });

    const lines = [
      `Zone: ${zone} | Commune: ${commune || "?"}`,
      medianBati
        ? `Prix médian bâti: ${medianBati}€/m² (${dvfStats.bati.count} tx)`
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
      model: MODEL_FAST,
      max_tokens: 300,
      system: SYSTEM_HAIKU,
      messages: [
        {
          role: "user",
          content: `${lines}\n\nBrief marché 4-5 phrases pour investisseur MdB. Attractivité, dynamique prix, profil acheteur cible, tension locative. Pas de titre ni bullet points.`,
        },
      ],
    });

    const payload = { synthese: msg.content[0].text };
    cacheSet(cacheKey, payload, 12 * 3_600_000);
    res.json(payload);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
