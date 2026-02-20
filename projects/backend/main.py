"""
GenMark — FastAPI Backend
"""

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
    """Catch all unhandled exceptions and return a JSON 500 that passes through CORS middleware."""
    logger.error(f"Unhandled exception on {request.method} {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )


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


def _pollinations_url_for_prompt(prompt: str) -> str:
    """Pollinations AI — free, no API key. seed=42 → deterministic per prompt."""
    encoded = urllib.parse.quote(prompt, safe="")
    return f"https://image.pollinations.ai/prompt/{encoded}?width=512&height=512&nologo=true&seed=42"


def _loremflickr_url_for_prompt(prompt: str) -> str:
    """
    LoremFlickr fallback — free, no API key, keyword-based, deterministic via lock.
    Extracts meaningful words from the prompt as search keywords.
    """
    stopwords = {
        'a', 'an', 'the', 'in', 'of', 'at', 'on', 'over', 'and', 'with',
        'made', 'is', 'are', 'by', 'for', 'to', 'from', 'into', 'above',
        'below', 'flying', 'floating', 'entirely', 'glowing', 'ancient',
        'futuristic', 'neon', 'made', 'entirely',
    }
    words = [w.strip('.,!?') for w in prompt.lower().split()]
    keywords = [w for w in words if w not in stopwords and len(w) > 2][:4]
    seed = sum(ord(c) for c in prompt) % 9999 + 1
    kw_str = ','.join(keywords) if keywords else 'nature,landscape'
    return f"https://loremflickr.com/512/512/{kw_str}?lock={seed}"


async def fetch_image_from_url(url: str) -> bytes:
    """Fetch image bytes using browser-like headers."""
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
    """
    Try Pollinations AI first (real AI images). Fall back to LoremFlickr
    (keyword-based photos, deterministic) if Pollinations is unavailable.
    Same prompt always resolves to the same image source → same pHash.
    """
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
# Endpoint 0: Image Generation Proxy
# ─────────────────────────────────────────────────────────────────────────────


@app.get("/api/generate-image")
async def generate_image(prompt: str):
    """
    Returns an image for a given prompt.
    Tries Pollinations AI (real AI image) first; falls back to LoremFlickr
    (keyword-based photos) if Pollinations is unavailable.
    Both sources are deterministic — same prompt → same image → same pHash.
    """
    image_bytes = await fetch_image_for_prompt(prompt)
    return Response(content=image_bytes, media_type="image/jpeg")


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 1: Register Content
# ─────────────────────────────────────────────────────────────────────────────


def _register_in_background(phash: str, creator_name: str, platform: str) -> None:
    """Fire-and-forget blockchain registration (runs in thread pool)."""
    try:
        result = register_content_on_chain(phash, creator_name, platform)
        logger.info(f"Background registration complete: phash={phash} asa_id={result['asa_id']}")
    except Exception as e:
        error_str = str(e)
        if "already been registered" in error_str or (
            "logic eval error" in error_str and "assert failed" in error_str
        ):
            logger.info(f"Background registration: already registered phash={phash}")
        elif "ALGORAND_APP_ID" in error_str or "not set" in error_str.lower():
            logger.warning(f"Background registration: blockchain not configured phash={phash}")
        else:
            logger.error(f"Background registration failed phash={phash}: {e}", exc_info=True)


@app.post("/api/register")
async def register(
    background_tasks: BackgroundTasks,
    creator_name: str = Form(...),
    platform: str = Form("GenMark"),
    image: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
    prompt: Optional[str] = Form(None),
):
    """
    Register AI-generated image on Algorand blockchain.

    Computes pHash synchronously, returns immediately, and runs the
    blockchain call in the background to avoid proxy timeouts.

    Priority order for image source:
      1. prompt  — backend computes SAME picsum URL as /api/generate-image
      2. image   — direct file upload
      3. image_url — fetch from external URL
    """
    image_bytes: bytes

    if prompt:
        logger.info(f"Fetching image for prompt '{prompt[:50]}'")
        image_bytes = await fetch_image_for_prompt(prompt)
        logger.info(f"Fetched {len(image_bytes)} bytes")

    elif image and image.content_type and image.content_type.startswith("image/"):
        image_bytes = await image.read()
        logger.info(f"Received image upload: {image.filename} ({len(image_bytes)} bytes)")

    elif image_url:
        logger.info(f"Fetching image from URL: {image_url}")
        image_bytes = await fetch_image_from_url(image_url)
        logger.info(f"Fetched {len(image_bytes)} bytes from URL")

    else:
        raise HTTPException(
            status_code=400,
            detail="Provide a prompt, image file, or image_url",
        )

    try:
        phash = compute_phash(image_bytes)
        logger.info(f"Computed pHash: {phash} — queuing blockchain registration")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {e}")

    # Queue blockchain call — returns immediately, no proxy timeout
    background_tasks.add_task(_register_in_background, phash, creator_name, platform)

    return {
        "success": True,
        "tx_id": "pending",
        "asa_id": 0,
        "phash": phash,
        "app_id": int(os.getenv("ALGORAND_APP_ID", "0")),
        "message": "Content fingerprint registration queued on Algorand blockchain",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 2: Verify Content
# ─────────────────────────────────────────────────────────────────────────────


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

    try:
        result = verify_content_on_chain(phash)
    except Exception as e:
        error_str = str(e)
        if "ALGORAND_APP_ID" in error_str or "not set" in error_str.lower():
            raise HTTPException(status_code=503, detail="Blockchain service not configured.")
        logger.error(f"Blockchain verification failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Blockchain verification failed: {error_str}")

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 3: Flag Misuse
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/flag")
async def flag(request: FlagRequest):
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

    return {
        "success": True,
        "tx_id": result["tx_id"],
        "flag_index": result["flag_index"],
        "phash": result["phash"],
        "message": "Misuse report permanently recorded on the Algorand blockchain",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 4: Generate Certificate
# ─────────────────────────────────────────────────────────────────────────────

#THIS IS JUST 
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


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 5: Auth — Signup / Login
# ─────────────────────────────────────────────────────────────────────────────


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