# PLUiH + Artisans · Pays de Gex

Web app pour consulter le zonage PLUiH d'une adresse et trouver des artisans locaux.

## Stack

|Layer|Tech|
|---|---|
|Frontend|Vite + React + Tailwind|
|Backend|Node.js + Express|
|DB|Airtable|
|PLU API|IGN GPU (direct browser, pas de proxy)|
|Artisans|SIRENE INSEE / Pappers API|
|DVF|files.data.gouv.fr (CSV commune, cache disque)|
|IA|Anthropic Claude (interprétation zone + NL search)|

## Ce qui tourne côté browser (pas d'IA, pas de backend)

- Géocodage → `api-adresse.data.gouv.fr`
- Zone PLU → `apicarto.ign.fr/gpu/zone-urba`
- Document urbanisme → `apicarto.ign.fr/gpu/document`
- Scoring artisans → pure JS (grille de points statique)
- Export CSV → papaparse

## Ce qui passe par le backend

- SIRENE `recherche-entreprises.api.gouv.fr` (cascade commune → voisines → dept)
- Pappers API (clé cachée, CORS)
- DVF CSV par commune (cache disque `backend/cache/dvf/`)
- Claude API (clé cachée)
- Airtable read (token caché)

## Setup

### 1. Variables d'environnement

```bash
cp .env.example .env
# Remplir les variables
```

### 2. Install + run

```bash
npm install
npm run dev
# Frontend : http://localhost:5173
# Backend  : http://localhost:3001
```

### 3. Build prod

```bash
npm run build
npm start
```

## Système de notation artisans (P1 → P4)

Chaque artisan reçoit un **score** calculé à partir de signaux de fiabilité.
La **priorité** (P1–P4) est déduite du score et de la présence de contact direct.

### Grille de points

|Signal|Points|
|---|---|
|CA > 500 k€|+30|
|CA 200–500 k€|+20|
|CA 100–200 k€|+10|
|Effectif ≥ 10|+25|
|Effectif 3–9|+20|
|Effectif 1–2|+10|
|Email disponible|+20|
|Téléphone disponible|+15|
|Entreprise créée avant 2020|+2 pts/an (max +20)|
|Résultat net positif|+10|
|Plusieurs établissements ouverts|+5|

### Seuils de priorité

|Priorité|Condition|Signification|
|---|---|---|
|**P1**|Score ≥ 55 **et** contact direct|Artisan établi — contacter en premier|
|**P2**|Score ≥ 35|Bonne structure, à contacter|
|**P3**|Score ≥ 20|Entreprise jeune ou peu documentée|
|**P4**|Score < 20|Peu d'informations disponibles|

> **Source SIRENE** : score simplifié (effectif + ancienneté, pas de CA). Email/site non fournis — lien de recherche Google disponible dans le tableau.
> **Source Pappers** : score complet (CA, bilans, contacts directs).

## Artisans — cascade géographique

1. **Commune** (code postal INSEE) — résultats immédiats si artisans locaux
2. **Communes voisines** — élargissement si < 3 résultats (`geo.api.gouv.fr/communes-limitrophes`)
3. **Département** — fallback si toujours < 3 résultats

## DVF — données de transactions

- Source : `files.data.gouv.fr/geo-dvf/latest/csv/{year}/communes/{dept}/{citycode}.csv`
- Période : 12 derniers mois (années 2024 + 2025)
- Cache disque : `backend/cache/dvf/` — re-téléchargement uniquement si fichier absent
- Lien parcelle : `explore.data.gouv.fr/fr/immobilier?code={id_parcelle}&level=parcelle`



## Architecture finale — pipeline hybride déterministe + IA

```

PDF règlement PLU
      ↓
  fetchPdfText()          ← download + pdf-parse, cache 3j
      ↓
  extractZoneSection()    ← isolation section via regex (TOC-skipping)
      ↓
  extractRulesFromText()  ← 6 règles numériques par regex
    empriseSol, hauteurMax, reculVoirie, reculLimites,
    surfaceMinLot, stationnement → { value, context }
      ↓
  ┌──────────────────────────────────────────────────────┐
  │ VALEURS CERTIFIÉES (injectées en tête de prompt)      │
  │  - CES : 18 %  «emprise au sol ... est de 18 %»       │
  │  - Hauteur : 9 m  «hauteur maximale ... est de 9 m»   │
  │  ...                                                  │
  └──────────────────────────────────────────────────────┘
      ↓
  Claude Sonnet           ← prompt = valeurs certifiées
    + section brute       ← + texte règlement complet
      ↓
  9 blocs markdown        ← valeurs numériques certifiées +
                             interprétation contextuelle
```

## Ce qui change côté résultat

Bloc 3 (implantation) : CES/hauteur/reculs exacts, pas typiques
Bloc 5 (stationnement) : nombre de places extrait directement
Bloc 8 (divisions) : surface min lot extraite
Frontend : panneau "Chiffres clés · extrait règlement" avec les 6 valeurs + tooltip source
Fallback statique (zones.js) toujours là si PDF indisponible
Redémarre le backend (vide le cache) puis reteste sur "7 chemin des rosiers, gex".
