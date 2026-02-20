# GenMark — Implementation Plan (Updated 2026-02-20)

## Current Status: Deployed on Railway + Vercel. Feature branch: three new features below.

---

# NEW FEATURES (Feature Branch)

## Feature 1 — Alteration Detection & Tracking
## Feature 2 — Email Creator on Misuse Report
## Feature 3 — Upload & Morph Existing Registered Image
## Feature 4 — Progressive Auth (UX fix: don't force login on page load)
## Feature 5 — Fix Duplicate Registration Problem (deterministic prompts)

---

## Feature 1: Alteration Detection

### What it does
When a user registers or verifies an image, the backend checks whether it is a **modified version** of an already-registered image (cropped, resized, filtered, etc.) using **perceptual hash similarity**.

- **Exact match** (Hamming distance = 0) → "Already registered"
- **Similar match** (Hamming distance ≤ 10) → "Alteration detected — modified from [original creator]"
- **No match** → New content, register normally

### How pHash similarity works
pHash produces a 64-bit (16 hex char) fingerprint. The **Hamming distance** between two pHashes counts how many bits differ:
- Distance 0 = identical images
- Distance ≤ 10 = visually similar (cropped, resized, colour-adjusted, lightly edited)
- Distance > 10 = different images

### Architecture Decision
**No smart contract changes.** Alterations are tracked in MongoDB. The new pHash is registered on-chain normally as a new content record (it IS a new fingerprint). MongoDB stores the parent relationship.

### MongoDB Collections

**Existing:** `users` — auth accounts

**New:** `registrations`
```json
{
  "phash": "a9e3c4b2f1d08e7a",
  "creator_name": "Alice",
  "creator_email": "alice@example.com",
  "timestamp": "2026-02-20T10:00:00",
  "asa_id": 123456,
  "tx_id": "ABCD...",
  "is_modification": false,
  "original_phash": null,
  "modified_by_name": null
}
```

**Alteration entry:**
```json
{
  "phash": "a9e3c4b2f1d08e7b",
  "creator_name": "Bob",
  "creator_email": "bob@example.com",
  "is_modification": true,
  "original_phash": "a9e3c4b2f1d08e7a",
  "modified_by_name": "Bob"
}
```

### Backend Changes (`main.py`)

**New helper — pHash Hamming distance:**
```python
def hamming_distance(h1: str, h2: str) -> int:
    return bin(int(h1, 16) ^ int(h2, 16)).count('1')
```

**New helper — find similar pHash in MongoDB:**
```python
async def find_similar_registration(phash: str, threshold: int = 10):
    db = get_db()
    if db is None:
        return None
    async for doc in db.registrations.find({}, {"phash": 1, "creator_name": 1, "creator_email": 1}):
        if hamming_distance(phash, doc["phash"]) <= threshold:
            return doc
    return None
```

**Updated `/api/register` flow:**
1. Compute pHash (existing)
2. Check exact match in MongoDB → return "already registered"
3. Check similar match (Hamming ≤ 10) → set `is_modification=True`, store `original_phash`
4. Register new pHash on-chain (background task, same as before)
5. Store to MongoDB `registrations` collection
6. Return response with `is_modification`, `original_creator` fields

**Updated `/api/verify` response** — include `is_modification` and `modified_by` if applicable

### Frontend Changes

**Generate page** — after stamping, if `is_modification=true`, show:
```
⚠ Modified Content
This image appears to be derived from content originally
created by [original_creator_name]
```

**Verify page / ResultCard** — add a "Modified By" row in the details card when `modified_by_name` is present.

---

## Feature 2: Email Creator on Misuse Report

### What it does
When someone submits a flag/misuse report for an image, the backend:
1. Looks up the original creator's email from MongoDB `registrations`
2. Sends them an email: "Your content has been flagged"

### Email Service: Resend
- Free tier: 3,000 emails/month, no credit card
- Sign up at resend.com → API Keys → Create key
- Add `RESEND_API_KEY=re_xxx` to `.env` and Railway variables

### New File: `backend/email.py`
```python
import os, httpx

async def send_flag_notification(
    creator_email: str,
    creator_name: str,
    phash: str,
    description: str,
    tx_id: str,
):
    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key:
        return  # Email not configured, skip silently

    async with httpx.AsyncClient() as client:
        await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "from": "GenMark <noreply@genmark.app>",
                "to": creator_email,
                "subject": "Your GenMark content has been flagged",
                "html": f"""
                    <h2>Misuse Report Filed</h2>
                    <p>Hi {creator_name},</p>
                    <p>A misuse report has been filed against your registered content:</p>
                    <ul>
                        <li><b>Fingerprint:</b> {phash}</li>
                        <li><b>Report:</b> {description}</li>
                        <li><b>Transaction:</b> {tx_id}</li>
                    </ul>
                    <p>This report is permanently recorded on the Algorand blockchain.</p>
                """
            }
        )
```

**Updated `/api/flag` in main.py:**
After `flag_misuse_on_chain` succeeds:
1. Look up `phash` in MongoDB `registrations` → get `creator_email` + `creator_name`
2. Call `send_flag_notification(...)` in a background task

### New Dependency
Add to `requirements.txt`:
```
resend==2.5.0
```

---

---

## Feature 3: Upload & Morph Existing Registered Image

### What it does
A user uploads any image. If it is already registered on GenMark, they can apply a basic
visual transformation (brightness, contrast, saturation, blur, rotate, crop) on the backend
using Pillow. The morphed result gets a new pHash (similar to the original but different),
is registered on-chain as a new entry with `modified_by = current user's name`, and the
certificate PDF reads:

```
Original Creator : Alice
Morphed By       : Bob
Original Hash    : a9e3c4b2f1d08e7a
Morphed Hash     : a9e3c4b2f1d08e7b
```

The original creator also receives an email (Feature 2) notifying them their content was morphed.

---

### Why this makes sense
- Demonstrates the full **provenance chain**: original → morphed → registered
- Shows pHash similarity detection (Feature 1) working in real time
- Triggers email notification to original creator (Feature 2)
- The certificate proves both the original authorship AND the modification — unforgeable on Algorand
- Realistic use case: fan art, remixed content, derivative works with attribution

---

### User Flow

```
1. User goes to /morph page
2. Uploads an image (drag-and-drop or file picker)
3. Backend computes pHash → checks if registered
   ├── NOT registered → show warning "This image has no origin record on GenMark"
   │                    (still allow morph, registers as fresh content)
   └── REGISTERED     → show "Original by Alice · Certified [date]"
4. User picks a morph type:
   [ Brighten ]  [ Contrast ]  [ Saturate ]  [ Blur ]  [ Rotate ]  [ Crop ]
5. Backend applies transform via Pillow → returns morphed image preview
6. User sees: original image (left) | morphed image (right)
7. User clicks "Register Morph"
8. Backend: registers morphed pHash on-chain, stores in MongoDB with parent link
9. Certificate shows: Original Creator + Morphed By
10. Original creator receives email notification (if email on file)
```

---

### New Backend Endpoint: `POST /api/morph`

**Input** (multipart form):
```
image       : UploadFile   — the original image file
morph_type  : str          — one of: brightness | contrast | saturation | blur | rotate | crop
```

**Processing (Pillow transforms):**
```python
def apply_morph(image_bytes: bytes, morph_type: str) -> bytes:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    if morph_type == "brightness":
        img = ImageEnhance.Brightness(img).enhance(1.5)   # +50% brightness
    elif morph_type == "contrast":
        img = ImageEnhance.Contrast(img).enhance(1.6)     # +60% contrast
    elif morph_type == "saturation":
        img = ImageEnhance.Color(img).enhance(1.7)        # vivid colours
    elif morph_type == "blur":
        img = img.filter(ImageFilter.GaussianBlur(radius=3))
    elif morph_type == "rotate":
        img = img.rotate(15, expand=False)                # 15° clockwise
    elif morph_type == "crop":
        w, h = img.size
        m = int(min(w, h) * 0.1)                         # 10% margin crop
        img = img.crop((m, m, w - m, h - m))
        img = img.resize((w, h), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return buf.getvalue()
```

**Output (JSON):**
```json
{
  "original_phash": "a9e3c4b2f1d08e7a",
  "morphed_phash":  "a9e3c4b2f1d08e7b",
  "hamming_distance": 3,
  "original_creator": "Alice",
  "original_registered": true,
  "morphed_image_b64": "<base64 encoded JPEG>"
}
```

Frontend renders the morphed image from the base64 string — no extra round-trip needed.

---

### Updated `/api/register` for Morphed Images

When `morphed_by` form field is present:
```
creator_name : str  — current logged-in user (the morpher)
platform     : str  — "GenMark"
image        : file — the morphed image bytes
morphed_by   : str  — current user's name (signals this is a morph)
original_phash: str — pHash of the original image
```

Backend stores in MongoDB `registrations`:
```json
{
  "phash": "a9e3c4b2f1d08e7b",
  "creator_name": "Bob",
  "is_modification": true,
  "original_phash": "a9e3c4b2f1d08e7a",
  "modified_by_name": "Bob",
  "morph_type": "brightness"
}
```

---

### Updated Certificate (`certificate.py`)

When `modified_by_name` is present, the PDF gets two extra rows:

```
Visual Fingerprint (Original) : a9e3c4b2f1d08e7a
Visual Fingerprint (Morphed)  : a9e3c4b2f1d08e7b
Original Creator              : Alice
Morphed By                    : Bob
```

---

### New Frontend Page: `/morph`

**Components:**
- `DropZone` (reuse existing) — upload original image
- Origin info card — shows original creator + certification date (or "unregistered" warning)
- Morph picker — 6 buttons: Brighten / Contrast / Saturate / Blur / Rotate / Crop
- Side-by-side preview — original (left) + morphed (right)
- "Register Morph" button — sends morphed image to `/api/register` with `morphed_by` field
- Stamp badge appears on morphed image after registration

**State machine:**
```
idle → uploading → verified → morphing → morphed → registering → stamped
```

**Route added to `App.tsx`:**
```tsx
<Route path="/morph" element={<ProtectedRoute><Morph /></ProtectedRoute>} />
```

**Nav link added** to Generate and Verify pages:
```
Create  |  Morph  |  Verify
```

---

### How All Three Features Connect

```
Feature 3 (Morph tool)
        │
        │  produces a modified image with new pHash
        ▼
Feature 1 (Alteration detection)
        │
        │  detects Hamming distance ≤ 10, links to original creator
        ▼
Feature 2 (Email notification)
        │
        │  sends "Your image was morphed by Bob" to Alice's email
        ▼
Certificate shows full provenance chain:
  Original Creator: Alice → Morphed By: Bob
  Both permanently recorded on Algorand
```

This is the core demo story for the hackathon: **complete content provenance from creation → modification → notification**.

---

---

## Feature 4: Progressive Auth (UX Fix)

### The Problem
Currently `ProtectedRoute` wraps `/generate` and `/morph` — the moment a user clicks
"Create" or "Morph" in the nav they are immediately redirected to `/login`. This is
hostile UX. The user hasn't done anything yet. They haven't even seen the product.

**Rule of thumb:** Never ask for an account before the user has a reason to want one.
Forcing signup at the door is the single biggest cause of bounce on landing pages.

### What it should do instead

| Page | Auth required? | When to prompt |
|------|---------------|----------------|
| `/` or `/generate` (view) | No | User can see the page, read about it, browse |
| `/verify` | No | Anyone can verify an image publicly |
| `/morph` (view) | No | User can see the tool |
| Click "Generate" button | Yes | Only at the moment they click Generate |
| Click "Register Morph" button | Yes | Only when they try to register |
| Submitting a flag/report | No | Public action, no auth needed |

### How it works (NOT implementing yet — design decision)

**Remove:** `ProtectedRoute` wrapper from `/generate` and `/morph` routes in `App.tsx`

**Add:** Inline auth gate — when user clicks the Generate or Register Morph button
without being logged in, instead of redirecting, show an **inline modal or inline
prompt** within the page:

```
┌─────────────────────────────────────┐
│  Sign in to generate & certify      │
│  your images on Algorand            │
│                                     │
│  [Log in]  or  [Create account]     │
│                                     │
│  Verification is always free        │
│  and doesn't need an account.       │
└─────────────────────────────────────┘
```

This way:
- Casual visitors can explore the product freely
- The auth prompt appears with context ("you need this to certify your image")
- User understands WHY they're being asked to sign up
- Much lower bounce rate, much better first impression

### Key principle
**Lazy authentication** — ask for credentials at the last responsible moment,
not the first possible moment. The user should already want the feature before
you ask them to create an account for it.

---

---

## Feature 5: Fix Duplicate Registration Problem

### The Problem

The current system is fundamentally broken:

```
User types: "a dragon over a city"
System sends: "a dragon over a city 1708400000"   ← Date.now() appended
Image generated → pHash abc123 → registered on blockchain ✓

Same user, 5 minutes later: "a dragon over a city"
System sends: "a dragon over a city 1708400300"   ← different timestamp
Image generated → DIFFERENT image → pHash def456 → registered AGAIN ✓
```

**Result:** The same prompt creates multiple different images, each with a different pHash,
each consuming a separate blockchain entry. The database fills with duplicates. The
`seed=42` determinism is defeated by the random timestamp. The entire provenance model
breaks — you can't "verify" an image by re-generating it because the timestamp was lost.

### Root Cause

We added `Date.now()` to the prompt in `Generate.tsx` to work around "already registered"
errors from the blockchain. But that was treating the symptom, not the cause.

### The Real Solution: Same Prompt = Same Image = Same Record (Embrace Idempotency)

**Remove `Date.now()` from the prompt.** The prompt goes to the backend exactly as the
user typed it. `seed=42` ensures the same prompt always produces the same image, which
always produces the same pHash. This is **correct by design**.

**Handle "already registered" as a success, not an error.** When the backend detects that
a pHash is already on-chain, it should:
1. Look up the existing registration data (creator, timestamp, asa_id, tx_id)
2. Return it to the frontend as a **successful lookup**, not a 409 error
3. Frontend shows: "Already Certified ✓ — This image was registered on [date] by [creator]"

### Backend Changes (`/api/register`)

```python
# CURRENT (broken):
# On duplicate → background task silently fails, frontend gets tx_id="pending" forever

# NEW (correct):
@app.post("/api/register")
async def register(...):
    phash = compute_phash(image_bytes)

    # 1. Check MongoDB for existing registration
    db = get_db()
    if db:
        existing = await db.registrations.find_one({"phash": phash})
        if existing:
            return {
                "success": True,
                "already_registered": True,
                "tx_id": existing.get("tx_id", "on-chain"),
                "asa_id": existing.get("asa_id", 0),
                "phash": phash,
                "creator_name": existing.get("creator_name", "Unknown"),
                "registered_at": existing.get("timestamp", ""),
                "message": "This image is already certified on Algorand"
            }

    # 2. Not registered → register normally
    background_tasks.add_task(_register_in_background, phash, creator_name, platform)

    # 3. Mirror to MongoDB for fast future lookups
    if db:
        await db.registrations.insert_one({
            "phash": phash,
            "creator_name": creator_name,
            "creator_email": user_email,  # from auth token
            "timestamp": datetime.utcnow().isoformat(),
        })

    return { "success": True, "already_registered": False, ... }
```

### Frontend Changes (`Generate.tsx`)

```tsx
// REMOVE this line:
const effective = prompt.trim() + ' ' + Date.now()

// USE this instead (pure prompt, no timestamp):
const effective = prompt.trim()
```

When response has `already_registered: true`:
```
┌─────────────────────────────────────────────────┐
│  ✓ Already Certified                            │
│                                                  │
│  This image was registered on 2026-02-19         │
│  by Alice                                        │
│                                                  │
│  Fingerprint: a9e3c4b2f1d08e7a                  │
│  Certificate #: 12345                            │
│                                                  │
│  Same prompt always generates the same image.    │
│  That's how provenance works.                    │
└─────────────────────────────────────────────────┘
```

### Why This Is Correct

The whole point of GenMark is: **same content → same fingerprint → one record on-chain**.

If you type the same prompt twice, you SHOULD get the same image, and the system SHOULD
say "already certified". That's not a bug — it's the proof that the system works.
Re-generating the same prompt and getting the same certificate is literally the
**verification** step working from the creation side.

### Summary of Changes

| What | Change |
|------|--------|
| `Generate.tsx` | Remove `Date.now()` from prompt |
| `main.py` `/api/register` | Check MongoDB first; return existing record if found |
| `main.py` `/api/register` | Mirror new registrations to MongoDB `registrations` collection |
| Frontend status | New state `already_registered` → shows green "Already Certified" card |

---

## Files to Change (All 5 Features)

| File | Change |
|------|--------|
| `backend/main.py` | `hamming_distance()`, `find_similar_registration()`, `apply_morph()`, new `/api/morph` endpoint, update `/api/register` (MongoDB-first duplicate check, morphed_by field, mirror to MongoDB), update `/api/verify` (return modification info), update `/api/flag` (email trigger) |
| `backend/email.py` | NEW — Resend email sender |
| `backend/certificate.py` | Add "Original Creator" + "Morphed By" rows when modification present |
| `backend/requirements.txt` | Add `resend==2.5.0` |
| `backend/.env` | Add `RESEND_API_KEY=re_xxx` |
| `frontend/src/pages/Morph.tsx` | NEW — full morph page (upload → verify origin → pick transform → preview → register) |
| `frontend/src/pages/Generate.tsx` | Remove `Date.now()` from prompt, show "Already Certified" for duplicates, show "Modified Content" for alteration, remove ProtectedRoute gate |
| `frontend/src/pages/Verify.tsx` | Pass `modified_by` to ResultCard, add Morph nav link |
| `frontend/src/components/ResultCard.tsx` | Add `modifiedBy` + `originalCreator` rows |
| `frontend/src/App.tsx` | Add `/morph` route, remove ProtectedRoute from `/generate` and `/morph`, keep auth inline |

---

## Implementation Order

1. `backend/email.py` — standalone, no deps on other new code
2. `backend/main.py`:
   - Add `hamming_distance()` + `find_similar_registration()`
   - Add `apply_morph()` using Pillow (already a dependency)
   - Add `POST /api/morph` endpoint
   - Update `POST /api/register` — mirror to MongoDB, detect alteration, accept `morphed_by`
   - Update `POST /api/verify` — return `is_modification` + `modified_by_name`
   - Update `POST /api/flag` — trigger email after successful flag
3. `backend/certificate.py` — add morphed-by rows
4. `frontend/src/components/ResultCard.tsx` — add modification props + UI rows
5. `frontend/src/pages/Morph.tsx` — new morph page
6. `frontend/src/App.tsx` — add `/morph` route
7. `frontend/src/pages/Generate.tsx` — show alteration badge
8. `frontend/src/pages/Verify.tsx` — add Morph nav link, pass modification data
9. Add `RESEND_API_KEY` to Railway variables
10. Push → auto-deploy

---

## Open Questions / Decisions Made

| Question | Decision |
|----------|----------|
| Smart contract changes? | No — MongoDB tracks alteration, no redeploy needed |
| Hamming distance threshold? | ≤ 10 bits (out of 64) = standard "same image" threshold |
| What if creator has no email? | Skip email silently — creator may have registered before auth |
| What if MongoDB is down? | Alteration check skipped, register normally (graceful degradation) |
| Email sender domain? | Use Resend's shared domain for hackathon |
| Where to show alteration info? | Generate page (after stamp), Verify page (result card), Certificate PDF |
| Morph happens client-side or server-side? | Server-side (Pillow) — consistent pHash, no Canvas API complexity |
| What if uploaded image is NOT registered? | Still allow morph — registers as fresh content with no parent link |
| How many morph types? | 6: brightness, contrast, saturation, blur, rotate, crop |
| Morphed image format returned to frontend? | Base64 JPEG in JSON response — no extra image endpoint needed |

---

## Open Questions / Decisions Made

| Question | Decision |
|----------|----------|
| Smart contract changes? | No — MongoDB tracks alteration, no redeploy needed |
| Hamming distance threshold? | ≤ 10 bits (out of 64) = standard "same image" threshold |
| What if creator has no email? | Skip email silently — creator may have registered before auth |
| What if MongoDB is down? | Alteration check skipped, register normally (graceful degradation) |
| Email sender domain? | Use Resend's shared domain for hackathon, set up custom domain later |
| Where to show alteration info? | Both Generate page (after stamp) and Verify page (in result card) |

---


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
