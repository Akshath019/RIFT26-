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

## Current State (2026-02-19)

- Frontend: RUNNING at localhost:5173
- Backend: RUNNING at localhost:8000
- Contract: COMPILED (GenMark.arc56.json generated)
- Contract: NOT YET DEPLOYED (one Puya error left in flag_misuse, then deploy)
- Deployer account: FUNDED with 10 TestNet ALGO
- Image generation: WORKING (Pollinations AI, free, no API key)
- App ID: NOT YET SET (backend .env has ALGORAND_APP_ID=0)

---

## Key Commands

### Frontend (run from `projects/frontend/`)
```bash
npm install                    # Install dependencies (first time)
npm run dev                    # Start dev server at http://localhost:5173
npm run build                  # Production build
```

### Backend (run from `projects/backend/`)
```bash
pip install -r requirements.txt       # Install Python dependencies
uvicorn main:app --reload --port 8000 # Dev server at http://localhost:8000
# API docs: http://localhost:8000/docs
```

### Smart Contracts (run from `projects/contracts/`)
```bash
poetry run python -m smart_contracts build    # Compile (also: algokit project run build)
algokit project deploy testnet                # Deploy to TestNet (prints App ID)
```

### Algorand Account Management
```bash
algokit dispenser login                        # Auth (opens browser, sign in with GitHub)
algokit dispenser fund --receiver <ADDRESS> --amount 10000000  # Send 10 ALGO
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

### Backend (`projects/backend/.env`) — CREATED, needs App ID update:
```
ALGORAND_ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGORAND_ALGOD_TOKEN=aaaa...aaaa (64 a's — AlgoNode accepts any token)
ALGORAND_APP_ID=0                 ← UPDATE after deploy
DEPLOYER_MNEMONIC=birth heart ... medal (25 words)
FRONTEND_URL=http://localhost:5173
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

## Remaining TODO

1. Fix `flag_misuse` method in contract.py (replace `.maybe()` with `in` + direct access)
2. Add `DISPENSER_MNEMONIC` to `projects/contracts/.env.testnet`
3. Run `algokit project deploy testnet` → get App ID
4. Set `ALGORAND_APP_ID=<number>` in `projects/backend/.env`
5. Restart backend → test full flow

---

## File Locations Quick Reference

| What | Where |
|------|-------|
| GenMark contract | `projects/contracts/smart_contracts/genmark/contract.py` |
| Deploy config | `projects/contracts/smart_contracts/genmark/deploy_config.py` |
| Contract tests | `projects/contracts/tests/genmark_test.py` |
| Backend main | `projects/backend/main.py` |
| pHash logic | `projects/backend/hashing.py` |
| Algorand calls | `projects/backend/algorand.py` |
| PDF certificates | `projects/backend/certificate.py` |
| Backend env | `projects/backend/.env` |
| Backend env template | `projects/backend/.env.example` |
| Contracts env | `projects/contracts/.env.testnet` |
| Generate page | `projects/frontend/src/pages/Generate.tsx` |
| Verify page | `projects/frontend/src/pages/Verify.tsx` |
| DropZone component | `projects/frontend/src/components/DropZone.tsx` |
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

## Current Date
Today: 2026-02-19
