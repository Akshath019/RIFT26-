"""
GenMark — FastAPI Backend
"""

import asyncio
import base64
import io as _io
import logging
import os
import urllib.parse
from datetime import datetime
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from PIL import Image, ImageEnhance, ImageFilter
from pydantic import BaseModel

from algorand import (
    flag_misuse_on_chain,
    get_flag_from_chain,
    register_content_on_chain,
    verify_content_on_chain,
)
from auth import (
    UserCreate,
    UserLogin,
    create_token,
    get_db,
    hash_password,
    verify_password,
)
from certificate import generate_certificate
from notifications import send_flag_notification
from hashing import compute_phash

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

app = FastAPI(title="GenMark API", version="1.0.0", docs_url="/docs", redoc_url="/redoc")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────────────────────

class FlagRequest(BaseModel):
    phash: str
    description: str


class CertificateRequest(BaseModel):
    tx_id: str
    creator_name: str
    platform: str
    timestamp: str
    asa_id: str
    app_id: str
    phash: str
    flag_descriptions: list[str] = []
    modified_by: Optional[str] = None
    original_phash: Optional[str] = None
    provenance_chain: list[dict] = []


# ─────────────────────────────────────────────────────────────────────────────
# Image fetching helpers
# ─────────────────────────────────────────────────────────────────────────────

def _pollinations_url_for_prompt(prompt: str) -> str:
    encoded = urllib.parse.quote(prompt, safe="")
    return f"https://image.pollinations.ai/prompt/{encoded}?width=512&height=512&nologo=true&seed=42"


def _loremflickr_url_for_prompt(prompt: str) -> str:
    stopwords = {
        'a', 'an', 'the', 'in', 'of', 'at', 'on', 'over', 'and', 'with',
        'made', 'is', 'are', 'by', 'for', 'to', 'from', 'into', 'above',
        'below', 'flying', 'floating', 'entirely', 'glowing', 'ancient',
        'futuristic', 'neon',
    }
    words = [w.strip('.,!?') for w in prompt.lower().split()]
    keywords = [w for w in words if w not in stopwords and len(w) > 2][:4]
    seed = sum(ord(c) for c in prompt) % 9999 + 1
    kw_str = ','.join(keywords) if keywords else 'nature,landscape'
    return f"https://loremflickr.com/512/512/{kw_str}?lock={seed}"


async def fetch_image_from_url(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True, headers=BROWSER_HEADERS) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
            return response.content
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to fetch image (HTTP {e.response.status_code}): {url}",
            )
        except httpx.HTTPError as e:
            raise HTTPException(status_code=400, detail=f"Failed to fetch image: {e}")


async def fetch_image_for_prompt(prompt: str) -> bytes:
    """Try Pollinations first, fall back to LoremFlickr. Both deterministic per prompt."""
    try:
        url = _pollinations_url_for_prompt(prompt)
        logger.info(f"Trying Pollinations: {url[:80]}…")
        return await fetch_image_from_url(url)
    except HTTPException as e:
        logger.warning(f"Pollinations failed ({e.detail}), falling back to LoremFlickr")
    url = _loremflickr_url_for_prompt(prompt)
    logger.info(f"Using LoremFlickr fallback: {url}")
    return await fetch_image_from_url(url)


# ─────────────────────────────────────────────────────────────────────────────
# pHash similarity helpers  (Feature 1 & 5)
# ─────────────────────────────────────────────────────────────────────────────

def hamming_distance(h1: str, h2: str) -> int:
    """Count differing bits between two 16-char hex pHashes."""
    try:
        return bin(int(h1, 16) ^ int(h2, 16)).count('1')
    except (ValueError, TypeError):
        return 64



def build_provenance_chain_from_blockchain(phash: str) -> list:
    """Walk the blockchain backwards via original_phash links stored in ContentRecord.
    Returns list of steps oldest-first (original creator first, latest morph last).
    This is purely on-chain: no MongoDB involved.
    """
    chain = []
    current = phash
    visited: set = set()
    while current and current not in visited:
        visited.add(current)
        try:
            result = verify_content_on_chain(current)
        except Exception as e:
            logger.warning(f"Chain walk: blockchain lookup failed for phash={current}: {e}")
            break
        if not result.get("found"):
            break
        chain.append({
            "phash": current,
            "creator_name": result.get("creator_name", "Unknown"),
            "morphed_by": result.get("morphed_by", "") or "",
            "timestamp": result.get("timestamp", ""),
            "is_original": not bool(result.get("original_phash", "")),
        })
        current = result.get("original_phash", "") or ""
    chain.reverse()  # oldest ancestor first
    return chain




async def _mirror_to_db(phash: str, creator_name: str, creator_email: str = "") -> None:
    """Store phash→email mapping in MongoDB for misuse notification emails only.
    The provenance chain (original_phash, morphed_by) lives on-chain, not here.
    """
    db = get_db()
    if db is None:
        return
    if not creator_email:
        return  # nothing useful to store without email
    try:
        doc = {
            "phash": phash,
            "creator_name": creator_name,
            "creator_email": creator_email,
            "registered_at": datetime.utcnow().isoformat(),
        }
        await db.registrations.update_one(
            {"phash": phash}, {"$setOnInsert": doc}, upsert=True
        )
    except Exception as e:
        logger.warning(f"MongoDB email mirror failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Morph helper  (Feature 3)
# ─────────────────────────────────────────────────────────────────────────────

VALID_MORPH_TYPES = {"brightness", "contrast", "saturation", "blur", "rotate", "crop"}


def apply_morph(image_bytes: bytes, morph_type: str) -> bytes:
    """Apply a Pillow-based visual transformation and return new JPEG bytes."""
    img = Image.open(_io.BytesIO(image_bytes)).convert("RGB")

    if morph_type == "brightness":
        img = ImageEnhance.Brightness(img).enhance(1.5)
    elif morph_type == "contrast":
        img = ImageEnhance.Contrast(img).enhance(1.6)
    elif morph_type == "saturation":
        img = ImageEnhance.Color(img).enhance(1.7)
    elif morph_type == "blur":
        img = img.filter(ImageFilter.GaussianBlur(radius=3))
    elif morph_type == "rotate":
        img = img.rotate(15, expand=False)
    elif morph_type == "crop":
        w, h = img.size
        m = int(min(w, h) * 0.1)
        img = img.crop((m, m, w - m, h - m))
        img = img.resize((w, h), Image.LANCZOS)

    buf = _io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
# Blockchain background task
# ─────────────────────────────────────────────────────────────────────────────

def _register_on_chain_sync(
    phash: str,
    creator_name: str,
    platform: str,
    original_phash: str = "",
    morphed_by: str = "",
) -> dict:
    """Synchronous blockchain registration — raises on failure."""
    return register_content_on_chain(phash, creator_name, platform, original_phash, morphed_by)


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"service": "GenMark API", "status": "healthy", "version": "1.0.0"}


@app.get("/health")
async def health():
    app_id = os.getenv("ALGORAND_APP_ID", "0")
    return {
        "status": "healthy",
        "app_id_configured": app_id != "0",
        "app_id": app_id,
        "mnemonic_configured": bool(os.getenv("DEPLOYER_MNEMONIC")),
        "algod_server": os.getenv("ALGORAND_ALGOD_SERVER", "https://testnet-api.algonode.cloud"),
    }


# ── Endpoint 0: Image Generation Proxy ───────────────────────────────────────

@app.get("/api/generate-image")
async def generate_image(prompt: str):
    """Deterministic AI image proxy — Pollinations first, LoremFlickr fallback."""
    image_bytes = await fetch_image_for_prompt(prompt)
    return Response(content=image_bytes, media_type="image/jpeg")


# ── Endpoint 1: Register Content ─────────────────────────────────────────────

@app.post("/api/register")
async def register(
    creator_name: str = Form(...),
    platform: str = Form("GenMark"),
    image: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
    prompt: Optional[str] = Form(None),
    morphed_by: Optional[str] = Form(None),
    original_phash: Optional[str] = Form(None),
    creator_email: Optional[str] = Form(None),
):
    """
    Register content on Algorand blockchain (synchronous — waits for confirmation).

    original_phash and morphed_by are stored permanently on-chain in ContentRecord,
    forming the provenance chain. No MongoDB is used for chain data.

    MongoDB is only used for:
      - Email lookup (creator_email) for misuse notifications
      - Fast duplicate detection before hitting the blockchain
    """
    # ── Get image bytes ──
    if prompt:
        logger.info(f"Fetching image for prompt '{prompt[:50]}'")
        image_bytes = await fetch_image_for_prompt(prompt)
    elif image and image.content_type and image.content_type.startswith("image/"):
        image_bytes = await image.read()
        logger.info(f"Received upload: {image.filename} ({len(image_bytes)} bytes)")
    elif image_url:
        image_bytes = await fetch_image_from_url(image_url)
        logger.info(f"Fetched {len(image_bytes)} bytes from URL")
    else:
        raise HTTPException(status_code=400, detail="Provide a prompt, image file, or image_url")

    try:
        phash = compute_phash(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {e}")

    # ── Fast duplicate check: try blockchain verify first (read-only, free) ──
    try:
        existing_chain = verify_content_on_chain(phash)
        if existing_chain.get("found"):
            logger.info(f"Already registered on-chain: phash={phash}")
            existing_morphed_by = existing_chain.get("morphed_by", "")
            # phash_collision_with_original: incoming request is a morph (morphed_by set)
            # but the existing record is an original (no morphed_by) → pHash didn't change
            phash_collision = bool(morphed_by) and not existing_morphed_by
            # Store email in MongoDB for future flag notifications
            await _mirror_to_db(phash, existing_chain.get("creator_name", creator_name), creator_email or "")
            return {
                "success": True,
                "already_registered": True,
                "phash_collision_with_original": phash_collision,
                "tx_id": "existing",
                "asa_id": existing_chain.get("asa_id", 0),
                "phash": phash,
                "app_id": existing_chain.get("app_id", int(os.getenv("ALGORAND_APP_ID", "0"))),
                "creator_name": existing_chain.get("creator_name", creator_name),
                "is_modification": existing_chain.get("is_modification", False),
                "original_phash": existing_chain.get("original_phash", ""),
                "morphed_by": existing_morphed_by,
                "message": "This content is already certified on GenMark",
            }
    except Exception as e:
        error_str = str(e)
        if "ALGORAND_APP_ID" in error_str or "not set" in error_str.lower():
            raise HTTPException(status_code=503, detail="Blockchain not configured. Set ALGORAND_APP_ID.")
        # Any other error (network, etc.) → proceed to register
        logger.warning(f"Duplicate check failed, proceeding to register: {e}")

    # ── Register on blockchain (synchronous — user waits for confirmation) ──
    detected_original_phash = original_phash or ""
    detected_morphed_by = morphed_by or ""

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            _register_on_chain_sync,
            phash,
            creator_name,
            platform,
            detected_original_phash,
            detected_morphed_by,
        )
        tx_id = result["tx_id"]
        asa_id = result["asa_id"]
        logger.info(f"Registered on-chain: phash={phash} tx={tx_id} asa_id={asa_id}")
    except Exception as e:
        error_str = str(e)
        if "already been registered" in error_str or (
            "logic eval error" in error_str and "assert failed" in error_str
        ):
            logger.info(f"Blockchain rejected duplicate: phash={phash}")
            await _mirror_to_db(phash, creator_name, creator_email or "")
            return {
                "success": True,
                "already_registered": True,
                "tx_id": "existing",
                "asa_id": 0,
                "phash": phash,
                "app_id": int(os.getenv("ALGORAND_APP_ID", "0")),
                "creator_name": creator_name,
                "is_modification": bool(detected_original_phash),
                "original_phash": detected_original_phash,
                "morphed_by": detected_morphed_by,
                "message": "This content is already certified on GenMark",
            }
        logger.error(f"Blockchain registration failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Blockchain registration failed: {error_str}")

    # ── Store email in MongoDB for flag notifications only ──
    await _mirror_to_db(phash, creator_name, creator_email or "")

    return {
        "success": True,
        "already_registered": False,
        "tx_id": tx_id,
        "asa_id": asa_id,
        "phash": phash,
        "app_id": int(os.getenv("ALGORAND_APP_ID", "0")),
        "is_modification": bool(detected_original_phash),
        "original_phash": detected_original_phash,
        "morphed_by": detected_morphed_by,
        "message": "Content permanently registered on the Algorand blockchain",
    }


# ── Endpoint 2: Verify Content ───────────────────────────────────────────────

@app.post("/api/verify")
async def verify(
    image: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
):
    if image and image.content_type and image.content_type.startswith("image/"):
        image_bytes = await image.read()
    elif image_url:
        image_bytes = await fetch_image_from_url(image_url)
    else:
        raise HTTPException(status_code=400, detail="Provide an image file or image_url")

    try:
        phash = compute_phash(image_bytes)
        logger.info(f"Verify pHash: {phash}")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {e}")

    # ── Query blockchain ──
    try:
        result = verify_content_on_chain(phash)
    except Exception as e:
        error_str = str(e)
        if "ALGORAND_APP_ID" in error_str or "not set" in error_str.lower():
            raise HTTPException(status_code=503, detail="Blockchain service not configured.")
        logger.error(f"Blockchain verification failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Blockchain verification failed: {error_str}")

    # ── Build provenance chain from blockchain (pure on-chain walk) ──
    if result.get("found"):
        try:
            chain = await asyncio.get_event_loop().run_in_executor(
                None, build_provenance_chain_from_blockchain, phash
            )
            result["provenance_chain"] = chain
        except Exception as e:
            logger.warning(f"Provenance chain build failed: {e}")
            result["provenance_chain"] = []
    else:
        result["provenance_chain"] = []

    return result


# ── Endpoint 3: Flag Misuse ───────────────────────────────────────────────────

@app.post("/api/flag")
async def flag(request: FlagRequest, background_tasks: BackgroundTasks):
    if not request.phash or len(request.phash) != 16:
        raise HTTPException(status_code=400, detail="phash must be a 16-character hex string")
    if not request.description or len(request.description.strip()) < 10:
        raise HTTPException(status_code=400, detail="Please provide a description (at least 10 characters)")

    try:
        result = flag_misuse_on_chain(request.phash, request.description.strip())
    except Exception as e:
        error_str = str(e)
        if "not registered" in error_str.lower():
            raise HTTPException(status_code=404, detail="Content not registered on GenMark")
        logger.error(f"Misuse flag failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to file misuse report: {error_str}")

    # Feature 2: email original creator
    db = get_db()
    if db is not None:
        try:
            doc = await db.registrations.find_one({"phash": request.phash})
            if doc and doc.get("creator_email"):
                background_tasks.add_task(
                    send_flag_notification,
                    doc["creator_email"],
                    doc.get("creator_name", "Creator"),
                    request.phash,
                    request.description.strip(),
                    result["tx_id"],
                )
        except Exception as e:
            logger.warning(f"Could not look up creator for email notification: {e}")

    return {
        "success": True,
        "tx_id": result["tx_id"],
        "flag_index": result["flag_index"],
        "phash": result["phash"],
        "message": "Misuse report permanently recorded on the Algorand blockchain",
    }


# ── Endpoint 4: Generate Certificate ─────────────────────────────────────────

@app.post("/api/certificate")
async def certificate(request: CertificateRequest):
    try:
        pdf_bytes = generate_certificate(
            tx_id=request.tx_id,
            creator_name=request.creator_name,
            platform=request.platform,
            timestamp=request.timestamp,
            asa_id=request.asa_id,
            app_id=request.app_id,
            phash=request.phash,
            flag_descriptions=request.flag_descriptions,
            modified_by=request.modified_by,
            original_phash=request.original_phash,
            provenance_chain=request.provenance_chain,
        )
    except Exception as e:
        logger.error(f"Certificate generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Certificate generation failed: {e}")

    safe_creator = "".join(c for c in request.creator_name if c.isalnum() or c in "-_")
    filename = f"genmark_certificate_{safe_creator[:20]}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Endpoint 5: Morph ─────────────────────────────────────────────────────────

@app.post("/api/morph")
async def morph(
    image: UploadFile = File(...),
    morph_type: str = Form("brightness"),
):
    """
    Feature 3: Apply a Pillow transformation to an uploaded image.
    Returns original pHash, morphed pHash, similarity info, and morphed image as base64.
    """
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Must upload an image file")
    if morph_type not in VALID_MORPH_TYPES:
        raise HTTPException(status_code=400, detail=f"morph_type must be one of: {', '.join(VALID_MORPH_TYPES)}")

    image_bytes = await image.read()

    try:
        original_phash = compute_phash(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {e}")

    # Check if original is registered — query blockchain directly
    original_registered = False
    original_creator = ""
    original_morphed_by = ""
    original_chain: list = []
    try:
        chain_result = verify_content_on_chain(original_phash)
        if chain_result.get("found"):
            original_registered = True
            original_creator = chain_result.get("creator_name", "")
            original_morphed_by = chain_result.get("morphed_by", "")
            try:
                original_chain = build_provenance_chain_from_blockchain(original_phash)
            except Exception as chain_err:
                logger.warning(f"Chain build failed in morph endpoint: {chain_err}")
    except Exception as e:
        logger.warning(f"Blockchain lookup failed in morph endpoint: {e}")

    # Apply transformation
    try:
        morphed_bytes = apply_morph(image_bytes, morph_type)
        morphed_phash = compute_phash(morphed_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Morph failed: {e}")

    distance = hamming_distance(original_phash, morphed_phash)
    morphed_b64 = base64.b64encode(morphed_bytes).decode()

    return {
        "original_phash": original_phash,
        "morphed_phash": morphed_phash,
        "hamming_distance": distance,
        "original_registered": original_registered,
        "original_creator": original_creator,
        "original_morphed_by": original_morphed_by,
        "provenance_chain": original_chain,
        "morphed_image_b64": morphed_b64,
        "morph_type": morph_type,
    }


# ── Endpoints 6–7: Auth ───────────────────────────────────────────────────────

@app.post("/api/auth/signup")
async def signup(user: UserCreate):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured. Set MONGODB_URI.")
    try:
        existing = await db.users.find_one({"email": user.email.lower().strip()})
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")
        doc = {
            "name": user.name.strip(),
            "email": user.email.lower().strip(),
            "password_hash": hash_password(user.password),
            "created_at": datetime.utcnow().isoformat(),
        }
        result = await db.users.insert_one(doc)
        token = create_token(str(result.inserted_id), doc["email"], doc["name"])
        return {"token": token, "name": doc["name"], "email": doc["email"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Signup DB error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.post("/api/auth/login")
async def login(user: UserLogin):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured. Set MONGODB_URI.")
    try:
        doc = await db.users.find_one({"email": user.email.lower().strip()})
        if not doc or not verify_password(user.password, doc["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        token = create_token(str(doc["_id"]), doc["email"], doc["name"])
        return {"token": token, "name": doc["name"], "email": doc["email"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login DB error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
