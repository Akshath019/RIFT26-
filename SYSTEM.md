# SYSTEM.md — System Architecture & Documentation

## Project: Algorand Hackathon QuickStart Template

A production-ready monorepo starter kit for building decentralized applications (dApps) on the Algorand blockchain. Designed for rapid development in hackathon settings with pre-built components covering all common on-chain operations.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                 │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐  │
│  │ SendAlgo │ │   Bank   │ │ CreateASA │ │ MintNFT  │  │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘ └────┬─────┘  │
│       │             │             │             │         │
│  ┌────▼─────────────▼─────────────▼─────────────▼─────┐  │
│  │         @algorandfoundation/algokit-utils           │  │
│  │              @txnlab/use-wallet (algosdk)            │  │
│  └────────────────────────┬────────────────────────────┘  │
└───────────────────────────┼────────────────────────────────┘
                            │ HTTPS / WebSocket
         ┌──────────────────┼──────────────────┐
         │                  │                  │
    ┌────▼────┐       ┌──────▼──────┐    ┌─────▼─────┐
    │  Algod  │       │   Indexer   │    │  Pinata   │
    │  Node   │       │    Node     │    │   IPFS    │
    │(AlgoNode│       │ (AlgoNode)  │    │    API    │
    │TestNet) │       │  TestNet)   │    └───────────┘
    └────┬────┘       └─────────────┘
         │
    ┌────▼─────────────────────────────┐
    │         Algorand Blockchain       │
    │  ┌───────────────┐ ┌───────────┐ │
    │  │ Counter (ARC4)│ │Bank (ARC4)│ │
    │  │ App ID:       │ │ BoxMap    │ │
    │  │ 747652603     │ │ Storage   │ │
    │  └───────────────┘ └───────────┘ │
    └──────────────────────────────────┘
```

---

## Monorepo Structure

```
Hackathon-QuickStart-template/
├── .algokit.toml               # Workspace config (AlgoKit v2)
├── CLAUDE.md                   # Claude Code assistant context
├── SYSTEM.md                   # This file — system documentation
├── README.md                   # User-facing setup guide
├── Alokit_setup.md             # AlgoKit installation guide
│
├── projects/
│   ├── contracts/              # Smart contract project
│   │   ├── smart_contracts/
│   │   │   ├── counter/
│   │   │   │   ├── contract.py      # Counter ARC4 contract
│   │   │   │   └── deploy_config.py
│   │   │   ├── bank/
│   │   │   │   ├── contract.py      # Bank ARC4 contract
│   │   │   │   └── deploy_config.py
│   │   │   ├── artifacts/
│   │   │   │   ├── counter/         # Compiled TEAL + ARC-56 + clients
│   │   │   │   └── bank/            # Compiled TEAL + ARC-56 + clients
│   │   │   ├── __init__.py
│   │   │   └── __main__.py          # Build/deploy orchestration
│   │   ├── tests/                   # Python contract tests
│   │   ├── pyproject.toml
│   │   └── poetry.toml
│   │
│   └── frontend/               # React dApp project
│       ├── src/
│       │   ├── App.tsx              # Root: wallet providers + routing
│       │   ├── Home.tsx             # Landing page + feature cards
│       │   ├── main.tsx             # React entry point
│       │   ├── components/
│       │   │   ├── ConnectWallet.tsx
│       │   │   ├── Account.tsx
│       │   │   ├── SendAlgo.tsx
│       │   │   ├── AppCalls.tsx     # Counter contract UI
│       │   │   ├── Bank.tsx         # Bank contract UI
│       │   │   ├── CreateASA.tsx
│       │   │   ├── MintNFT.tsx
│       │   │   ├── AssetOptIn.tsx
│       │   │   └── ErrorBoundary.tsx
│       │   ├── contracts/
│       │   │   ├── Counter.ts       # Auto-generated TS client
│       │   │   └── Bank.ts          # Auto-generated TS client
│       │   ├── interfaces/
│       │   │   └── network.ts
│       │   └── utils/
│       │       ├── pinata.ts
│       │       ├── ellipseAddress.ts
│       │       └── network/
│       │           └── getAlgoClientConfigs.ts
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── jest.config.ts
│       ├── playwright.config.ts
│       └── .env.template
│
└── .github/workflows/          # CI/CD pipelines
```

---

## Technology Stack

### Smart Contract Layer
| Component | Technology | Version |
|---|---|---|
| Language | Algorand Python (Puya) | 2.0+ |
| Compiler | AlgoKit CLI | 2.0+ |
| ABI Standard | ARC-4 / ARC-56 | — |
| Storage | BoxMap (on-chain key-value) | — |
| Testing | algorand-python-testing | — |
| Dependency Mgmt | Poetry | — |
| Linting | Black, Ruff, mypy | — |

### Frontend Layer
| Component | Technology | Version |
|---|---|---|
| Framework | React | 18.2+ |
| Language | TypeScript | 5.0+ |
| Build Tool | Vite | 5.0+ |
| Styling | TailwindCSS + DaisyUI | 3.3.2 / 4.0 |
| Blockchain SDK | algosdk | 3.0+ |
| AlgoKit Utils | @algorandfoundation/algokit-utils | 9.0+ |
| Wallet Mgmt | @txnlab/use-wallet-react | 4.0+ |
| Notifications | notistack | 3.0+ |
| Testing | Jest + Playwright | — |
| Node.js | Node.js | 20.0+ |

---

## Smart Contracts

### Counter Contract
**File**: `projects/contracts/smart_contracts/counter/contract.py`
**Standard**: ARC-4
**TestNet App ID**: `747652603`

**State**:
| Variable | Type | Description |
|---|---|---|
| `count` | `UInt64` (Global) | Current counter value |

**Methods**:
| Method | Args | Returns | Description |
|---|---|---|---|
| `incr_counter()` | none | `UInt64` | Increments count by 1 and returns new value |

---

### Bank Contract
**File**: `projects/contracts/smart_contracts/bank/contract.py`
**Standard**: ARC-4
**Storage**: BoxMap (Account → UInt64)

**Methods**:
| Method | Args | Returns | Description |
|---|---|---|---|
| `deposit(memo, pay_txn)` | `String`, `PaymentTransaction` | `UInt64` | Records deposit, returns new balance |
| `withdraw(amount)` | `UInt64` | `UInt64` | Sends ALGO to caller, returns remaining balance |

**Constraints**:
- `deposit`: payment receiver must be app account; amount > 0
- `withdraw`: amount > 0; caller must have sufficient balance
- Uses inner transactions for withdrawals
- App must be funded with minimum balance to cover box storage

---

## Frontend Components

### Component Responsibility Map

| Component | On-chain Operation | Key Libraries |
|---|---|---|
| `ConnectWallet.tsx` | Wallet connection | use-wallet |
| `Account.tsx` | Display connected account | use-wallet |
| `SendAlgo.tsx` | Payment transaction (ALGO transfer) | algokit-utils |
| `AppCalls.tsx` | Call Counter contract | Counter TS client |
| `Bank.tsx` | Call Bank contract + Indexer queries | Bank TS client, algosdk Indexer |
| `CreateASA.tsx` | Asset creation transaction | algokit-utils |
| `MintNFT.tsx` | ARC-3 NFT: IPFS upload + ASA creation | Pinata API, algokit-utils |
| `AssetOptIn.tsx` | ASA opt-in transaction | algokit-utils |

---

## Network Configuration

### Supported Networks
| Network | Algod URL | Indexer URL | Use Case |
|---|---|---|---|
| LocalNet | `http://localhost:4001` | `http://localhost:8980` | Local development |
| TestNet | `https://testnet-api.algonode.cloud` | `https://testnet-idx.algonode.cloud` | Staging / Hackathon |
| MainNet | `https://mainnet-api.algonode.cloud` | `https://mainnet-idx.algonode.cloud` | Production |

### KMD (Key Management Daemon)
- Available on **LocalNet only**
- URL: `http://localhost:4002`
- Default wallet: `unencrypted-default-wallet`
- Used to sign transactions in development without a real wallet app

### Wallet Connectors
| Wallet | Networks | Type |
|---|---|---|
| KMD | LocalNet | Developer wallet |
| Pera | TestNet / MainNet | Mobile + Web |
| Defly | TestNet / MainNet | Mobile |
| Exodus | TestNet / MainNet | Desktop + Mobile |
| Lute | TestNet / MainNet | Web |

---

## IPFS / Pinata Integration

Used for NFT media and metadata storage.

### Flow for ARC-3 NFT Minting
```
1. User selects image file
2. Upload image → Pinata → returns image CID
3. Build ARC-3 metadata JSON:
   {
     "name": "...",
     "description": "...",
     "image": "ipfs://<image-cid>",
     "image_mime_type": "image/png"
   }
4. Upload metadata JSON → Pinata → returns metadata CID
5. Compute SHA-256 hash of metadata JSON
6. Create ASA on Algorand with:
   - url: "ipfs://<metadata-cid>#arc3"
   - metadata_hash: <sha256-bytes>
   - total: 1, decimals: 0
```

### Environment Variables
| Variable | Description |
|---|---|
| `VITE_PINATA_JWT` | Pinata API JWT (keep secret) |
| `VITE_PINATA_GATEWAY` | Gateway base URL for viewing files |

---

## Transaction Reference

### ALGO Payment
```typescript
await algorandClient.send.payment({
  sender: activeAddress,
  receiver: recipientAddress,
  amount: AlgoAmount.Algos(amount),
  signer: transactionSigner,
})
```

### ASA Creation
```typescript
await algorandClient.send.assetCreate({
  sender: activeAddress,
  total: BigInt(totalSupply),
  decimals: decimals,
  assetName: name,
  unitName: symbol,
  manager: activeAddress,
  reserve: activeAddress,
})
```

### ASA Opt-In
```typescript
await algorandClient.send.assetOptIn({
  sender: activeAddress,
  assetId: BigInt(assetId),
})
```

### Contract Method Call (typed client)
```typescript
const client = algorandClient.client.getTypedAppClientById(CounterClient, {
  appId: BigInt(APP_ID),
  defaultSender: activeAddress,
})
await client.send.incrCounter()
```

---

## ARC Standards Reference

| Standard | Purpose | Used In |
|---|---|---|
| ARC-3 | NFT metadata schema (JSON on IPFS) | `MintNFT.tsx` |
| ARC-4 | Smart contract ABI (methods + types) | All contracts |
| ARC-56 | Extended app specification for tooling | Client generation |

---

## Build & Deployment Pipeline

```
contracts/contract.py
        │
        ▼ algokit project run build (Puya compiler)
        │
artifacts/
 ├── approval.teal      # AVM bytecode (approval program)
 ├── clear.teal         # AVM bytecode (clear state program)
 ├── *.arc56.json       # ARC-56 app spec (ABI + state schema)
 ├── client.py          # Python typed client
 └── client.ts          # TypeScript typed client (copied to frontend)
        │
        ▼ npm run generate:app-clients
        │
frontend/src/contracts/
 ├── Counter.ts         # Typed TS client used in React components
 └── Bank.ts
```

### Contract Deployment (TestNet)
```bash
algokit project deploy testnet
```
- Uses `deploy_config.py` to determine idempotent deployment
- Funds app account with 1 ALGO minimum after creation
- Outputs App ID to console

---

## Environment Variables Reference

All frontend env vars are prefixed `VITE_` (required by Vite for browser exposure).

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_ALGOD_SERVER` | Yes | — | Algod node base URL |
| `VITE_ALGOD_PORT` | No | `""` | Algod port (blank = default HTTPS) |
| `VITE_ALGOD_TOKEN` | No | `""` | Algod API token |
| `VITE_ALGOD_NETWORK` | Yes | `testnet` | `localnet` / `testnet` / `mainnet` |
| `VITE_INDEXER_SERVER` | Yes | — | Indexer base URL |
| `VITE_INDEXER_PORT` | No | `""` | Indexer port |
| `VITE_INDEXER_TOKEN` | No | `""` | Indexer API token |
| `VITE_KMD_SERVER` | LocalNet | `http://localhost` | KMD base URL |
| `VITE_KMD_PORT` | LocalNet | `4002` | KMD port |
| `VITE_KMD_TOKEN` | LocalNet | `aaa...` | KMD API token |
| `VITE_KMD_WALLET` | LocalNet | `unencrypted-default-wallet` | KMD wallet name |
| `VITE_KMD_PASSWORD` | LocalNet | `""` | KMD wallet password |
| `VITE_PINATA_JWT` | NFT features | — | Pinata API JWT token |
| `VITE_PINATA_GATEWAY` | NFT features | — | Pinata IPFS gateway base URL |

---

## Development Setup (Quick Start)

### Prerequisites
- Node.js 20+, npm 9+
- Python 3.12+, Poetry
- AlgoKit CLI 2.0+ (`pip install algokit`)
- Docker (for LocalNet only)

### Steps
```bash
# 1. Install all dependencies
algokit project bootstrap all

# 2. Set up frontend environment
cd projects/frontend
cp .env.template .env
# Edit .env with your values

# 3. Start frontend dev server
npm run dev

# 4. (Optional) Start LocalNet for local blockchain
algokit localnet start
```

---

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- Contract linting, type checking, and testing on push/PR
- Frontend lint and build validation
- Automated contract deployment to TestNet on merge (if configured)

---

## Security Notes

- Never commit `.env` files — add to `.gitignore`
- `VITE_PINATA_JWT` is exposed in the browser bundle; use scoped API keys with upload-only permissions
- KMD credentials are for local development only; never use on TestNet/MainNet
- Smart contracts on TestNet hold real (but worthless) test ALGO — still validate all transaction logic
- Always verify `pay_txn.receiver == Global.current_application_address` before crediting deposits (done in Bank contract)
