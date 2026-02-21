# GenMark — Implementation Plan (Updated 2026-02-20)

## Status: ALL 5 FEATURES IMPLEMENTED — DEPLOY READY

---

## Feature Status

| Feature | Backend | Frontend | Status |
|---------|---------|----------|--------|
| F1 — Alteration Detection | ✅ Done | ✅ Done | Complete |
| F2 — Email on Misuse Report | ✅ Done | N/A | Complete |
| F3 — Upload & Morph Tool | ✅ Done | ✅ Done | Complete |
| F4 — Progressive Auth (no forced redirect) | N/A | ✅ Done | Complete |
| F5 — Fix Duplicate Registration | ✅ Done | ✅ Done | Complete |

---

## What Was Built (Feature Branch)

### Backend Changes

| File | Change |
|------|--------|
| `backend/main.py` | `hamming_distance()`, `find_similar_registration()`, `apply_morph()`, `POST /api/morph`, updated `/api/register` (MongoDB-first, alteration detection, morph fields), updated `/api/verify` (enriched with modification info), updated `/api/flag` (email trigger) |
| `backend/email.py` | NEW — Resend email sender for misuse notifications |
| `backend/certificate.py` | Added `modified_by` + `original_phash` params → renders MORPHED BY + ORIGINAL HASH rows in PDF |
| `backend/requirements.txt` | Added `resend==2.5.0` |

### Frontend Changes

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Added `/morph` route; removed `ProtectedRoute` from `/generate` and `/morph` (F4) |
| `frontend/src/pages/Generate.tsx` | F4: inline auth prompt instead of redirect; F1: alteration warning banner; F5: reads `already_registered` response; Morph nav link |
| `frontend/src/pages/Verify.tsx` | Extended `VerifyResult` with `is_modification`, `modified_by_name`, `original_phash`, `original_creator`; Morph nav link |
| `frontend/src/components/ResultCard.tsx` | F1: alteration warning banner + Original Creator / Morphed By rows |
| `frontend/src/pages/Morph.tsx` | NEW — full morph page (upload → origin check → pick transform → preview → register) |

---

## Deploy Checklist

### Railway (Backend)

Add one new environment variable:
```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
```
Get a free key at resend.com → API Keys → Create key (3,000 emails/month free).

All other variables already set:
```
ALGORAND_ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGORAND_ALGOD_TOKEN=aaaa...aaaa
ALGORAND_APP_ID=<deployed app id>
DEPLOYER_MNEMONIC=<25-word mnemonic>
FRONTEND_URL=https://your-vercel-url.vercel.app
MONGODB_URI=mongodb+srv://...
JWT_SECRET_KEY=<secret>
```

### Vercel (Frontend)

No new env vars needed. `VITE_BACKEND_URL` already set.

### Deploy Steps

```bash
# Push feature branch to GitHub — Railway + Vercel auto-redeploy
git add .
git commit -m "implement all 5 features: alteration detection, email, morph, progressive auth, dedup fix"
git push origin feature
```

Then optionally merge to main:
```bash
git checkout main
git merge feature
git push origin main
```

---

## Architecture (Final)

```
User Browser (Vercel)
  ├── /generate  — AI image creation + silent Algorand registration (auth inline, not forced)
  ├── /morph     — Upload → transform → certify derivative (provenance chain)
  ├── /verify    — Public verification portal (no auth needed)
  └── /login     — Signup / login (JWT)
        │
        │  fetch() HTTP
        ▼
FastAPI Backend (Railway)
  ├── /api/generate-image  — Pollinations proxy + LoremFlickr fallback
  ├── /api/register        — pHash + Algorand + MongoDB (F1 alteration detection, F5 dedup)
  ├── /api/verify          — Blockchain lookup enriched with MongoDB modification info
  ├── /api/morph           — Pillow transforms → returns morphed image as base64
  ├── /api/flag            — On-chain misuse report + F2 email notification
  ├── /api/certificate     — PDF cert (supports morphed-by provenance chain)
  └── /api/auth/*          — JWT auth (signup / login)
        │
        ├── MongoDB Atlas
        │     ├── users          — auth accounts
        │     └── registrations  — pHash mirror for dedup + alteration tracking + email lookup
        │
        └── Algorand TestNet (via AlgoNode)
              └── GenMark Contract (Box storage: pHash → ContentRecord + ASA minting)
```

---

## How the 3 Core Features Connect (Demo Story)

```
Feature 3 (Morph Tool) — /morph page
        │  Upload original → pick transform → new image with new pHash (Hamming ≤ 10)
        ▼
Feature 1 (Alteration Detection) — /api/register + /api/verify
        │  Detects Hamming distance ≤ 10 → links new pHash to original creator
        │  Generate page shows: "⚠ Modified Content — derived from Alice's work"
        │  Verify page shows: Original Creator + Morphed By rows in ResultCard
        ▼
Feature 2 (Email) — /api/flag → email.py → Resend
        │  When misuse reported: email sent to original creator
        │  "Your content was flagged — permanently recorded on Algorand"
        ▼
Certificate PDF (certificate.py)
        │  CREATOR         : Bob
        │  MORPHED BY      : Bob
        │  ORIGINAL HASH   : a9e3c4b2f1d08e7a
        │  Both on-chain — unforgeable provenance
```

---

## Smart Contract — No Changes Needed

ABI methods unchanged, no redeploy needed:
```
register_content(string,string,string,pay)uint64
verify_content(string)(bool,(string,address,string,uint64,uint64,uint64))
flag_misuse(string,string,pay)uint64
get_flag(string,uint64)string
```

Alteration tracking is entirely in MongoDB. The contract registers each pHash as an independent record.

---

## MongoDB Collections

**`users`** — auth accounts (unchanged)

**`registrations`** — pHash mirror (new):
```json
{
  "phash": "a9e3c4b2f1d08e7a",
  "creator_name": "Alice",
  "creator_email": "alice@example.com",
  "timestamp": "2026-02-20T10:00:00",
  "is_modification": false,
  "original_phash": null,
  "modified_by_name": null,
  "morph_type": null
}
```

Morph entry:
```json
{
  "phash": "a9e3c4b2f1d08e7b",
  "creator_name": "Bob",
  "creator_email": "bob@example.com",
  "is_modification": true,
  "original_phash": "a9e3c4b2f1d08e7a",
  "modified_by_name": "Bob",
  "morph_type": "brightness"
}
```

---

## Deployer Account

- **Address:** `K3SFBBGKSEWGDW3Q4KAPKTI33ING3HLND5YSJVJH467MHA5K72FKCTXRDQ`
- **Network:** Algorand TestNet via AlgoNode
