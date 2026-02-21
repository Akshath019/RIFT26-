# GenMark — AI Content Provenance on Algorand

> Every AI-generated image gets a silent, unforgeable birth certificate the moment it's created.

**Network:** Algorand TestNet · **App ID:** `755880383`

---

## The Problem

Deepfakes are accelerating. Anyone can generate a photorealistic image of a politician, celebrity, or private individual in seconds — for free. When that image spreads as misinformation, there is currently no way to answer the critical question:

**Who made this? When? On which platform?**

Existing approaches fail:
- **SHA-256 hashing** breaks on any pixel change — a single re-save renders it useless
- **Watermarks** are stripped by bad actors in seconds
- **Metadata** (EXIF) is trivially removed or forged
- **Reactive reporting** requires the creator to come forward voluntarily — which bad actors never do

---

## The Solution

GenMark registers every AI-generated image **at the moment of creation** — before any misuse can occur. The evidence already exists on the blockchain when investigators need it.

**Key insight:** A bad actor will never self-report. So verification cannot be reactive. Every image must be registered proactively, at birth, as an unforgeable on-chain record.

### How It Works

1. **At creation time** — The image is fingerprinted using a perceptual hash (pHash). The fingerprint is registered on the Algorand blockchain in a tamper-proof box. A soulbound ASA (non-transferable token) is minted as a cryptographic ownership credential. The user sees only a small "Certified ✓" badge.

2. **At verification time** — Anyone uploads a suspicious image to the verify portal. The backend computes its pHash and queries the blockchain. In seconds, the full origin record appears: creator name, platform, exact timestamp — even if the image was resized, compressed, or re-saved.

3. **At misuse time** — An investigator clicks "Report Misuse" and describes the violation. An immutable flag is stored on-chain with a blockchain transaction ID that serves as legally meaningful evidence. The original creator receives an email alert.

---

## Why Perceptual Hashing?

Unlike SHA-256, pHash (Perceptual Hash) produces the same fingerprint even after:
- JPEG re-compression
- Resize or downscale
- Format conversion (PNG → JPEG)
- Minor crop or brightness adjustment

Two images are considered the same if their Hamming distance is ≤ 4 bits out of 64.

```
Original image → pHash: cdcd3a32664c4d1b
Same image, re-saved → pHash: cdcd3a32664c4d1b  (identical)
Same image, resized → pHash: cdcd3a32664c4d19  (distance: 1 bit — still a match)
Different deepfake → pHash: a4f29d0011c38e2a  (distance: 42 bits — different image)
```

---

## Why Algorand?

- **4-second finality** — users don't wait for block confirmations
- **0.001 ALGO per transaction** — negligible cost per registration
- **Box storage** — native per-key on-chain storage, O(1) lookup without an indexer
- **Soulbound ASA** — non-transferable certificate built into the base protocol
- **Puya Python** — readable, auditable smart contracts in Python syntax
- **AlgoKit** — rapid development and one-command TestNet deployment

---

## Features

### 1. Generate & Certify
Create AI images with a text prompt. Every image is silently registered on Algorand the moment it's generated. Users see a "Content Certified ✓" badge — no blockchain knowledge required.

### 2. Morph & Track Derivatives
Upload any registered image and apply a visual transformation (Rotate, Blur, Brighten, etc.). The morphed image is registered on-chain with a full provenance link back to the original creator. When the same image is morphed again by another user, the chain extends:

```
Alice (original) → Bob (morphed) → Carol (morphed)
```

Every step is permanently recorded and publicly auditable.

### 3. Verify Any Image
Upload any image — no account required. The verify portal returns:
- **Verified Original** — creator name, wallet address, platform, exact timestamp, soulbound ASA ID
- **Derived Content** — who morphed it, when, plus the full ancestral chain back to the original
- **No Record Found** — not registered on GenMark (itself a suspicious signal)

### 4. Report & Certify Misuse
File an immutable misuse report against any registered content. The blockchain transaction ID is legal evidence — it proves a formal report was filed at a specific time with a specific description. Download a forensic PDF certificate for law enforcement.

---

## Real-World Impact

| Use Case | How GenMark Helps |
|----------|-------------------|
| Deepfake investigation | Journalist uploads suspicious image → instant origin record with creator details |
| Political disinformation | Researchers trace viral images back to their generation platform and timestamp |
| Copyright enforcement | Creators prove original authorship with on-chain timestamp and soulbound ASA |
| Platform accountability | AI platforms can prove which images originated on their platform |
| Legal evidence | Blockchain transaction IDs + PDF certificates admissible as timestamped evidence |
| Derivative attribution | Every morphed/edited version links back to the original creator automatically |

---

## Demo Flows

### Create a Certified Image
1. Go to `/login` → create an account
2. Go to `/generate` → type a prompt → click "Create Image"
3. Image appears with green "Certified ✓" badge
4. Content is permanently registered on Algorand TestNet

### Verify Any Image
1. Go to `/verify` (no login needed)
2. Upload or drag-and-drop any image
3. See origin record: creator, timestamp, platform, ASA ID
4. If the image has been morphed, see the full provenance chain

### Create a Derivative
1. Go to `/morph`
2. Upload a GenMark-certified image
3. Choose a transform: Rotate, Blur, Brighten, Contrast, Saturate, or Crop
4. See Hamming distance badge — Rotate/Blur give the most distinct fingerprint
5. Click "Register Morph on Algorand" (requires login)
6. Download the morphed image
7. Go to `/verify` → upload the morphed image → see "Derived Content" with full chain

### Report Misuse
1. On any verified image result, click "Report Misuse"
2. Describe the misuse (minimum 10 characters)
3. Click "Submit Report" → permanently recorded on-chain
4. Download forensic PDF → share with law enforcement

---

## Architecture

```
Frontend (React)         Backend (FastAPI)         Algorand TestNet
─────────────────        ─────────────────         ─────────────────
/login                   /api/auth/signup           GenMark Contract
/generate    ──POST──→   /api/auth/login            App ID: 755880383
/morph       ──POST──→   /api/register    ──────→   register_content()
/verify      ──POST──→   /api/verify      ──────→   verify_content()
             ──POST──→   /api/morph                 flag_misuse()
             ──POST──→   /api/flag        ──────→   get_flag()
             ──POST──→   /api/certificate
                                    │
                              MongoDB Atlas          Resend Email
                              (users + email)        (misuse alerts)
```

No blockchain wallet required for end users. All Algorand interactions happen through the backend service.

---

## Project Structure

```
projects/
├── contracts/
│   └── smart_contracts/genmark/
│       └── contract.py          # ARC-4 smart contract (Puya Python)
├── backend/
│   ├── main.py                  # FastAPI endpoints
│   ├── algorand.py              # Blockchain calls + retry logic
│   ├── hashing.py               # pHash computation
│   ├── certificate.py           # PDF certificate generation
│   ├── auth.py                  # MongoDB + JWT authentication
│   └── notifications.py         # Resend email alerts
└── frontend/
    └── src/
        ├── pages/
        │   ├── Login.tsx
        │   ├── Generate.tsx
        │   ├── Morph.tsx
        │   └── Verify.tsx
        └── components/
            ├── ResultCard.tsx
            └── StampBadge.tsx
```

---

## Setup & Deployment

### Prerequisites
- Python 3.12+, Poetry
- Node.js 18+, npm
- AlgoKit CLI (`pip install algokit`)

### Local Development

```bash
# Terminal 1 — Backend
cd projects/backend
python -m venv venv && source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt
# create .env (see .env.example)
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd projects/frontend
npm install
npm run dev
# Open http://localhost:5173
```

### Required Environment Variables

**Backend** (`projects/backend/.env`):
```
ALGORAND_ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGORAND_ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ALGORAND_APP_ID=755880383
DEPLOYER_MNEMONIC=<your 25-word mnemonic — all on one line>
FRONTEND_URL=http://localhost:5173
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/genmark
JWT_SECRET_KEY=<run: python -c "import secrets; print(secrets.token_hex(32))">
RESEND_API_KEY=<optional — for misuse email alerts>
```

**Frontend** (`projects/frontend/.env`):
```
VITE_BACKEND_URL=http://localhost:8000
```

### Deploy Smart Contract

```bash
cd projects/contracts
poetry install
algokit project run build
algokit project deploy testnet
# Copy printed App ID → set ALGORAND_APP_ID in backend .env
```

### Fund Deployer Account

Each registration costs 0.3 ALGO (covers box storage + ASA minting).
Get free TestNet ALGO at: https://bank.testnet.algorand.network/

Deployer address: `K3SFBBGKSEWGDW3Q4KAPKTI33ING3HLND5YSJVJH467MHA5K72FKCTXRDQ`

### Production Deployment

**Backend → Railway:**
1. New Project → GitHub repo → Root Directory: `projects/backend`
2. Add all backend env vars in Railway Variables tab
3. Deploy → get Railway URL

**Frontend → Vercel:**
1. Import repo → Root Directory: `projects/frontend`
2. Add `VITE_BACKEND_URL=<Railway URL>`
3. Deploy → get Vercel URL
4. Update `FRONTEND_URL` in Railway env vars

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contract | Algorand Python (Puya), AlgoKit, ARC-4 |
| Image Fingerprinting | imagehash pHash (64-bit) + Pillow |
| Backend | FastAPI, algosdk, ReportLab, Motor, Resend |
| Auth | bcrypt (passlib) + JWT HS256 |
| Frontend | React 18, TypeScript, TailwindCSS, React Router v7 |
| Image Generation | Pollinations AI (free, no API key) |
| Backend Hosting | Railway (Docker) |
| Frontend Hosting | Vercel |
| Database | MongoDB Atlas M0 (free tier) |
| Blockchain | Algorand TestNet via AlgoNode |

**Total infrastructure cost: $0**

---

## License

MIT
