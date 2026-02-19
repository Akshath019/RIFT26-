# SYSTEM.md — GenMark System Architecture

## Project: GenMark — AI Content Origin & Misuse Detection Platform

Built on Algorand TestNet. Every AI-generated image receives an unforgeable birth certificate at the moment of creation using perceptual hashing. Anyone can verify who created any image and when — even if the image was cropped, compressed, or resized.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1: Frontend (Vercel)                                      │
│  React 18 + TailwindCSS + React Router v7                       │
│  /generate — Mock AI platform with silent origin registration   │
│  /verify   — Public verification portal (no account required)   │
│  Zero blockchain code — all calls go to Backend via fetch()     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/REST
┌──────────────────────────▼──────────────────────────────────────┐
│  TIER 2: Backend (Render Free Tier)                             │
│  FastAPI + Python 3.12                                          │
│  imagehash pHash computation (stable across minor edits)        │
│  algosdk AtomicTransactionComposer → Algorand TestNet           │
│  ReportLab PDF forensic certificate generation                  │
│  Endpoints: /api/register /api/verify /api/flag /api/certificate│
└──────────────────────────┬──────────────────────────────────────┘
                           │ algosdk + ABI method calls
┌──────────────────────────▼──────────────────────────────────────┐
│  TIER 3: Algorand TestNet                                       │
│  GenMark Smart Contract (Puya Python, AlgoKit)                  │
│  Box storage: pHash → ContentRecord (registry namespace "reg_") │
│  Flag boxes: individual reports (namespace "flg_")              │
│  Soulbound ASA minting per registration (ARC-4 inner txns)      │
│  Global state: total_registrations counter                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
Hackathon-QuickStart-template/
├── CLAUDE.md                   # Claude Code assistant context
├── SYSTEM.md                   # This file — system documentation
├── plan.md                     # Implementation plan
├── README.md                   # Setup + deployment guide
│
├── projects/
│   ├── contracts/              # Smart contract project (AlgoKit)
│   │   ├── smart_contracts/
│   │   │   ├── genmark/
│   │   │   │   ├── contract.py      # GenMark ARC-4 contract (MAIN)
│   │   │   │   └── deploy_config.py # Deployment script
│   │   │   ├── counter/             # Original template (kept for reference)
│   │   │   ├── bank/                # Original template (kept for reference)
│   │   │   └── artifacts/           # Compiled TEAL + ARC-56 + clients
│   │   ├── tests/
│   │   │   └── genmark_test.py      # GenMark test suite
│   │   ├── pyproject.toml
│   │   └── poetry.toml
│   │
│   ├── backend/                # FastAPI backend (NEW for GenMark)
│   │   ├── main.py             # FastAPI app + endpoints
│   │   ├── hashing.py          # Perceptual hash computation
│   │   ├── algorand.py         # Algorand ABI calls via algosdk
│   │   ├── certificate.py      # PDF forensic certificate (ReportLab)
│   │   ├── requirements.txt    # Python dependencies
│   │   ├── .env.example        # Environment variable template
│   │   └── render.yaml         # Render.com deployment config
│   │
│   └── frontend/               # React frontend project
│       ├── src/
│       │   ├── App.tsx          # React Router v7 routing (no wallet)
│       │   ├── pages/
│       │   │   ├── Generate.tsx # AI generation + silent registration
│       │   │   └── Verify.tsx   # Public verification portal
│       │   └── components/
│       │       ├── DropZone.tsx     # Drag-and-drop image upload
│       │       ├── ResultCard.tsx   # Verified/Not Found result card
│       │       └── StampBadge.tsx   # "Content Certified" overlay badge
│       ├── vercel.json          # SPA routing rewrite rules
│       └── .env.template        # Frontend environment variables
```

---

## Technology Stack

### Smart Contract Layer
| Component | Technology | Version |
|-----------|------------|---------|
| Language | Algorand Python (Puya) | 2.0+ |
| Compiler | AlgoKit CLI | 2.0+ |
| ABI Standard | ARC-4 / ARC-56 | — |
| Storage | BoxMap + raw box_put/box_get | — |
| Testing | algorand-python-testing | 0.4+ |
| Dependency Mgmt | Poetry | — |

### Backend Layer
| Component | Technology | Version |
|-----------|------------|---------|
| Framework | FastAPI | 0.115+ |
| ASGI Server | Uvicorn | 0.34+ |
| Hashing | imagehash (pHash) + Pillow | 4.3+ / 11+ |
| Blockchain SDK | algosdk | 2.7+ |
| PDF Generation | ReportLab | 4.2+ |
| HTTP Client | httpx | 0.28+ |
| Deployment | Render (free tier) | — |

### Frontend Layer
| Component | Technology | Version |
|-----------|------------|---------|
| Framework | React | 18.2+ |
| Language | TypeScript | 5.0+ |
| Build Tool | Vite | 5.0+ |
| Styling | TailwindCSS + DaisyUI | 3.3.2 / 4.0 |
| Routing | React Router | 7.0+ |
| Deployment | Vercel (free tier) | — |

---

## Smart Contract: GenMark

**File**: `projects/contracts/smart_contracts/genmark/contract.py`
**Standard**: ARC-4, Box Storage
**Network**: Algorand TestNet

### ARC-4 Data Type
```python
class ContentRecord(arc4.Struct):
    creator_name:    arc4.String   # Display name
    creator_address: arc4.Address  # 32-byte Algorand address
    platform:        arc4.String   # Platform name
    timestamp:       arc4.UInt64   # Unix timestamp (seconds)
    asa_id:          arc4.UInt64   # Soulbound ASA ID
    flag_count:      arc4.UInt64   # Misuse report count
```

### Storage Layout
| Box Key | Value | Namespace |
|---------|-------|-----------|
| `b"reg_" + arc4_encode(phash)` | `ContentRecord` | Registry |
| `b"flg_" + arc4_encode(phash) + itob(flag_idx)` | `arc4.String` | Flags |

### ABI Methods
| Method | Args | Returns | Access |
|--------|------|---------|--------|
| `register_content` | phash, creator_name, platform, pay | uint64 (asa_id) | Write |
| `verify_content` | phash | (bool, ContentRecord) | ReadOnly |
| `flag_misuse` | phash, description, pay | uint64 (flag_index) | Write |
| `get_flag` | phash, flag_index | string | ReadOnly |

### Global State
| Key | Type | Description |
|-----|------|-------------|
| `total_registrations` | UInt64 | Counter of all registered items |

### Soulbound ASA Properties
- `total = 1` — non-fungible
- `decimals = 0` — indivisible
- `default_frozen = True` — recipients frozen
- `manager = freeze = clawback = contract_address` — contract-only management

---

## Backend API Reference

**Base URL**: `https://genmark-backend.onrender.com` (or `http://localhost:8000` dev)

| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| GET | `/health` | — | status JSON |
| POST | `/api/register` | multipart: image/image_url + creator_name + platform | {tx_id, asa_id, phash, app_id} |
| POST | `/api/verify` | multipart: image/image_url | {found, creator_name, platform, timestamp, ...} |
| POST | `/api/flag` | JSON: {phash, description} | {tx_id, flag_index, phash} |
| POST | `/api/certificate` | JSON: {tx_id, creator_name, ...} | PDF bytes |

---

## Frontend Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | → redirect | Redirects to /generate |
| `/generate` | `Generate.tsx` | Mock AI image creation platform |
| `/verify` | `Verify.tsx` | Public image origin verification |
| `/*` | → redirect | Catch-all → /generate |

---

## Environment Variables

### Backend (Render)
| Variable | Required | Description |
|----------|----------|-------------|
| `ALGORAND_ALGOD_SERVER` | Yes | AlgoNode TestNet URL |
| `ALGORAND_ALGOD_TOKEN` | No | 64-char token (any value for AlgoNode) |
| `ALGORAND_APP_ID` | Yes | Deployed GenMark contract App ID |
| `DEPLOYER_MNEMONIC` | Yes | 25-word account mnemonic |
| `FRONTEND_URL` | No | Vercel frontend URL for CORS |

### Frontend (Vercel)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_BACKEND_URL` | Yes | Render backend URL |

---

## Deployment Order

```
1. algokit project run build         # Compile contract
2. algokit project deploy testnet    # Deploy → prints App ID
3. Set ALGORAND_APP_ID in Render env vars
4. Deploy backend on Render          # Get Render URL
5. Set VITE_BACKEND_URL in Vercel env vars
6. Deploy frontend on Vercel         # Get Vercel URL
7. Set FRONTEND_URL in Render env vars
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
