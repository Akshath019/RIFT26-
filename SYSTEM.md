# SYSTEM.md — GenMark System Architecture

## Project: GenMark — AI Content Provenance & Misuse Detection Platform

Built on Algorand TestNet. Every AI-generated image receives an unforgeable birth certificate
at the moment of creation using perceptual hashing. Anyone can verify who created any image and
when — even after cropping, compression, resizing, or format conversion.

**Deployed App ID:** `755880383` (Algorand TestNet)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 1: Frontend (Vercel)                                          │
│  React 18 + TailwindCSS + React Router v7                           │
│  /login    — Signup / Login (JWT)                                   │
│  /generate — AI image creation + silent on-chain registration       │
│  /morph    — Upload image, apply transform, register derivative     │
│  /verify   — Public verification portal (no account required)       │
│  Zero blockchain code — all calls go to Backend via fetch()         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP/REST
┌──────────────────────────▼──────────────────────────────────────────┐
│  TIER 2: Backend (Railway)                                          │
│  FastAPI + Python 3.12                                              │
│  imagehash pHash computation (stable across minor image edits)      │
│  algosdk AtomicTransactionComposer → Algorand TestNet               │
│  ReportLab PDF forensic certificate generation                      │
│  bcrypt + JWT HS256 authentication                                  │
│  Resend API email notifications on misuse flagging                  │
│  Endpoints: /api/register /api/verify /api/flag /api/certificate    │
│             /api/morph /api/auth/signup /api/auth/login             │
└──────────────────────────┬────────────────────┬─────────────────────┘
                           │ algosdk ABI calls  │ Motor async driver
┌──────────────────────────▼───┐  ┌─────────────▼──────────────────────┐
│  TIER 3: Algorand TestNet    │  │  TIER 4: MongoDB Atlas (free tier) │
│  GenMark Smart Contract      │  │  Collection: users                 │
│  App ID: 755880383           │  │    {name, email, password_hash}    │
│  Box storage: pHash →        │  │  Collection: registrations         │
│    ContentRecord (8 fields)  │  │    {phash, creator_name,           │
│  Flag boxes: per-report      │  │     creator_email}                 │
│  Soulbound ASA per reg.      │  │  Purpose: email lookup for         │
│  Global: total_registrations │  │  misuse notifications only.        │
└──────────────────────────────┘  │  Provenance chain lives on-chain.  │
                                  └────────────────────────────────────┘
```

---

## Monorepo Structure

```
Hackathon-QuickStart-template/
├── CLAUDE.md                        # Claude Code assistant context
├── SYSTEM.md                        # This file — system architecture
├── README.md                        # User-facing project description
├── plan.md                          # Implementation plan (provenance chain)
├── docker-compose.yml               # Local dev: backend + frontend
│
├── projects/
│   ├── contracts/                   # Smart contract project (AlgoKit)
│   │   ├── smart_contracts/
│   │   │   ├── genmark/
│   │   │   │   ├── contract.py      # GenMark ARC-4 contract (DEPLOYED)
│   │   │   │   └── deploy_config.py # Deployment script
│   │   │   └── artifacts/           # Compiled TEAL + ARC-56 + clients
│   │   ├── tests/
│   │   │   └── genmark_test.py      # GenMark test suite
│   │   ├── pyproject.toml
│   │   └── poetry.toml
│   │
│   ├── backend/                     # FastAPI backend
│   │   ├── main.py                  # FastAPI app + all endpoints
│   │   ├── hashing.py               # Perceptual hash computation (pHash)
│   │   ├── algorand.py              # Algorand ABI calls + retry logic
│   │   ├── certificate.py           # PDF forensic certificate (ReportLab)
│   │   ├── auth.py                  # MongoDB + bcrypt + JWT
│   │   ├── notifications.py         # Resend API email notifications
│   │   ├── requirements.txt         # Python dependencies
│   │   ├── .env.example             # Environment variable template
│   │   └── Dockerfile               # Railway Docker deployment
│   │
│   └── frontend/                    # React frontend project
│       ├── src/
│       │   ├── App.tsx              # React Router v7 (4 routes + ProtectedRoute)
│       │   ├── hooks/
│       │   │   └── useAuth.ts       # JWT localStorage auth hook
│       │   ├── pages/
│       │   │   ├── Login.tsx        # Signup / Login page
│       │   │   ├── Generate.tsx     # AI generation + silent registration
│       │   │   ├── Morph.tsx        # Image transform + derivative registration
│       │   │   └── Verify.tsx       # Public verification + provenance timeline
│       │   └── components/
│       │       ├── DropZone.tsx     # Drag-and-drop image upload
│       │       ├── ResultCard.tsx   # Verified/Not Found card + misuse modal
│       │       └── StampBadge.tsx   # "Content Certified" overlay badge
│       ├── vercel.json              # SPA routing rewrite rules
│       └── Dockerfile               # Vercel / Railway Docker deployment
```

---

## Technology Stack

### Smart Contract Layer
| Component | Technology |
|-----------|------------|
| Language | Algorand Python (Puya) |
| Compiler | AlgoKit CLI 2.0+ |
| ABI Standard | ARC-4 / ARC-56 |
| Storage | BoxMap (registry) + raw op.Box.put (flags) |
| Testing | algorand-python-testing |
| Dependency Mgmt | Poetry |

### Backend Layer
| Component | Technology |
|-----------|------------|
| Framework | FastAPI 0.115+ |
| ASGI Server | Uvicorn 0.34+ |
| Hashing | imagehash 4.3+ (pHash) + Pillow 11+ |
| Blockchain SDK | algosdk (py-algorand-sdk) |
| PDF Generation | ReportLab 4.2+ |
| HTTP Client | httpx 0.28+ |
| Auth | Motor (async MongoDB) + passlib bcrypt + PyJWT |
| Email | Resend Python SDK |
| Deployment | Railway (Docker) |

### Frontend Layer
| Component | Technology |
|-----------|------------|
| Framework | React 18 |
| Language | TypeScript 5.0+ |
| Build Tool | Vite 5.0+ |
| Styling | TailwindCSS 3 |
| Routing | React Router v7 |
| Deployment | Vercel |

### Infrastructure
| Service | Purpose | Cost |
|---------|---------|------|
| Algorand TestNet | Smart contract + ASA minting | Free |
| AlgoNode | Algod API endpoint | Free |
| Railway | Backend Docker hosting | Free ($5/mo credit) |
| Vercel | Frontend hosting + CDN | Free |
| MongoDB Atlas M0 | User auth + email lookup | Free |
| Resend | Misuse notification emails | Free (100/day) |

---

## Smart Contract: GenMark

**File:** `projects/contracts/smart_contracts/genmark/contract.py`
**App ID:** `755880383` (Algorand TestNet)
**Standard:** ARC-4, Box Storage

### ContentRecord (8-field ARC-4 Struct)
```python
class ContentRecord(arc4.Struct):
    creator_name:    arc4.String   # Original creator, propagated through entire chain
    creator_address: arc4.Address  # 32-byte Algorand wallet address
    platform:        arc4.String   # Platform name (e.g. "GenMark")
    timestamp:       arc4.UInt64   # Unix timestamp of registration
    asa_id:          arc4.UInt64   # Soulbound ASA ID (ownership certificate)
    flag_count:      arc4.UInt64   # Number of misuse reports
    original_phash:  arc4.String   # Parent pHash; "" if this is original content
    morphed_by:      arc4.String   # Who morphed this; "" if original content
```

### Provenance Chain Design
```
pHash=A: creator_name="Alice", original_phash="",  morphed_by=""
pHash=B: creator_name="Alice", original_phash="A", morphed_by="Bob"
pHash=C: creator_name="Alice", original_phash="B", morphed_by="Carol"
```
Walking C→B→A via `original_phash` links gives the full ancestry chain.
`build_provenance_chain_from_blockchain(C)` returns `[A_step, B_step, C_step]` (oldest first).

### Storage Layout
| Box Key | Value | Namespace |
|---------|-------|-----------|
| `b"reg_" + arc4_encode(phash)` | `ContentRecord` | Registry |
| `b"flg_" + phash.bytes + itob(flag_idx)` | `arc4.String` | Flags |

### ABI Methods
| Method | Args | Returns | Access |
|--------|------|---------|--------|
| `register_content` | phash, creator_name, platform, original_phash, morphed_by, pay | uint64 (asa_id) | Write |
| `verify_content` | phash | (bool, ContentRecord) | ReadOnly |
| `flag_misuse` | phash, description, pay | uint64 (flag_index) | Write |
| `get_flag` | phash, flag_index | string | ReadOnly |

### Soulbound ASA Properties
- `total = 1` — non-fungible
- `decimals = 0` — indivisible
- `default_frozen = True` — recipients frozen by default
- `manager = freeze = clawback = contract_address` — contract-only management

### Payment Requirements
- Register: minimum 200,000 μALGO (covers box MBR + ASA creation)
- Flag: minimum 50,000 μALGO (covers flag box MBR)

---

## Backend API Reference

**Base URL:** `http://localhost:8000` (dev) / Railway URL (production)

### Endpoints

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| GET | `/health` | None | — | `{status, app_id_configured, app_id, mnemonic_configured}` |
| GET | `/api/generate-image?prompt=` | None | query | JPEG bytes |
| POST | `/api/register` | None | multipart: image/image_url/prompt + creator_name + platform + morphed_by? + original_phash? + creator_email? | `{success, already_registered, phash_collision_with_original, tx_id, asa_id, phash, app_id, is_modification, original_phash, morphed_by}` |
| POST | `/api/verify` | None | multipart: image/image_url | `{found, creator_name, creator_address, platform, timestamp, asa_id, flag_count, phash, app_id, original_phash, morphed_by, is_modification, provenance_chain}` |
| POST | `/api/flag` | None | JSON: `{phash, description}` | `{success, tx_id, flag_index, phash}` |
| POST | `/api/certificate` | None | JSON: `{tx_id, creator_name, platform, timestamp, asa_id, app_id, phash, flag_descriptions?, modified_by?, original_phash?, provenance_chain?}` | PDF bytes |
| POST | `/api/morph` | None | multipart: image + morph_type | `{original_phash, morphed_phash, hamming_distance, original_registered, original_creator, original_morphed_by, provenance_chain, morphed_image_b64, morph_type}` |
| POST | `/api/auth/signup` | None | JSON: `{name, email, password}` | `{token, name, email}` |
| POST | `/api/auth/login` | None | JSON: `{email, password}` | `{token, name, email}` |

### Morph Transform Types
| ID | Effect | pHash Change |
|----|--------|-------------|
| `brightness` | Brighten 1.5x | Often 0 bits (subtle) |
| `contrast` | Contrast 1.6x | Often 0 bits (subtle) |
| `saturation` | Saturate 1.7x | Often 0 bits (subtle) |
| `blur` | Gaussian blur r=3 | Moderate change |
| `rotate` | Rotate 15° | Reliable pHash change |
| `crop` | 10% center crop + resize | Reliable pHash change |

### Blockchain Retry Logic
```python
# register_content_on_chain: 3 attempts, 4-second delay on timeout
# verify_content_on_chain: 2 attempts, 2-second delay on timeout
# Reason: AlgoNode TestNet can be slow (30s+ timeout)
```

---

## Frontend Routes

| Path | Component | Auth | Description |
|------|-----------|------|-------------|
| `/` | → redirect | None | Redirects to /generate |
| `/login` | `Login.tsx` | None | Signup / Login (tab-switchable) |
| `/generate` | `Generate.tsx` | Required | AI image creation + silent registration |
| `/morph` | `Morph.tsx` | Optional* | Upload → transform → certify derivative |
| `/verify` | `Verify.tsx` | None | Public image origin verification |
| `/*` | → redirect | None | Catch-all → /generate |

*Morph page: browsing and morphing is public; registration requires login.

### ProvenanceTimeline (Verify page)
Displays multi-hop chain when `provenance_chain.length > 1`:
```
Alice (original) → Bob (morphed) → Carol (morphed)
   pHash=A              pHash=B          pHash=C
```
Each step links to Algorand TestNet explorer for the transaction.

### ResultCard display logic
- `result.morphed_by` truthy → banner shows "Derived Content" (violet theme)
- `result.morphed_by` falsy → banner shows "Verified Original" (emerald theme)
- "Morphed By" row appears when `result.morphed_by` is truthy (no double condition)

---

## Environment Variables

### Backend (Railway)
| Variable | Required | Description |
|----------|----------|-------------|
| `ALGORAND_ALGOD_SERVER` | Yes | `https://testnet-api.algonode.cloud` |
| `ALGORAND_ALGOD_TOKEN` | No | 64-char token (any value for AlgoNode) |
| `ALGORAND_APP_ID` | Yes | `755880383` |
| `DEPLOYER_MNEMONIC` | Yes | 25-word account mnemonic (one line) |
| `FRONTEND_URL` | Yes | Vercel frontend URL for CORS |
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET_KEY` | Yes | 32+ char random secret |
| `RESEND_API_KEY` | No | Resend API key for email alerts |

### Frontend (Vercel)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_BACKEND_URL` | Yes | Railway backend URL |

---

## Deployment Order

```
1. algokit project run build           # Compile contract
2. algokit project deploy testnet      # Deploy → prints App ID (755880383)
3. Set ALGORAND_APP_ID in Railway env vars
4. Deploy backend on Railway (Docker)  # Get Railway URL
5. Set VITE_BACKEND_URL in Vercel env vars
6. Deploy frontend on Vercel           # Get Vercel URL
7. Set FRONTEND_URL in Railway env vars → redeploy backend
```

---

## MongoDB Atlas Setup (one-time)

1. mongodb.com/atlas → Create free M0 cluster
2. Database Access → Add user (read/write)
3. Network Access → Allow `0.0.0.0/0`
4. Connect → Drivers → Python → copy connection string
5. Replace `<password>` → add `MONGODB_URI` to Railway env vars

Generate JWT secret:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## AlgoKit CLI Usage

| Command | Purpose |
|---------|---------|
| `algokit project bootstrap all` | Install all Python + Node dependencies |
| `algokit project run build` | Compile all contracts with Puya |
| `algokit localnet start` | Start local Algorand node (Docker) |
| `algokit localnet stop` | Stop local node |
| `algokit project run test` | Run pytest suite |
| `algokit project deploy testnet` | Deploy to TestNet |
| `algokit generate account` | Generate new deployer account |
