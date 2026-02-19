# GenMark — Implementation Plan (Updated 2026-02-19)

## Current Status: ALL CODE DONE, Deploy Blocked by .env Formatting

The smart contract compiles. The backend code is ready. The frontend works.
The **only blocker** is a formatting error in `.env.testnet` — the mnemonic
is split across two lines, so AlgoKit can't read it.

---

## How Algorand Works (ELI5 for Beginners)

### What is Algorand?
Algorand is a blockchain — a permanent, public database that no one can edit or delete.
Once data goes on Algorand, it stays there forever. Anyone can read it. No one can change it.

### Key Concepts for GenMark

| Concept | What It Is | GenMark Usage |
|---------|-----------|---------------|
| **Account** | Like a bank account. Has an address (public, like email) and a mnemonic (private, like password — 25 words). Anyone with the mnemonic controls the account. | Our deployer account signs all transactions |
| **ALGO** | The currency of Algorand. Costs ~0.001 ALGO per transaction (~$0.0002). TestNet ALGO is free (fake money for testing). | We need ~10 ALGO to deploy and run tests |
| **Smart Contract** | A program that lives ON the blockchain. Once deployed, it runs forever. Has an "App ID" (like a phone number — you use it to call the contract). | GenMark contract stores image fingerprints |
| **Box Storage** | A key-value store inside a smart contract. Like a dictionary: `key → value`. Each box costs a small amount of ALGO to create. | We store `pHash → ContentRecord` |
| **ASA (Algorand Standard Asset)** | A custom token. Like creating your own cryptocurrency or certificate. | We mint a soulbound certificate per image |
| **Transaction** | Any action on the blockchain. Every transaction gets a unique ID and timestamp. This is the **proof** that something happened. | Registration creates a transaction — permanent evidence |
| **Soulbound** | An ASA that cannot be transferred. Once minted, it's permanently locked. | Our certificates can never be stolen or faked |
| **TestNet** | A free test version of Algorand. Identical to real Algorand, but uses free fake ALGO. Perfect for hackathons. | We deploy and test here |
| **AlgoNode** | A free public API that lets us talk to Algorand without running our own node. URL: `https://testnet-api.algonode.cloud` | Our backend connects through this |
| **ABI (Application Binary Interface)** | The "API spec" of a smart contract. Defines what methods exist and what arguments they take. | Our backend calls contract methods through ABI |
| **ARC-4** | Algorand's standard for smart contract interfaces. Like OpenAPI/Swagger but for blockchain. | Our contract follows ARC-4 |
| **Puya** | The compiler that turns Algorand Python code into TEAL (the bytecode that runs on Algorand). | `algokit project run build` uses Puya |
| **AlgoKit** | Algorand's official developer toolkit. Handles compilation, deployment, testing. | We use AlgoKit for everything |

### How a Transaction Flows

```
1. Backend creates a transaction (e.g., "register this image hash")
2. Backend signs it with the deployer's private key (from mnemonic)
3. Backend sends it to AlgoNode → AlgoNode sends it to Algorand network
4. Algorand validators confirm the transaction in ~4 seconds
5. Transaction is permanently recorded with a unique ID + timestamp
6. Backend returns the transaction ID to the frontend
7. Anyone can look up that transaction ID forever on AlgoExplorer
```

### How Box Storage Works

```
Smart Contract (App ID: 123456789)
├── Global State: total_registrations = 5
├── Box "reg_a9e3c4b2..." → { creator: "Alice", platform: "GenMark", time: 1708300000, ... }
├── Box "reg_f7d1b8e3..." → { creator: "Bob", platform: "GenMark", time: 1708300100, ... }
├── Box "flg_a9e3c4b2...\x00" → "Used in fake political ad"
└── Box "flg_a9e3c4b2...\x01" → "Shared without attribution on Twitter"
```

Each box is like a row in a database. The key is the image fingerprint.
The value is the full registration record.

---

## How the Algorand Connection Actually Works (Full Chain)

This is the exact sequence of what happens when you deploy and when users interact:

### Deployment Flow (one-time setup)

```
YOU run:  algokit project deploy testnet
          │
          ▼
AlgoKit reads: projects/contracts/.algokit.toml
          │    → finds deploy command: "poetry run python -m smart_contracts deploy"
          │    → finds required env vars: DEPLOYER_MNEMONIC, DISPENSER_MNEMONIC
          │
          ▼
AlgoKit reads: projects/contracts/.env.testnet
          │    → loads ALGOD_SERVER, DEPLOYER_MNEMONIC, DISPENSER_MNEMONIC
          │    → sets them as environment variables
          │
          ▼
AlgoKit runs: poetry run python -m smart_contracts deploy
          │
          ▼
__main__.py: scans smart_contracts/ folder
          │  → finds 3 contracts: counter, bank, genmark
          │  → for each: imports deploy_config.py → calls deploy()
          │
          ▼
genmark/deploy_config.py:
  1. AlgorandClient.from_environment()     → connects to AlgoNode TestNet
  2. account.from_environment("DEPLOYER")  → reads DEPLOYER_MNEMONIC → derives private key
  3. factory.deploy()                       → uploads contract TEAL code to blockchain
  4. Algorand returns: App ID (a number)    → THIS IS WHAT WE NEED
  5. Sends 10 ALGO to contract address      → funds box storage
  6. Prints: "ALGORAND_APP_ID=<number>"     → YOU copy this number
```

### Runtime Flow (every time a user generates an image)

```
User clicks "Create" on localhost:5173
          │
          ▼
Frontend: sends POST /api/register to backend (localhost:8000)
          │    body: { image_url, creator_name, platform }
          │
          ▼
Backend (main.py):
  1. Downloads image from Pollinations URL
  2. hashing.py: computes pHash (16-char hex fingerprint)
  3. algorand.py: register_content_on_chain(phash, creator, platform)
          │
          ▼
algorand.py:
  1. Reads ALGORAND_APP_ID from .env     → knows which contract to call
  2. Reads DEPLOYER_MNEMONIC from .env   → gets private key to sign transactions
  3. Builds AtomicTransactionComposer:
     [0] PaymentTxn: 0.1 ALGO → contract address (covers box storage cost)
     [1] AppCallTxn: register_content(phash, name, platform, payment)
  4. Signs both transactions with deployer private key
  5. Sends to AlgoNode → Algorand confirms in ~4 seconds
  6. Contract returns: ASA ID (the soulbound certificate number)
          │
          ▼
Backend returns: { tx_id, asa_id, phash, app_id }
          │
          ▼
Frontend shows: green "Certified ✓" badge (not blue "Demo Mode")
```

### Where Each Piece Lives

| Component | File | Reads From | Purpose |
|-----------|------|------------|---------|
| Smart Contract | `contracts/smart_contracts/genmark/contract.py` | — | The on-chain program (compiled to TEAL) |
| Deploy Config | `contracts/smart_contracts/genmark/deploy_config.py` | `.env.testnet` | Uploads contract to blockchain |
| Deploy Env | `contracts/.env.testnet` | — | DEPLOYER_MNEMONIC + AlgoNode URL |
| Backend Env | `backend/.env` | — | ALGORAND_APP_ID + DEPLOYER_MNEMONIC |
| Backend Bridge | `backend/algorand.py` | `backend/.env` | Calls contract methods via algosdk |
| API Server | `backend/main.py` | `backend/.env` | HTTP endpoints, calls algorand.py |
| Frontend | `frontend/src/pages/Generate.tsx` | `frontend/.env` | Calls backend API |
| Frontend Env | `frontend/.env` | — | VITE_BACKEND_URL=http://localhost:8000 |

---

## Problems Faced & Solutions (All Resolved)

### Problem 1: `op.box_put` / `op.box_get` not found
**Error:** `Module has no attribute "box_put"`
**Root Cause:** In the installed version of algopy, raw box operations are under `op.Box.put()` and `op.Box.get()`, not `op.box_put()` and `op.box_get()`.
**Fix:** Changed `op.box_put(key, value)` → `op.Box.put(key, value)` and `op.box_get(key)` → `op.Box.get(key)`.
**Status:** FIXED ✓

### Problem 2: `_` not supported as variable name in Puya
**Error:** `_ is not currently supported as a variable name`
**Root Cause:** Puya compiler doesn't allow Python's `_` throwaway variable convention.
**Fix:** Changed to use `key in boxmap` pattern instead.
**Status:** FIXED ✓

### Problem 3: ARC-4 mutable reference tuple unpacking
**Error:** `tuples containing a mutable reference to an ARC-4-encoded value cannot be unpacked`
**Root Cause:** In Puya, `BoxMap.maybe()` returns a tuple containing a mutable ARC-4 reference. Puya forbids assigning this tuple to a variable or unpacking it.
**Fix:** Replaced ALL `.maybe()` calls with `key in self.registry` + `self.registry[key]` direct access:
```python
# WRONG (Puya rejects ALL of these):
record, exists = self.registry.maybe(phash)
flag_maybe = self.registry.maybe(phash)

# CORRECT (applied to register_content, verify_content, AND flag_misuse):
if phash in self.registry:
    return arc4.Bool(True), self.registry[phash].copy()

assert phash in self.registry, "Content not registered"
flag_index = self.registry[phash].flag_count.native
self.registry[phash].flag_count = arc4.UInt64(flag_index + UInt64(1))
```
**Status:** FIXED ✓ — All 3 methods (register, verify, flag_misuse) are fixed. Contract compiles successfully. `GenMark.arc56.json` generated.

### Problem 4: `.env.testnet` formatting — mnemonic split across lines
**Error:** `Python-dotenv could not parse statement starting at line 5` + `WrongMnemonicLengthError: mnemonic length must be 25`
**Root Cause:** The 25-word mnemonic was accidentally split across two lines in `.env.testnet`. python-dotenv reads line-by-line, so it only got the first ~20 words, not all 25.
**Current state of the file (BROKEN):**
```
Line 4: DEPLOYER_MNEMONIC=birth heart fault recall...auction     ← only 20 words
Line 5: enroll harbor tornado abstract medal                     ← these 5 words are LOST
```
**Fix:** The ENTIRE 25-word mnemonic must be on ONE line with NO line breaks.
**Status:** NOT YET FIXED — this is the ONLY remaining blocker.

### Problem 5: `poetry` not found by AlgoKit
**Error:** `Failed to resolve command path, 'poetry' wasn't found`
**Root Cause:** Poetry installed in user-level path, not always in PATH for AlgoKit's subprocess.
**Fix:** Running from user's terminal works (their PATH includes poetry).
**Status:** FIXED ✓

### Problem 6: Generate.tsx image not showing / backend not called
**Error:** Image loads but backend registration never fires (shows Demo Mode)
**Root Cause:** Code used `onLoad` event on a hidden img element. Unreliable.
**Fix:** Rewrote to call backend directly with `image_url`.
**Status:** FIXED ✓

### Problem 7: Algorand deployer account not funded
**Error:** Deploy fails with insufficient funds
**Fix:** Used `algokit dispenser login` + `algokit dispenser fund` to get 10 TestNet ALGO.
**Status:** FIXED ✓ — account has 10 ALGO

---

## What Remains To Be Done (Only 3 Steps)

### Step 1: Fix .env.testnet formatting (THE ONLY BLOCKER)

Open `projects/contracts/.env.testnet` in a text editor and make it **exactly 5 lines**.
Each mnemonic must be **entirely on one line** — no line breaks in the middle:

```
ALGOD_TOKEN=
ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGOD_PORT=
DEPLOYER_MNEMONIC=birth heart fault recall royal expire join unfold rely item spend urban witness lawsuit distance meadow wing fresh electric auction enroll harbor tornado abstract medal
DISPENSER_MNEMONIC=birth heart fault recall royal expire join unfold rely item spend urban witness lawsuit distance meadow wing fresh electric auction enroll harbor tornado abstract medal
```

**IMPORTANT:** Lines 4 and 5 are LONG (the 25-word mnemonic). That's normal. Make sure there is NO Enter/newline in the middle. Your editor may visually wrap long lines — that's fine. But there must be no actual newline character splitting the mnemonic.

### Step 2: Deploy to TestNet

```bash
cd projects/contracts
algokit project deploy testnet
```

**Expected output:** A line saying `ALGORAND_APP_ID=<some number>`. Copy that number.

**If it fails with a build error:** Run `algokit project run build` first, then try deploy again.

### Step 3: Update backend .env and restart

Open `projects/backend/.env` and change:
```
ALGORAND_APP_ID=0
```
to:
```
ALGORAND_APP_ID=<the number from Step 2>
```

Then restart the backend:
```bash
cd projects/backend
# Stop the running server (Ctrl+C)
uvicorn main:app --reload --port 8000
```

### Step 4: Test the full flow

1. Go to `localhost:5173/generate` → type prompt → click Create → **green "Certified" badge** (not blue demo)
2. Save image → go to `localhost:5173/verify` → upload → **green "Verified Original"** card
3. Click "Report Misuse" → submit → permanent on-chain record
4. Click "Download Certificate" → PDF downloads

---

## Key Puya Rules (Lessons Learned)

1. **No `_` variable** — use a real name or `key in boxmap` pattern
2. **No tuple unpacking for ARC-4 refs** — use `key in boxmap` + `boxmap[key]` instead of `.maybe()`
3. **Always `.copy()` ARC-4 values** — when returning from a method
4. **`op.Box.put` not `op.box_put`** — box opcodes are under `op.Box.*`
5. **In-place field update works** — `self.registry[key].field = new_value` is valid Puya
6. **`.env` files must have values on ONE line** — python-dotenv does NOT support multi-line values without quotes

---

## Documentation Resources

| Resource | URL | What It Covers |
|----------|-----|----------------|
| Algorand Python (Puya) docs | https://algorandfoundation.github.io/puya/ | Contract syntax, type rules, BoxMap usage, ARC-4 encoding |
| AlgoKit CLI docs | https://github.com/algorandfoundation/algokit-cli/blob/main/docs/README.md | Build, deploy, dispenser commands |
| algopy API reference | https://algorandfoundation.github.io/puya/api.html | All available types: op.Box, BoxMap, arc4.Struct, etc. |
| algosdk Python SDK | https://py-algorand-sdk.readthedocs.io/ | AtomicTransactionComposer, ABI methods, signing |
| ARC-4 spec | https://arc.algorand.foundation/ARCs/arc-0004 | ABI encoding, method signatures, struct types |
| Algorand Box Storage | https://developer.algorand.org/docs/get-details/dapps/smart-contracts/apps/state/#box-storage | Box MBR, create/read/write/delete |
| AlgoKit TestNet Dispenser | https://github.com/algorandfoundation/algokit/blob/main/docs/features/dispenser.md | Login, fund, limit commands |

---

## Architecture Overview

```
User Browser (localhost:5173 / Vercel)
        │
        │  fetch() HTTP calls
        ▼
FastAPI Backend (localhost:8000 / Render)
  ├── hashing.py:    image bytes → pHash (16-char hex)
  ├── algorand.py:   pHash → AtomicTransactionComposer → Algorand
  └── certificate.py: data → PDF bytes
        │
        │  algosdk AtomicTransactionComposer
        ▼
Algorand TestNet (via AlgoNode free API)
  └── GenMark Smart Contract (App ID: TBD after deploy)
       ├── BoxMap "reg_*" → ContentRecord per image
       ├── Boxes "flg_*"  → Misuse flag descriptions
       └── ASA minting    → Soulbound certificates
```

---

## Deployer Account Info

- **Address:** `K3SFBBGKSEWGDW3Q4KAPKTI33ING3HLND5YSJVJH467MHA5K72FKCTXRDQ`
- **Balance:** 10.0 TestNet ALGO (funded via AlgoKit dispenser)
- **Mnemonic:** stored in `projects/backend/.env` and `projects/contracts/.env.testnet`
- **Network:** Algorand TestNet via AlgoNode (`https://testnet-api.algonode.cloud`)
