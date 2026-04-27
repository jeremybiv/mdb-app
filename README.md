# PLUiH + Artisans · Pays de Gex

Web app pour consulter le zonage PLUiH d'une adresse et trouver des artisans locaux.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React + Tailwind |
| Backend  | Node.js + Express |
| DB       | Airtable |
| PLU API  | IGN GPU (direct browser, pas de proxy) |
| Artisans | Pappers API (via backend proxy) |
| IA       | Anthropic Claude (interprétation zone + NL search) |

## Ce qui tourne côté browser (pas d'IA, pas de backend)

- Géocodage → `api-adresse.data.gouv.fr`
- Zone PLU → `apicarto.ign.fr/gpu/zone-urba`
- Document urbanisme → `apicarto.ign.fr/gpu/document`
- Scoring artisans → pure JS (grille de points statique)
- Export CSV → papaparse

## Ce qui passe par le backend

- Pappers API (clé cachée, CORS)
- Claude API (clé cachée)
- Airtable read (token caché)

## Setup

### 1. Variables d'environnement

```bash
cp .env.example .env
# Remplir les 5 variables
```

### 2. Airtable

Voir `AIRTABLE_SETUP.md` pour créer les 2 tables.

### 3. Install + run

```bash
npm install
npm run dev
# Frontend : http://localhost:5173
# Backend  : http://localhost:3001
```

### 4. Build prod

```bash
npm run build
# Static files dans frontend/dist/
npm start  # Lance le backend
```

## Architecture décision : Pappers clé + Claude

`PAPPERS_API_KEY` et `ANTHROPIC_API_KEY` sont uniquement dans le backend Express.
Le frontend ne les voit jamais. Le proxy Express ajoute la clé à chaque requête.

## Airtable flows

- Chaque résultat Pappers → upsert dans table `Artisans` (par SIREN)
- Chaque recherche → log dans table `Recherches`
- `/api/airtable/artisans` → lecture des artisans sauvegardés (historique)
