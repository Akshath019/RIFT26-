# CLAUDE.md — GenMark AI Content Origin Platform

## Project Overview

GenMark is an AI content provenance platform built on Algorand TestNet.
Every AI-generated image is silently registered on-chain using a perceptual hash (pHash)
at the moment of creation. Anyone can later verify who created any image and when —
even if the image was cropped, compressed, or resized.

**Monorepo structure (AlgoKit):**
- `projects/contracts/` — Algorand Python smart contracts (Puya)
- `projects/backend/` — FastAPI backend (pHash, blockchain calls, PDF certs)
- `projects/frontend/` — React + TailwindCSS frontend (two pages)

---

## Current State (2026-02-20)

- Frontend: RUNNING at localhost:5173 / Vercel
- Backend: RUNNING at localhost:8000 / Railway
- Contract: COMPILED and DEPLOYED on TestNet
- Auth: ADDED — MongoDB Atlas signup/login with JWT
- Certificate: SIMPLIFIED — clean 1-page PDF (creator name + date)
- Generate page: GATED — login required to generate images
- Image generation: WORKING (Picsum Photos, free, deterministic)

---

## Full Installation & Running Guide

### Prerequisites (install once, system-wide)

```bash
# 1. Node.js v18+ (for frontend)
#    Download from https://nodejs.org or use nvm:
nvm install 18 && nvm use 18

# 2. Python 3.12+ (for backend and contracts)
#    Download from https://python.org

# 3. AlgoKit CLI (for contracts)
pip install algokit

# 4. Poetry (for contracts dependency management)
pip install poetry
# or on Windows:
# (Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -
```

---

### Frontend — React + TailwindCSS

```bash
# Navigate to frontend project
cd projects/frontend

# Install all npm dependencies (first time or after package.json changes)
npm install

# Start development server at http://localhost:5173
npm run dev

# Build for production (outputs to dist/)
npm run build

# Preview production build locally
npm run preview
```

**Required env file** (`projects/frontend/.env`):
```
VITE_BACKEND_URL=http://localhost:8000
```

---

### Backend — FastAPI + pHash + Algorand

```bash
# Navigate to backend project
cd projects/backend

# (Recommended) Create a virtual environment first
python -m venv venv
source venv/bin/activate          # Linux/Mac
venv\Scripts\activate             # Windows

# Install all Python dependencies
pip install -r requirements.txt

# Start development server at http://localhost:8000 (auto-reloads on save)
uvicorn main:app --reload --port 8000

# API docs (Swagger UI) available at:
#   http://localhost:8000/docs
# ReDoc available at:
#   http://localhost:8000/redoc
```

**Key packages installed by `requirements.txt`:**

| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | 0.115.6 | Web framework |
| `uvicorn[standard]` | 0.34.0 | ASGI server |
| `Pillow` | 11.1.0 | Image decoding (JPEG, PNG, WebP…) |
| `ImageHash` | 4.3.1 | Perceptual hash (pHash) algorithm |
| `py-algorand-sdk` | latest | Algorand blockchain calls |
| `httpx` | 0.28.1 | Async HTTP (fetch images from URLs) |
| `reportlab` | 4.2.5 | PDF certificate generation |
| `python-multipart` | 0.0.20 | File upload support in FastAPI |
| `python-dotenv` | 1.0.1 | Load `.env` file |

**Required env file** (`projects/backend/.env`):
```
ALGORAND_ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGORAND_ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ALGORAND_APP_ID=<number from deploy>
DEPLOYER_MNEMONIC=<your 25-word mnemonic>
FRONTEND_URL=http://localhost:5173
```

---

### Smart Contracts — Algorand Python (Puya)

```bash
# Navigate to contracts project
cd projects/contracts

# Install Python dependencies via Poetry
poetry install

# Compile smart contracts → generates artifacts in smart_contracts/artifacts/
poetry run python -m smart_contracts build
# or:
algokit project run build

# Deploy to Algorand TestNet (prints App ID — copy it to backend .env)
algokit project deploy testnet

# Run contract tests
poetry run pytest tests/
```

**Required env file** (`projects/contracts/.env.testnet`):
```
ALGOD_SERVER=https://testnet-api.algonode.cloud
DEPLOYER_MNEMONIC=<your 25-word mnemonic>
DISPENSER_MNEMONIC=<your 25-word mnemonic>
```

---

### Algorand Account Management

```bash
# Fund a TestNet address with free ALGO from the faucet
algokit dispenser login                        # Opens browser — sign in with GitHub
algokit dispenser fund --receiver <ADDRESS> --amount 10000000  # Sends 10 ALGO

# Check account balance
algokit goal account info --address <ADDRESS>
```

---

### Full Start Sequence (fresh machine)

```bash
# Terminal 1 — Backend
cd projects/backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# create .env file with DEPLOYER_MNEMONIC, ALGORAND_APP_ID, MONGODB_URI, JWT_SECRET_KEY
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd projects/frontend
npm install
npm run dev

# Open http://localhost:5173/login
```

---

## Architecture

### Smart Contract (`projects/contracts/smart_contracts/genmark/contract.py`)
Written in **Algorand Python (Puya)**. Key design:

```python
class ContentRecord(arc4.Struct):
    creator_name:    arc4.String
    creator_address: arc4.Address  # 32-byte on-chain address
    platform:        arc4.String
    timestamp:       arc4.UInt64   # Unix seconds
    asa_id:          arc4.UInt64   # Soulbound certificate ASA
    flag_count:      arc4.UInt64   # Misuse report count

class GenMark(ARC4Contract):
    total_registrations: UInt64
    # BoxMap: pHash → ContentRecord (namespace "reg_")
    # Flag boxes: "flg_" + phash.bytes + itob(flag_index) via op.Box.put()
```

**ABI Methods:**
- `register_content(phash, creator_name, platform, pay) → uint64` — creates box + mints ASA
- `verify_content(phash) → (bool, ContentRecord)` — read-only lookup
- `flag_misuse(phash, description, pay) → uint64` — immutable misuse report
- `get_flag(phash, flag_index) → string` — read-only flag retrieval

### Backend (`projects/backend/`)
FastAPI service — the **ONLY** component that touches the blockchain.

- `main.py` — endpoints: `/api/register`, `/api/verify`, `/api/flag`, `/api/certificate`
- `hashing.py` — `imagehash.phash()` for perceptual fingerprinting
- `algorand.py` — `algosdk` AtomicTransactionComposer ABI calls
- `certificate.py` — `reportlab` PDF forensic certificate generation

### Frontend (`projects/frontend/src/`)
React + TailwindCSS. **Zero blockchain code** — all Algorand calls go through the backend.

- `App.tsx` — React Router v7 with two routes
- `pages/Generate.tsx` — AI image generation + silent registration
- `pages/Verify.tsx` — public verification portal
- `components/DropZone.tsx` — drag-and-drop image upload
- `components/ResultCard.tsx` — Verified/Not Found card + misuse modal
- `components/StampBadge.tsx` — "Content Certified ✓" overlay badge

### Image Generation
Uses **Pollinations AI** — completely free, no API key needed:
```
https://image.pollinations.ai/prompt/{encoded_prompt}?width=512&height=512&nologo=true&seed=42
```
Fixed seed=42 ensures same prompt → same image → same pHash (deterministic).

---

## Environment Files

### Backend (`projects/backend/.env`) — CREATED:
```
ALGORAND_ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGORAND_ALGOD_TOKEN=aaaa...aaaa (64 a's — AlgoNode accepts any token)
ALGORAND_APP_ID=<deployed app id>
DEPLOYER_MNEMONIC=birth heart ... medal (25 words)
FRONTEND_URL=http://localhost:5173
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/genmark  ← MongoDB Atlas
JWT_SECRET_KEY=<random 32+ char string>  ← JWT signing secret
```

#### MongoDB Atlas Setup (one-time, free):
1. **mongodb.com/atlas** → Create free account → New Project → Create M0 cluster (free tier)
2. **Database Access** → Add Database User → username + password → Read/Write
3. **Network Access** → Add IP → `0.0.0.0/0` (allow all — required for Railway)
4. **Connect** → Drivers → Python → Copy connection string
5. Replace `<password>` in the connection string with your DB user password
6. Add `MONGODB_URI` and `JWT_SECRET_KEY` to Railway environment variables

#### Generate JWT_SECRET_KEY:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Frontend (`projects/frontend/.env`) — CREATED:
```
VITE_BACKEND_URL=http://localhost:8000
```

### Contracts (`projects/contracts/.env.testnet`) — CREATED, needs DISPENSER_MNEMONIC:
```
ALGOD_SERVER=https://testnet-api.algonode.cloud
DEPLOYER_MNEMONIC=birth heart ... medal
DISPENSER_MNEMONIC=birth heart ... medal  ← same mnemonic for TestNet
```

---

## Puya Compiler Rules (CRITICAL — learned from build errors)

These are Puya-specific constraints that differ from standard Python:

1. **No `_` variable name** — use a real name or index access
2. **No tuple unpacking for ARC-4 mutable refs** — `BoxMap.maybe()` returns a tuple with an ARC-4 ref; you CANNOT unpack or assign it to a variable
3. **Use `key in boxmap`** — for existence checks instead of `.maybe()[1]`
4. **Use `boxmap[key]` directly** — for reading fields: `self.registry[phash].flag_count`
5. **Use `boxmap[key].field = value`** — for in-place field updates
6. **Always `.copy()` ARC-4 values** — when returning: `self.registry[phash].copy()`
7. **`op.Box.put()` not `op.box_put()`** — box opcodes are under the `op.Box` class
8. **`op.Box.get()` not `op.box_get()`** — returns `tuple[Bytes, bool]`

### Correct Puya Patterns for BoxMap with ARC-4 Structs

```python
# CHECK EXISTENCE:
assert phash in self.registry, "Not found"
# or:
if phash not in self.registry:
    return arc4.Bool(False), empty_record

# READ FULL RECORD (returns a copy):
record = self.registry[phash].copy()

# READ ONE FIELD:
count = self.registry[phash].flag_count.native

# UPDATE ONE FIELD IN-PLACE:
self.registry[phash].flag_count = arc4.UInt64(new_value)

# WRITE NEW RECORD:
self.registry[phash] = ContentRecord(
    creator_name=creator_name,
    creator_address=arc4.Address(Txn.sender),
    ...
)

# RAW BOX OPERATIONS (for non-BoxMap boxes like flags):
op.Box.put(key_bytes, value_bytes)
data, exists = op.Box.get(key_bytes)
```

---

## ABI Method Signatures (for algosdk in backend)

```
register_content(string,string,string,pay)uint64
verify_content(string)(bool,(string,address,string,uint64,uint64,uint64))
flag_misuse(string,string,pay)uint64
get_flag(string,uint64)string
```

---

## Deployer Account

- **Address:** K3SFBBGKSEWGDW3Q4KAPKTI33ING3HLND5YSJVJH467MHA5K72FKCTXRDQ
- **Balance:** 10.0 TestNet ALGO
- **Network:** Algorand TestNet via AlgoNode

---

## What is App ID?

Think of it like a **phone number for the smart contract**.

- You write `contract.py` → deploy it → Algorand assigns a permanent number e.g. `755794932`
- The backend uses `ALGORAND_APP_ID=755794932` to know WHICH contract to call
- Without it → backend crashes with "ALGORAND_APP_ID not set"
- The contract itself lives on-chain forever after deploy — it never goes down

---

## Full Online Deployment Plan

### Phase 1 — Deploy Smart Contract (get App ID)

```bash
# Fix .env.testnet — mnemonic must be on ONE line, no line breaks
# Then:
cd projects/contracts
algokit project deploy testnet
# Output: "Deployed app GenMark, App ID: <NUMBER>"
# Copy that number → put in projects/backend/.env as ALGORAND_APP_ID=<NUMBER>
```

### Phase 2 — Deploy Backend Online (Railway + Docker — Free)

Railway detects your Dockerfile automatically and builds + runs it.

1. Go to `railway.app` → Sign up with GitHub
2. New Project → Deploy from GitHub repo → select your repo
3. Railway asks which folder → set **Root Directory: `projects/backend`**
4. Railway detects `Dockerfile` automatically — no extra config needed
5. Go to **Variables** tab → add every variable below (copy-paste exact names):

   | Variable | Value |
   |----------|-------|
   | `ALGORAND_ALGOD_SERVER` | `https://testnet-api.algonode.cloud` |
   | `ALGORAND_ALGOD_TOKEN` | `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` |
   | `ALGORAND_APP_ID` | `<your App ID from Phase 1>` |
   | `DEPLOYER_MNEMONIC` | `<your 25-word mnemonic — all on one line>` |
   | `FRONTEND_URL` | `https://your-vercel-url.vercel.app` (fill after Phase 3) |

6. Railway builds the Docker image and starts it → you get a URL like:
   `https://genmark-backend-production.up.railway.app`
7. Test it: open `https://genmark-backend-production.up.railway.app/health` in browser
   → should show `{"status":"healthy","app_id_configured":true}`

### Phase 3 — Deploy Frontend Online (Railway + Docker OR Vercel — Free)

**Option A: Vercel (simpler — recommended for frontend)**
1. Go to `vercel.com` → Sign up with GitHub → Add New Project → import your repo
2. Configure:
   - Root Directory: `projects/frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Add Environment Variable: `VITE_BACKEND_URL` = `https://genmark-backend.railway.app`
4. Deploy → get URL like `https://genmark.vercel.app`

**Option B: Railway + Docker (same platform as backend)**
1. On Railway → New Service in same project → GitHub repo
2. Root Directory: `projects/frontend`
3. Railway detects `Dockerfile` automatically
4. Variables → add: `VITE_BACKEND_URL` = `https://genmark-backend.railway.app`
   ⚠ This is a BUILD ARG — Railway will pass it during image build (Vite bakes it in)
5. Deploy → get URL like `https://genmark-frontend.railway.app`

### Phase 4 — Connect and Verify

1. Back in Railway backend service → Variables → update:
   `FRONTEND_URL` = `https://genmark.vercel.app` (or your Railway frontend URL)
2. Redeploy backend
3. Open your frontend URL → Generate → type prompt → Create Image
   → green "Content Certified ✓" badge = blockchain working
4. Save image → Verify → Upload → green "Verified Original" card

### Cost

| Service | Cost |
|---------|------|
| Algorand TestNet | Free (fake ALGO) |
| Railway (backend Docker) | Free: $5 credit/month — enough for hackathon |
| Vercel (frontend) | Free forever |
| AlgoNode (blockchain API) | Free forever |

**Total: $0**

---

## Docker Files (created)

| File | Purpose |
|------|---------|
| `projects/backend/Dockerfile` | Python 3.12 + FastAPI + Pillow deps |
| `projects/backend/.dockerignore` | Excludes venv, .env, __pycache__ |
| `projects/frontend/Dockerfile` | Multi-stage: Node 20 build → nginx serve |
| `projects/frontend/.dockerignore` | Excludes node_modules, dist, .env |
| `projects/frontend/nginx.conf` | nginx config with React Router support |
| `docker-compose.yml` | Local development — runs both services |

## Local Docker Development

```bash
# From project root — builds and starts both backend + frontend
docker compose up --build

# Then open:
#   Frontend: http://localhost:5173
#   Backend:  http://localhost:8000
#   API docs: http://localhost:8000/docs

# Stop everything
docker compose down
```

⚠ Before running locally: `projects/backend/.env` must exist with `ALGORAND_APP_ID` set.

---

## Remaining TODO

1. Create MongoDB Atlas free cluster → get connection string
2. Add `MONGODB_URI` + `JWT_SECRET_KEY` to Railway environment variables
3. Push all changes to GitHub → Railway + Vercel auto-redeploy
4. Test: visit `/login` → signup → generate image → verify → download certificate

---

## Auth Architecture

### Backend (`projects/backend/auth.py`)
- `get_db()` — returns async Motor MongoDB client for database `genmark`
- `UserCreate` / `UserLogin` — Pydantic models for signup/login
- `hash_password()` / `verify_password()` — bcrypt via passlib
- `create_token()` / `decode_token()` — HS256 JWT (7-day expiry)

### Backend Auth Endpoints
- `POST /api/auth/signup` — creates user in MongoDB, returns JWT + name + email
- `POST /api/auth/login` — verifies password, returns JWT + name + email

### Frontend (`projects/frontend/src/hooks/useAuth.ts`)
- Reads/writes `genmark_user` key in localStorage
- `login(data)` — stores `{token, name, email}`
- `logout()` — clears storage, redirects to `/login`

### Route Protection (`projects/frontend/src/App.tsx`)
- `ProtectedRoute` — wraps `/generate`; redirects to `/login` if no localStorage token
- `/verify` — public, no auth required

---

## File Locations Quick Reference

| What | Where |
|------|-------|
| GenMark contract | `projects/contracts/smart_contracts/genmark/contract.py` |
| Deploy config | `projects/contracts/smart_contracts/genmark/deploy_config.py` |
| Contract tests | `projects/contracts/tests/genmark_test.py` |
| Backend main | `projects/backend/main.py` |
| Auth helpers | `projects/backend/auth.py` |
| pHash logic | `projects/backend/hashing.py` |
| Algorand calls | `projects/backend/algorand.py` |
| PDF certificates | `projects/backend/certificate.py` |
| Backend env | `projects/backend/.env` |
| Backend env template | `projects/backend/.env.example` |
| Contracts env | `projects/contracts/.env.testnet` |
| Login page | `projects/frontend/src/pages/Login.tsx` |
| Generate page | `projects/frontend/src/pages/Generate.tsx` |
| Verify page | `projects/frontend/src/pages/Verify.tsx` |
| Auth hook | `projects/frontend/src/hooks/useAuth.ts` |
| ResultCard component | `projects/frontend/src/components/ResultCard.tsx` |
| StampBadge component | `projects/frontend/src/components/StampBadge.tsx` |
| Frontend routing | `projects/frontend/src/App.tsx` |
| Frontend env | `projects/frontend/.env` |
| Vercel config | `projects/frontend/vercel.json` |
| Full plan | `plan.md` |

---

## Documentation Resources

| Resource | URL |
|----------|-----|
| Algorand Python (Puya) | https://algorandfoundation.github.io/puya/ |
| algopy API reference | https://algorandfoundation.github.io/puya/api.html |
| AlgoKit CLI | https://github.com/algorandfoundation/algokit-cli |
| algosdk Python SDK | https://py-algorand-sdk.readthedocs.io/ |
| ARC-4 spec | https://arc.algorand.foundation/ARCs/arc-0004 |
| Box Storage guide | https://developer.algorand.org/docs/get-details/dapps/smart-contracts/apps/state/#box-storage |

## Image Signature — How pHash Works

We use **Perceptual Hashing (pHash)** — not SHA-256.

**Library:** `ImageHash 4.3.1` + `Pillow 11.1.0`
**File:** `projects/backend/hashing.py`

### Pipeline
1. Raw image bytes arrive (upload or URL fetch)
2. `PIL.Image.open()` decodes any format (JPEG, PNG, WebP, GIF…)
3. Converted to RGB to normalise all formats
4. `imagehash.phash(img, hash_size=8)` runs:
   - Resize to 32×32 pixels
   - Apply DCT (Discrete Cosine Transform) on pixel values
   - Take top-left 8×8 DCT coefficients block (64 values)
   - Compare each to the median → 1 if above, 0 if below
   - Pack 64 bits → **16-char lowercase hex string** e.g. `cdcd3a32664c4d1b`
5. That hex string is stored on-chain as the content fingerprint

### Why Not SHA-256?
SHA-256 changes completely if you re-save, resize, or compress even 1 pixel.
pHash stays the same (Hamming distance < 4) even after:
- JPEG re-compression
- Resize / downscale
- Minor crop
- Format conversion (PNG → JPEG)

**Hamming distance threshold used: 4 bits**
0 = exact match | 1–4 = same image (minor edit) | >15 = different image

## Current Date
Today: 2026-02-20
