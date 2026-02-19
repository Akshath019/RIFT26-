# GenMark — Implementation Plan

## Project Goal
Build a deployable AI Content Origin & Misuse Detection platform using Algorand as the immutable evidence layer.

---

## Architecture Overview

```
User Browser (Vercel)
        ↓  HTTP (fetch)
FastAPI Backend (Render)
        ↓  algosdk AtomicTransactionComposer
Algorand TestNet Smart Contract
        ↓  Box storage + ASA minting
Permanent on-chain record
```

---

## Phase 1: Smart Contract ✅

**File:** `projects/contracts/smart_contracts/genmark/contract.py`

### Data Model
```python
class ContentRecord(arc4.Struct):
    creator_name:    arc4.String   # Display name
    creator_address: arc4.Address  # 32-byte Algorand address
    platform:        arc4.String   # Platform name
    timestamp:       arc4.UInt64   # Unix timestamp
    asa_id:          arc4.UInt64   # Soulbound ASA ID
    flag_count:      arc4.UInt64   # Misuse report count
```

### Storage
- Registry: `BoxMap(arc4.String, ContentRecord, key_prefix=b"reg_")`
- Flags: Raw boxes via `op.box_put` with composite keys `b"flg_" + phash.bytes + itob(flag_index)`

### ABI Methods
| Method | Args | Returns | Notes |
|--------|------|---------|-------|
| `register_content` | phash, creator_name, platform, pay | uint64 (asa_id) | Creates box + mints ASA |
| `verify_content` | phash | (bool, ContentRecord) | readonly=True |
| `flag_misuse` | phash, description, pay | uint64 (flag_index) | Immutable flag |
| `get_flag` | phash, flag_index | string | readonly=True |

### Soulbound ASA Properties
- `total = 1` — non-fungible
- `decimals = 0` — indivisible
- `default_frozen = True` — accounts frozen by default
- All management roles set to contract address

---

## Phase 2: Backend (FastAPI) ✅

**Directory:** `projects/backend/`

### Files
- `main.py` — FastAPI app with CORS, 4 endpoints
- `hashing.py` — Perceptual hash computation (imagehash pHash)
- `algorand.py` — AtomicTransactionComposer calls to contract
- `certificate.py` — ReportLab PDF generation
- `requirements.txt` — Python dependencies
- `.env.example` — Environment variable template
- `render.yaml` — Render deployment config

### Endpoints
| Method | Path | Function |
|--------|------|----------|
| `POST` | `/api/register` | Image → pHash → on-chain registration |
| `POST` | `/api/verify` | Image → pHash → contract lookup |
| `POST` | `/api/flag` | JSON → on-chain misuse report |
| `POST` | `/api/certificate` | JSON → PDF download |

### Key Design Decisions
- `algosdk` AtomicTransactionComposer (no ARC-56 JSON file dependency)
- ABI method signatures hardcoded as strings (derived from contract definition)
- `atc.simulate()` for read-only `verify_content` calls (no fees)
- `atc.execute()` with `fee = 2 * min_fee` for write operations (covers inner txns)

---

## Phase 3: Frontend (React + TailwindCSS) ✅

**Directory:** `projects/frontend/src/`

### Pages
- `pages/Generate.tsx` — Mock AI generation + silent registration
- `pages/Verify.tsx` — Public verification portal

### Components
- `components/DropZone.tsx` — Drag-and-drop image upload
- `components/ResultCard.tsx` — Verified/Not Found result display + flag modal
- `components/StampBadge.tsx` — "Certified ✓" overlay badge

### Routing
- React Router v7 via `BrowserRouter` + `Routes`
- `App.tsx` rewritten to use router (no wallet provider)
- `vercel.json` rewrites all routes to `index.html`

### Image Generation
- Pollinations AI: `https://image.pollinations.ai/prompt/{encoded}?width=512&height=512&nologo=true&seed=42`
- Free, no API key, returns real AI images
- Fixed seed ensures same prompt → same image → same pHash

### API Calls
- All calls to `VITE_BACKEND_URL` (Render)
- No Algorand SDK in frontend
- Graceful demo mode when backend is unavailable

---

## Phase 4: Deployment ✅

### Smart Contract
```bash
# In projects/contracts/
algokit project run build        # Compile to TEAL + generate clients
algokit project deploy testnet   # Deploy to TestNet → prints App ID
```

### Backend (Render)
1. Create new Web Service on render.com
2. Connect GitHub repo, set root to `projects/backend/`
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Set env vars: `ALGORAND_APP_ID`, `DEPLOYER_MNEMONIC`, `FRONTEND_URL`

### Frontend (Vercel)
1. Import GitHub repo to vercel.com
2. Set root to `projects/frontend/`
3. Set env var: `VITE_BACKEND_URL` = Render service URL
4. Deploy → get live URL

---

## Phase 5: Testing ✅

### Unit Tests (no node required)
```bash
cd projects/contracts/
pytest tests/genmark_test.py -v
```

### Integration Tests (LocalNet required)
```bash
algokit localnet start
pytest tests/genmark_test.py -v -k "integration"
```

### Backend Tests
```bash
cd projects/backend/
uvicorn main:app --reload
# Test with: curl -X GET http://localhost:8000/health
```

---

## Critical Technical Details

### Box MBR Calculation
```
MBR per box = 2500 + 400 × (key_size + value_size) microAlgos
```
- Registry box key: ~22 bytes (`b"reg_"` + arc4-encoded phash)
- ContentRecord value: ~164 bytes (3 strings + 3 uint64s)
- Estimated MBR: ~76,900 microAlgos per registration
- Registration payment: 100,000 microAlgos (0.1 ALGO) — safe margin

### pHash Algorithm
- Library: `imagehash.phash(img, hash_size=8)` → 64-bit hash
- Output: 16-char lowercase hex string
- Distance threshold: Hamming ≤ 4 for same-image matches
- Stability: Works across JPEG compression, minor resize, format conversion

### ABI Method Signatures (for algosdk AtomicTransactionComposer)
```
register_content(string,string,string,pay)uint64
verify_content(string)(bool,(string,address,string,uint64,uint64,uint64))
flag_misuse(string,string,pay)uint64
get_flag(string,uint64)string
```
