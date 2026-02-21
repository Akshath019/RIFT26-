# CLAUDE.md — GenMark AI Content Origin Platform

## Project Overview

GenMark is an AI content provenance platform built on Algorand TestNet.
Every AI-generated image is silently registered on-chain using a perceptual hash (pHash)
at the moment of creation. Anyone can later verify who created any image and when —
even if the image was cropped, compressed, or resized.

**Monorepo structure (AlgoKit):**
- `projects/contracts/` — Algorand Python smart contracts (Puya)
- `projects/backend/` — FastAPI backend (pHash, blockchain calls, PDF certs, auth)
- `projects/frontend/` — React + TailwindCSS frontend (4 pages)

---

## Current State (2026-02-21)

- Frontend: RUNNING at localhost:5173 / Vercel
- Backend: RUNNING at localhost:8000 / Railway
- Contract: COMPILED and DEPLOYED on TestNet
- App ID: **755880383**
- Auth: MongoDB Atlas signup/login with JWT (7-day tokens)
- Certificate: Clean 1-page PDF with provenance chain
- Generate page: Login-gated — requires JWT token
- Morph page: Upload any image, apply transform, register derivative on-chain
- Verify page: Public — no login required, shows full provenance chain
- Notifications: Resend email — alerts creator when their content is flagged

---

## Full Installation & Running Guide

### Prerequisites (install once, system-wide)

```bash
# 1. Node.js v18+ (for frontend)
nvm install 18 && nvm use 18

# 2. Python 3.12+ (for backend and contracts)
# Download from https://python.org

# 3. AlgoKit CLI (for contracts)
pip install algokit

# 4. Poetry (for contracts dependency management)
pip install poetry
```

---

### Frontend — React + TailwindCSS

```bash
cd projects/frontend
npm install
npm run dev       # http://localhost:5173
npm run build     # production build → dist/
```

**Required env file** (`projects/frontend/.env`):
```
VITE_BACKEND_URL=http://localhost:8000
```

---

### Backend — FastAPI + pHash + Algorand

```bash
cd projects/backend
python -m venv venv
source venv/bin/activate          # Linux/Mac
venv\Scripts\activate             # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Swagger UI: http://localhost:8000/docs
```

**Required env file** (`projects/backend/.env`):
```
ALGORAND_ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGORAND_ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ALGORAND_APP_ID=755880383
DEPLOYER_MNEMONIC=<your 25-word mnemonic>
FRONTEND_URL=http://localhost:5173
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/genmark
JWT_SECRET_KEY=<random 32+ char string>
RESEND_API_KEY=<optional — Resend API key for misuse email alerts>
```

---

### Smart Contracts — Algorand Python (Puya)

```bash
cd projects/contracts
poetry install
poetry run python -m smart_contracts build
algokit project deploy testnet
poetry run pytest tests/
```

**Required env file** (`projects/contracts/.env.testnet`):
```
ALGOD_SERVER=https://testnet-api.algonode.cloud
DEPLOYER_MNEMONIC=<your 25-word mnemonic>
DISPENSER_MNEMONIC=<your 25-word mnemonic>
```

---

### Full Start Sequence

```bash
# Terminal 1 — Backend
cd projects/backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# create .env with DEPLOYER_MNEMONIC, ALGORAND_APP_ID, MONGODB_URI, JWT_SECRET_KEY
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
    creator_name:    arc4.String   # Original content creator, propagated through chain
    creator_address: arc4.Address  # 32-byte on-chain address
    platform:        arc4.String   # Platform/tool name
    timestamp:       arc4.UInt64   # Unix seconds
    asa_id:          arc4.UInt64   # Soulbound certificate ASA
    flag_count:      arc4.UInt64   # Misuse report count
    original_phash:  arc4.String   # Parent pHash; empty string if this is original content
    morphed_by:      arc4.String   # Name of who morphed this; empty string if original

class GenMark(ARC4Contract):
    total_registrations: UInt64
    # BoxMap: pHash → ContentRecord (namespace "reg_")
    # Flag boxes: "flg_" + phash.bytes + itob(flag_index) via op.Box.put()
```

**ABI Methods:**
- `register_content(phash, creator_name, platform, original_phash, morphed_by, pay) → uint64`
- `verify_content(phash) → (bool, ContentRecord)` — read-only
- `flag_misuse(phash, description, pay) → uint64`
- `get_flag(phash, flag_index) → string` — read-only

**CONTENT_RECORD_TYPE (for algosdk):**
```python
"(string,address,string,uint64,uint64,uint64,string,string)"
# indices: 0=creator_name, 1=creator_address, 2=platform, 3=timestamp,
#          4=asa_id, 5=flag_count, 6=original_phash, 7=morphed_by
```

### Backend (`projects/backend/`)
FastAPI service — the **ONLY** component that touches the blockchain.

| File | Purpose |
|------|---------|
| `main.py` | API endpoints: register, verify, flag, certificate, morph, auth |
| `algorand.py` | algosdk AtomicTransactionComposer ABI calls with retry logic |
| `hashing.py` | `imagehash.phash()` perceptual fingerprinting |
| `certificate.py` | ReportLab PDF forensic certificate generation |
| `auth.py` | MongoDB Atlas users + bcrypt + JWT |
| `notifications.py` | Resend API email alerts on misuse flagging |

**Provenance chain walking** (`main.py`):
```python
def build_provenance_chain_from_blockchain(phash: str) -> list:
    """Walks original_phash links on-chain, returns oldest-first list."""
    # Each step: {phash, creator_name, morphed_by, timestamp, is_original}
    # chain.reverse() at the end → original creator first
```

**Retry logic** (`algorand.py`):
- `register_content_on_chain`: 3 attempts, 4-second wait between retries on timeout
- `verify_content_on_chain`: 2 attempts, 2-second wait on timeout

### Frontend (`projects/frontend/src/`)
React + TailwindCSS. **Zero blockchain code** — all Algorand calls go through the backend.

| File | Purpose |
|------|---------|
| `App.tsx` | React Router v7 — 4 routes + ProtectedRoute |
| `pages/Login.tsx` | Signup / Login with JWT |
| `pages/Generate.tsx` | AI image generation (Pollinations) + silent registration |
| `pages/Morph.tsx` | Upload → transform → register derivative with provenance |
| `pages/Verify.tsx` | Public verification portal with ProvenanceTimeline |
| `components/ResultCard.tsx` | Verified/Not Found card + misuse modal |
| `components/StampBadge.tsx` | "Content Certified ✓" overlay badge |
| `components/DropZone.tsx` | Drag-and-drop image upload |

### Image Generation
Uses **Pollinations AI** — completely free, no API key:
```
https://image.pollinations.ai/prompt/{encoded}?width=512&height=512&nologo=true&seed=42
```
Fixed seed=42 ensures same prompt → same image → same pHash (deterministic).
Falls back to LoremFlickr if Pollinations fails.

### Morph Pipeline (`/api/morph`)
1. Upload image → compute original pHash
2. Query blockchain for origin record + walk full provenance chain
3. Apply Pillow transform (brightness/contrast/saturation/blur/rotate/crop)
4. Compute morphed pHash → compute Hamming distance
5. Return: original_phash, morphed_phash, hamming_distance, original_registered,
   original_creator, original_morphed_by, provenance_chain, morphed_image_b64

**pHash collision detection:**
- If `hamming_distance === 0`: morph was too subtle — same fingerprint as original
- Frontend blocks registration with warning: "Pick Rotate or Blur for a stronger transform"
- Backend sets `phash_collision_with_original: true` in already_registered response

---

## Puya Compiler Rules (CRITICAL)

1. **No `_` variable name** — use real names
2. **No tuple unpacking for ARC-4 mutable refs** — `BoxMap.maybe()` returns a ref; cannot unpack
3. **Use `key in boxmap`** — for existence checks
4. **Use `boxmap[key]` directly** — to read fields
5. **Use `boxmap[key].field = value`** — for in-place field updates
6. **Always `.copy()`** — when returning ARC-4 values: `self.registry[phash].copy()`
7. **`op.Box.put()` not `op.box_put()`**
8. **`op.Box.get()` not `op.box_get()`** — returns `tuple[Bytes, bool]`

---

## ABI Method Signatures (for algosdk)

```python
REGISTER_METHOD = abi.Method.from_signature(
    "register_content(string,string,string,string,string,pay)uint64"
)
VERIFY_METHOD = abi.Method.from_signature(
    "verify_content(string)(bool,(string,address,string,uint64,uint64,uint64,string,string))"
)
FLAG_METHOD = abi.Method.from_signature(
    "flag_misuse(string,string,pay)uint64"
)
GET_FLAG_METHOD = abi.Method.from_signature(
    "get_flag(string,uint64)string"
)
```

---

## Deployer Account

- **Address:** K3SFBBGKSEWGDW3Q4KAPKTI33ING3HLND5YSJVJH467MHA5K72FKCTXRDQ
- **Network:** Algorand TestNet via AlgoNode
- **Faucet:** https://bank.testnet.algorand.network/ (paste address, click dispense)
- **Note:** Each registration costs 300,000 μALGO. Refill when balance drops below 1 ALGO.

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
- `/morph`, `/verify` — public, no auth required

---

## Email Notification (`projects/backend/notifications.py`)

When misuse is flagged:
1. Backend looks up `creator_email` from MongoDB `registrations` collection
2. Sends email via Resend API (if `RESEND_API_KEY` is set)
3. Email contains: phash, misuse description, blockchain tx_id

MongoDB stores only `{phash, creator_name, creator_email}` — provenance data lives on-chain only.

---

## Deployment

### Railway (Backend)
1. New Project → GitHub repo → Root Directory: `projects/backend`
2. Variables:
   - `ALGORAND_APP_ID=755880383`
   - `DEPLOYER_MNEMONIC=<25 words on one line>`
   - `ALGORAND_ALGOD_SERVER=https://testnet-api.algonode.cloud`
   - `ALGORAND_ALGOD_TOKEN=aaaa...aaaa`
   - `MONGODB_URI=<MongoDB Atlas connection string>`
   - `JWT_SECRET_KEY=<32+ char secret>`
   - `FRONTEND_URL=<Vercel URL>`
   - `RESEND_API_KEY=<optional>`
3. Health check: `https://<railway-url>/health`

### Vercel (Frontend)
1. Import repo → Root Directory: `projects/frontend`
2. Variables: `VITE_BACKEND_URL=<Railway backend URL>`
3. Deploy → get live URL → update `FRONTEND_URL` in Railway

---

## File Locations Quick Reference

| What | Where |
|------|-------|
| GenMark contract | `projects/contracts/smart_contracts/genmark/contract.py` |
| Backend main | `projects/backend/main.py` |
| Auth helpers | `projects/backend/auth.py` |
| pHash logic | `projects/backend/hashing.py` |
| Algorand calls (with retry) | `projects/backend/algorand.py` |
| PDF certificates | `projects/backend/certificate.py` |
| Email notifications | `projects/backend/notifications.py` |
| Login page | `projects/frontend/src/pages/Login.tsx` |
| Generate page | `projects/frontend/src/pages/Generate.tsx` |
| Morph page | `projects/frontend/src/pages/Morph.tsx` |
| Verify page | `projects/frontend/src/pages/Verify.tsx` |
| Result display | `projects/frontend/src/components/ResultCard.tsx` |
| Auth hook | `projects/frontend/src/hooks/useAuth.ts` |
| Frontend routing | `projects/frontend/src/App.tsx` |

---

## Documentation Resources

| Resource | URL |
|----------|-----|
| Algorand Python (Puya) | https://algorandfoundation.github.io/puya/ |
| algopy API reference | https://algorandfoundation.github.io/puya/api.html |
| AlgoKit CLI | https://github.com/algorandfoundation/algokit-cli |
| algosdk Python SDK | https://py-algorand-sdk.readthedocs.io/ |
| ARC-4 spec | https://arc.algorand.foundation/ARCs/arc-0004 |

---

## Image Fingerprinting — How pHash Works

**Library:** `ImageHash 4.3.1` + `Pillow 11.1.0` — `projects/backend/hashing.py`

1. Raw bytes → `PIL.Image.open()` (any format: JPEG, PNG, WebP, GIF…)
2. Convert to RGB
3. `imagehash.phash(img, hash_size=8)`:
   - Resize to 32×32
   - DCT (Discrete Cosine Transform)
   - Top-left 8×8 block → compare each of 64 values to median
   - Pack 64 bits → **16-char lowercase hex** e.g. `cdcd3a32664c4d1b`

**Hamming distance threshold: 4 bits**
- 0 = exact match / pHash collision (morph too subtle — block registration)
- 1–4 = same image with minor edit (verify as same content)
- >15 = different image

## Current Date
Today: 2026-02-21
