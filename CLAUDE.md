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

## Key Commands

### Frontend (run from `projects/frontend/`)
```bash
npm install                    # Install dependencies (first time)
npm run dev                    # Start dev server at http://localhost:5173
npm run build                  # Production build
npm run lint                   # Lint check
npm run lint:fix               # Auto-fix lint issues
```

### Backend (run from `projects/backend/`)
```bash
pip install -r requirements.txt       # Install Python dependencies
uvicorn main:app --reload --port 8000 # Dev server at http://localhost:8000
# API docs: http://localhost:8000/docs
```

### Smart Contracts (run from `projects/contracts/`)
```bash
algokit project run build      # Compile GenMark contract with Puya
algokit project deploy testnet # Deploy to TestNet (prints App ID)
algokit localnet start         # Start local Algorand node (Docker required)
algokit localnet stop          # Stop local node
pytest tests/genmark_test.py -v # Run contract tests
```

### Workspace-level (run from root)
```bash
algokit project bootstrap all  # Install all dependencies (Python + Node)
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
    # Flag boxes: "flg_" + phash.bytes + itob(flag_index)
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

**ABI method signatures (used in algorand.py):**
```
register_content(string,string,string,pay)uint64
verify_content(string)(bool,(string,address,string,uint64,uint64,uint64))
flag_misuse(string,string,pay)uint64
get_flag(string,uint64)string
```

### Frontend (`projects/frontend/src/`)
React + TailwindCSS. **Zero blockchain code** — all Algorand calls go through the backend.

- `App.tsx` — React Router v7 with two routes
- `pages/Generate.tsx` — mock AI generation + silent registration
- `pages/Verify.tsx` — public verification portal
- `components/DropZone.tsx` — drag-and-drop image upload
- `components/ResultCard.tsx` — Verified/Not Found card + misuse modal
- `components/StampBadge.tsx` — "Content Certified ✓" overlay badge

---

## Environment Setup

### Backend (`projects/backend/.env`):
```
ALGORAND_ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGORAND_ALGOD_TOKEN=aaaa...aaaa
ALGORAND_APP_ID=<from deploy>
DEPLOYER_MNEMONIC=<25 words>
FRONTEND_URL=https://your-app.vercel.app
```

### Frontend (`projects/frontend/.env`):
```
VITE_BACKEND_URL=http://localhost:8000
```

---

## Important Patterns

### Contract Deployment Flow
1. `algokit project run build` — compiles to TEAL + generates Python client
2. `algokit generate account` — creates deployer account
3. Fund on TestNet faucet: https://bank.testnet.algorand.network/
4. `algokit project deploy testnet` — deploys + funds app with 10 ALGO
5. Copy printed App ID to `backend/.env`

### Backend Blockchain Call Pattern
```python
# Read-only (free, no state change):
simulate_result = atc.simulate(algod_client)

# Write (requires fees + payment):
sp.flat_fee = True
sp.fee = 2 * 1000  # 2x for outer + inner transaction
result = atc.execute(algod_client, wait_rounds=4)
```

### Frontend API Call Pattern
```typescript
const response = await fetch(`${VITE_BACKEND_URL}/api/register`, {
  method: 'POST',
  body: formData,  // multipart with image + creator_name + platform
})
```

### Image Generation (Pollinations AI)
```typescript
const url = `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=42`
// Fixed seed ensures same prompt → same image → same pHash
```

---

## Deployed Contract IDs (TestNet)
- **GenMark**: App ID `TBD — deploy and fill in`

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
| Backend env template | `projects/backend/.env.example` |
| Generate page | `projects/frontend/src/pages/Generate.tsx` |
| Verify page | `projects/frontend/src/pages/Verify.tsx` |
| DropZone component | `projects/frontend/src/components/DropZone.tsx` |
| ResultCard component | `projects/frontend/src/components/ResultCard.tsx` |
| StampBadge component | `projects/frontend/src/components/StampBadge.tsx` |
| Frontend routing | `projects/frontend/src/App.tsx` |
| Frontend env template | `projects/frontend/.env.template` |
| Vercel config | `projects/frontend/vercel.json` |

---

## Common Gotchas

- **pHash vs SHA-256**: Always use perceptual hash (imagehash) not SHA-256. Real images get re-saved.
- **Box MBR**: Registration requires 0.1 ALGO payment to cover box storage costs.
- **Inner transaction fee**: Outer `register_content` call needs `fee = 2 * min_fee` for ASA creation inner txn.
- **simulate() vs execute()**: Use `atc.simulate()` for read-only methods (free); `atc.execute()` for writes.
- **Box key namespacing**: Registry = `b"reg_"`, Flags = `b"flg_"` — keeps box keys distinct.
- **Soulbound ASA**: total=1, decimals=0, default_frozen=True, all roles=contract.
- **No blockchain in frontend**: Frontend NEVER calls Algorand directly — only via backend.
- **React Router rewrite**: `vercel.json` rewrites all routes to `index.html` for SPA routing.
- **Demo mode**: Frontend gracefully shows demo states when backend is unavailable (503 errors).
- **Fixed seed**: Pollinations AI uses `seed=42` for reproducible images (same prompt → same pHash).

---

## ARC Standards Used
- **ARC-4**: Smart contract ABI interface (methods, struct types, return values)
- **ARC-4 Box Storage**: Per-content key-value storage
- **ASA Soulbound**: total=1, decimals=0, default_frozen=True, contract-controlled

## Current Date
Today: 2026-02-19
