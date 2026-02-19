# CLAUDE.md — Algorand Hackathon QuickStart Template

## Project Overview

This is a full-stack Algorand dApp template for hackathons. It is a monorepo managed by AlgoKit with:
- **`projects/contracts/`** — Python smart contracts (Algorand Python / Puya)
- **`projects/frontend/`** — React + TypeScript frontend

The contracts are compiled to TEAL and deployed on Algorand. TypeScript clients are auto-generated from ARC-56 specs and used by the frontend.

---

## Key Commands

### Frontend (run from `projects/frontend/`)
```bash
npm run dev                    # Start dev server at http://localhost:5173
npm run build                  # Production build
npm run generate:app-clients   # Regenerate TS clients from compiled contracts
npm run lint                   # Lint check
npm run lint:fix               # Auto-fix lint issues
npm run test                   # Jest unit tests
npm run playwright:test        # E2E tests
```

### Smart Contracts (run from `projects/contracts/`)
```bash
algokit project run build      # Compile all contracts
algokit project deploy testnet # Deploy to TestNet
algokit localnet start         # Start local Algorand node (Docker required)
algokit localnet stop          # Stop local node
```

### Workspace-level (run from root)
```bash
algokit project bootstrap all  # Install all dependencies (Python + Node)
```

---

## Architecture

### Smart Contracts
- Written in **Algorand Python** (Puya compiler), located in `projects/contracts/smart_contracts/`
- **Counter contract** (`counter/contract.py`): stateful ARC4 contract with a single `incr_counter()` method
- **Bank contract** (`bank/contract.py`): ARC4 contract supporting `deposit()` and `withdraw()` using BoxMap for per-user balances
- Compiled artifacts live in `smart_contracts/artifacts/` (TEAL, ARC-56 JSON, Python client, TypeScript client)
- After modifying contracts, **always rebuild** and **regenerate clients**:
  ```bash
  algokit project run build
  npm run generate:app-clients
  ```

### Frontend
- **`src/App.tsx`** — Wallet provider setup and routing
- **`src/Home.tsx`** — Landing page with feature cards
- **`src/components/`** — Feature components (one per feature)
- **`src/contracts/`** — Auto-generated TypeScript contract clients (do not hand-edit)
- **`src/utils/`** — Network config helpers and Pinata IPFS utilities

### Network Clients
- `algodClient` — Submits transactions, reads chain state
- `indexerClient` — Queries historical transaction data
- Both configured via `VITE_*` environment variables; see `.env.template`

---

## Environment Setup

Copy `.env.template` to `.env` in `projects/frontend/` and fill in:

| Variable | Purpose |
|---|---|
| `VITE_ALGOD_SERVER` | Algod node URL |
| `VITE_ALGOD_NETWORK` | `localnet` / `testnet` / `mainnet` |
| `VITE_INDEXER_SERVER` | Indexer node URL |
| `VITE_KMD_SERVER` | KMD server (LocalNet only) |
| `VITE_PINATA_JWT` | Pinata API JWT for IPFS uploads |
| `VITE_PINATA_GATEWAY` | Pinata gateway URL |

For TestNet (no local setup needed):
```
VITE_ALGOD_SERVER=https://testnet-api.algonode.cloud
VITE_ALGOD_NETWORK=testnet
VITE_INDEXER_SERVER=https://testnet-idx.algonode.cloud
```

---

## Important Patterns

### Adding a New Smart Contract
1. Create `smart_contracts/<name>/contract.py` using `ARC4Contract` base class
2. Create `smart_contracts/<name>/deploy_config.py`
3. Register it in `smart_contracts/__main__.py`
4. Run `algokit project run build`
5. Run `npm run generate:app-clients` in frontend

### Adding a New Frontend Feature
1. Create a new component in `src/components/MyFeature.tsx`
2. Use the `useWallet()` hook for wallet state
3. Use `getAlgodConfigFromViteEnvironment()` and `AlgorandClient` for transactions
4. Add a card to `Home.tsx` to expose the feature
5. Use `notistack` (`enqueueSnackbar`) for success/error feedback

### Wallet Access Pattern
```typescript
import { useWallet } from '@txnlab/use-wallet-react'
const { activeAddress, transactionSigner } = useWallet()
```

### Creating an AlgorandClient
```typescript 
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

const algodConfig = getAlgodConfigFromViteEnvironment()
const algorandClient = AlgorandClient.fromConfig({ algodConfig })
algorandClient.setDefaultSigner(transactionSigner)
```

### Calling a Contract Method
```typescript
const client = algorandClient.client.getTypedAppClientById(CounterClient, {
  appId: BigInt(APP_ID),
  defaultSender: activeAddress,
})
const result = await client.send.incrCounter()
```

### IPFS Upload (Pinata)
- Use `uploadFileToPinata(file)` from `src/utils/pinata.ts`
- Returns an IPFS CID; use `VITE_PINATA_GATEWAY/<cid>` for the URL

---

## Deployed Contract IDs (TestNet)
- **Counter**: App ID `747652603`

---

## ARC Standards Used
- **ARC-3**: NFT metadata standard (image + JSON metadata on IPFS)
- **ARC-4**: Smart contract ABI interface
- **ARC-56**: Extended app specification (used for client generation)

---

## Common Gotchas

- **microAlgos vs ALGO**: 1 ALGO = 1,000,000 microAlgos. Always convert before transactions.
- **ASA Opt-In**: Accounts must opt in to an ASA before receiving it. Use `AssetOptIn.tsx` pattern.
- **Box storage MBR**: The Bank contract uses BoxMap; the deployer must fund the app with enough ALGO to cover minimum balance requirements.
- **Client regeneration**: After any contract change, regenerate TS clients or the frontend will use stale ABIs.
- **KMD wallet only works on LocalNet**: Do not expose KMD credentials in production.
- **Pinata JWT**: Keep this secret. It is exposed in `.env` — do not commit `.env` to git.

---

## File Locations Quick Reference

| What | Where |
|---|---|
| Counter contract source | `projects/contracts/smart_contracts/counter/contract.py` |
| Bank contract source | `projects/contracts/smart_contracts/bank/contract.py` |
| Counter TS client | `projects/frontend/src/contracts/Counter.ts` |
| Bank TS client | `projects/frontend/src/contracts/Bank.ts` |
| Network config util | `projects/frontend/src/utils/network/getAlgoClientConfigs.ts` |
| Pinata util | `projects/frontend/src/utils/pinata.ts` |
| Wallet setup | `projects/frontend/src/App.tsx` |
| Landing page | `projects/frontend/src/Home.tsx` |
| Frontend env template | `projects/frontend/.env.template` |
