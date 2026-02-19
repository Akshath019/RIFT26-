# GenMark — AI Content Origin & Misuse Detection

> **Live App**: [https://genmark.vercel.app](https://genmark.vercel.app) _(update after deployment)_
> **Smart Contract App ID**: `TBD — deploy to TestNet and fill in`
> **Network**: Algorand TestNet

---

## What Is GenMark?

GenMark is an AI content provenance platform. Every AI-generated image receives a silent, permanent origin record on the Algorand blockchain at the moment of creation. When the image is later found being misused as a deepfake, anyone can verify who created it and when — even if it was resized, compressed, or re-saved.

**The key insight**: A bad actor will never voluntarily verify their own deepfake. So verification cannot be reactive. Every image gets registered *before* any misuse can happen. The evidence already exists on-chain when it's needed.

---

## Problem & Solution

| Problem | Solution |
|---------|----------|
| Deepfakes spread with zero accountability | Every image registered at creation with permanent on-chain record |
| SHA-256 changes on any pixel modification | Perceptual hashing (pHash) stable across minor image edits |
| No chain of evidence for police/courts | Immutable blockchain records + downloadable forensic PDF |
| Victims can't prove original authorship | Soulbound ASA minted as cryptographic ownership credential |

---

## Demo Flow

### Create & Certify
1. Go to `/generate`
2. Type a creative prompt → click "Create Image"
3. Image appears with a small green **"Certified ✓"** badge
4. Your image's fingerprint is permanently on Algorand — silently, invisibly

### Verify Origin
1. Go to `/verify`
2. Upload any image (drag & drop)
3. See either:
   - **Green card**: "Verified Original" — creator name, platform, exact timestamp
   - **Yellow card**: "No Origin Record Found" — suspicious content warning

### Report Misuse
1. On a verified result, click **"Report Misuse"**
2. Describe the misuse
3. Click **"Submit Report"** — permanently recorded on-chain
4. Download a **forensic PDF certificate** for law enforcement

---

## Architecture

```
Vercel (Frontend)     →     Render (Backend)     →     Algorand TestNet
React + TailwindCSS         FastAPI + Python            GenMark Smart Contract
react-router-dom v7         imagehash pHash             Box storage + ASA minting
fetch() to backend          algosdk ABI calls           Immutable evidence records
```

No crypto wallet required for end users — all blockchain interactions happen through the backend.

---

## Project Structure

```
projects/
├── contracts/
│   └── smart_contracts/
│       └── genmark/
│           ├── contract.py      # Algorand Python (Puya) smart contract
│           └── deploy_config.py # AlgoKit deployment script
├── backend/
│   ├── main.py                  # FastAPI endpoints
│   ├── hashing.py               # Perceptual hash computation
│   ├── algorand.py              # Algorand blockchain calls
│   ├── certificate.py           # PDF forensic certificate generation
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/
        │   ├── Generate.tsx     # AI generation + silent registration
        │   └── Verify.tsx       # Public verification portal
        └── components/
            ├── DropZone.tsx     # Drag-and-drop image upload
            ├── ResultCard.tsx   # Verified/Not Found card + misuse modal
            └── StampBadge.tsx   # "Content Certified" badge overlay
```

---

## Setup & Deployment

### Prerequisites
- Python 3.12+, Poetry
- Node.js 20+, npm 9+
- AlgoKit CLI 2.0+ (`pip install algokit`)
- Docker (for LocalNet testing only)

### Step 1: Install Dependencies

```bash
# Install all Python + Node dependencies
algokit project bootstrap all
```

### Step 2: Build & Deploy Smart Contract

```bash
cd projects/contracts

# Compile contract
algokit project run build

# Create deployer account (save the mnemonic!)
algokit generate account

# Fund the account on TestNet:
# https://bank.testnet.algorand.network/ (paste address, get 10 ALGO)

# Deploy to TestNet (prints App ID)
algokit project deploy testnet
```

Copy the printed `ALGORAND_APP_ID` value.

### Step 3: Configure Backend

```bash
cd projects/backend
cp .env.example .env
```

Edit `.env`:
```
ALGORAND_APP_ID=<paste App ID from deploy>
DEPLOYER_MNEMONIC=<paste your 25-word mnemonic>
FRONTEND_URL=https://your-app.vercel.app
```

### Step 4: Run Backend Locally

```bash
cd projects/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Visit http://localhost:8000/docs for API explorer
```

### Step 5: Configure Frontend

```bash
cd projects/frontend
cp .env.template .env
```

Edit `.env`:
```
VITE_BACKEND_URL=http://localhost:8000
```

### Step 6: Run Frontend Locally

```bash
cd projects/frontend
npm install
npm run dev
# Visit http://localhost:5173
```

---

## Deploy to Production

### Backend → Render

1. Create a new **Web Service** on [render.com](https://render.com)
2. Connect your GitHub repository
3. Set **Root Directory**: `projects/backend`
4. **Build Command**: `pip install -r requirements.txt`
5. **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Add environment variables in Render dashboard:
   - `ALGORAND_APP_ID`
   - `DEPLOYER_MNEMONIC`
   - `FRONTEND_URL`

### Frontend → Vercel

1. Import repository on [vercel.com](https://vercel.com)
2. Set **Root Directory**: `projects/frontend`
3. Add environment variable: `VITE_BACKEND_URL` = your Render URL
4. Deploy → get live URL

---

## Smart Contract

The GenMark contract is written in **Algorand Python (Puya)** and compiled with **AlgoKit**.

### Key Features
- **Box storage** for O(1) pHash lookup (no indexer dependency)
- **Soulbound ASA** minted per registration (total=1, decimals=0, default_frozen=True)
- **Immutable misuse flags** stored as individual boxes (cannot be deleted)
- **ARC-4 ABI** methods with typed structs

### Methods
| Method | Description |
|--------|-------------|
| `register_content(phash, creator_name, platform, pay)` | Register image + mint ownership ASA |
| `verify_content(phash)` | Look up origin record (read-only, free) |
| `flag_misuse(phash, description, pay)` | File permanent misuse report |
| `get_flag(phash, flag_index)` | Retrieve flag description (read-only) |

### Run Tests

```bash
cd projects/contracts
pytest tests/genmark_test.py -v
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contract | Algorand Python (Puya), AlgoKit 2.0, ARC-4 |
| Image Fingerprinting | imagehash pHash (64-bit perceptual hash) |
| Backend | FastAPI, algosdk, ReportLab, Pillow |
| Frontend | React 18, TypeScript, TailwindCSS, React Router v7 |
| Image Generation | Pollinations AI (free, no API key) |
| Backend Hosting | Render (free tier) |
| Frontend Hosting | Vercel (free tier) |
| Blockchain | Algorand TestNet via AlgoNode |

---

## Why Algorand?

- **4-second finality** — users don't wait for confirmations
- **0.001 ALGO transactions** — negligible cost per registration
- **Box storage** — native per-key storage without external database
- **Puya Python** — readable, auditable smart contracts
- **ASA standard** — native non-fungible soulbound tokens
- **AlgoKit** — rapid development + one-command deployment

---

## License

MIT
