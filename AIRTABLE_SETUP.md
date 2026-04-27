# Airtable Setup Guide

## Base name : `PLU Artisans`

---

## Table 1 : `Artisans`

| Field name   | Type           | Notes                              |
|---|---|---|
| Nom          | Single line    | Primary field                      |
| SIREN        | Single line    | Unique identifier                  |
| NAF          | Single line    | Code APE                           |
| Ville        | Single line    |                                    |
| CodePostal   | Single line    |                                    |
| Effectif     | Number         | Minimum salariés                   |
| CA           | Number         | Chiffre d'affaires en €            |
| Dirigeant    | Single line    |                                    |
| Email        | Email          |                                    |
| Telephone    | Phone number   |                                    |
| SiteWeb      | URL            |                                    |
| DateCreation | Single line    | YYYY-MM-DD                         |
| Score        | Number         | 0–100                              |
| Priorite     | Single select  | Options: P1, P2, P3, P4            |
| Trade        | Single line    | ex: plomberie+chauffage            |
| Source       | Single select  | Options: pappers, web              |
| CreatedAt    | Single line    | ISO timestamp                      |
| UpdatedAt    | Single line    | ISO timestamp                      |

---

## Table 2 : `Recherches`

| Field name   | Type        | Notes                     |
|---|---|---|
| Adresse      | Single line | Primary field             |
| Latitude     | Number      | Decimal degrees           |
| Longitude    | Number      | Decimal degrees           |
| ZonePLU      | Single line | ex: UGp2                  |
| TypeZone     | Single line | ex: U                     |
| Trades       | Single line | Comma-separated list      |
| NbResultats  | Number      |                           |
| CreatedAt    | Single line | ISO timestamp             |

---

## Getting your credentials

1. **Base ID** : Open your base → Help → API documentation → Base ID starts with `app`
2. **API Key** : account.airtable.com → Developer Hub → Personal Access Token
   - Scopes needed: `data.records:read`, `data.records:write`
   - Add your base to the token's access list

## .env values

```
AIRTABLE_API_KEY=pat_xxxxxxxxxxxxxxxxxxxx
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
```
