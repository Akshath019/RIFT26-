"""
GenMark — FastAPI Backend
==========================
The single backend service that handles all blockchain interactions.

Architecture:
  - Frontend (Vercel) calls this backend (Render) via HTTP
  - Backend computes perceptual hashes, calls Algorand smart contract, generates PDFs
  - Frontend NEVER touches the blockchain directly

Endpoints:
  POST /api/register     → Image + metadata → pHash → on-chain registration
  POST /api/verify       → Image → pHash → on-chain lookup → origin record
  POST /api/flag         → Hash + description → on-chain misuse report
  POST /api/certificate  → Certificate details → PDF download

Environment variables required:
  ALGORAND_ALGOD_SERVER   — Algod node URL (default: TestNet AlgoNode)
  ALGORAND_APP_ID         — Deployed GenMark contract App ID
  DEPLOYER_MNEMONIC       — 25-word mnemonic of the deployer/signing account
  BACKEND_URL             — This service's public URL (for CORS)
"""

import logging
import os
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from algorand import (
    flag_misuse_on_chain,
    get_flag_from_chain,
    register_content_on_chain,
    verify_content_on_chain,
)
from certificate import generate_certificate
from hashing import compute_phash

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# App Configuration
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="GenMark API",
    description=(
        "AI Content Origin & Misuse Detection backend. "
        "Handles perceptual hashing, Algorand blockchain interactions, and PDF certificate generation."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS: allow the Vercel frontend and local dev server
# In production, restrict this to your Vercel domain
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    os.getenv("FRONTEND_URL", "https://genmark.vercel.app"),
    "*",  # Allow all for hackathon demo — tighten for production
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# Request / Response Models
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


# ─────────────────────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────────────────────


@app.get("/")
async def root():
    """Health check — confirms the backend is running."""
    return {
        "service": "GenMark API",
        "status": "healthy",
        "version": "1.0.0",
        "blockchain": "Algorand TestNet",
    }


@app.get("/health")
async def health():
    """Detailed health check including environment configuration status."""
    app_id = os.getenv("ALGORAND_APP_ID", "0")
    has_mnemonic = bool(os.getenv("DEPLOYER_MNEMONIC"))
    return {
        "status": "healthy",
        "app_id_configured": app_id != "0",
        "app_id": app_id,
        "mnemonic_configured": has_mnemonic,
        "algod_server": os.getenv("ALGORAND_ALGOD_SERVER", "https://testnet-api.algonode.cloud"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 1: Register Content
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/register")
async def register(
    creator_name: str = Form(..., description="Display name of the content creator"),
    platform: str = Form("GenMark", description="Platform that generated the content"),
    image: Optional[UploadFile] = File(None, description="Image file to register"),
    image_url: Optional[str] = Form(None, description="URL of image to fetch and register"),
):
    """
    Register a new AI-generated image on the Algorand blockchain.

    Accepts either an uploaded image file or a URL to fetch the image from.
    Computes the perceptual hash (pHash), calls the GenMark smart contract,
    mints a soulbound ASA as ownership proof, and returns the transaction details.

    Returns:
        {
          "success": true,
          "tx_id": "ALGO_TX_ID...",
          "asa_id": 12345678,
          "phash": "a9e3c4b2d1f5e7c8",
          "app_id": 123456789
        }
    """
    # ── Load image bytes from either file upload or URL ──────────────────────
    image_bytes: bytes

    if image and image.content_type and image.content_type.startswith("image/"):
        image_bytes = await image.read()
        logger.info(f"Received image upload: {image.filename} ({len(image_bytes)} bytes)")
    elif image_url:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(image_url)
                response.raise_for_status()
                image_bytes = response.content
                logger.info(f"Fetched image from URL: {image_url} ({len(image_bytes)} bytes)")
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to fetch image from URL: {e}",
            )
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either an image file (multipart) or an image_url (form field)",
        )

    # ── Compute perceptual hash ───────────────────────────────────────────────
    try:
        phash = compute_phash(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {e}")

    # ── Register on Algorand blockchain ──────────────────────────────────────
    try:
        result = register_content_on_chain(phash, creator_name, platform)
    except Exception as e:
        error_str = str(e)
        # Provide user-friendly error messages for known contract errors
        if "already been registered" in error_str:
            raise HTTPException(
                status_code=409,
                detail="This image has already been registered on GenMark",
            )
        if "ALGORAND_APP_ID" in error_str or "not set" in error_str.lower():
            raise HTTPException(
                status_code=503,
                detail="Blockchain service not configured. Contract not yet deployed.",
            )
        logger.error(f"Blockchain registration failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Blockchain registration failed: {error_str}",
        )

    return {
        "success": True,
        "tx_id": result["tx_id"],
        "asa_id": result["asa_id"],
        "phash": phash,
        "app_id": result["app_id"],
        "message": "Content fingerprint permanently registered on Algorand blockchain",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 2: Verify Content
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/verify")
async def verify(
    image: Optional[UploadFile] = File(None, description="Image file to verify"),
    image_url: Optional[str] = Form(None, description="URL of image to verify"),
):
    """
    Verify if an image is registered on the GenMark blockchain.

    Computes the perceptual hash of the uploaded image and queries the
    smart contract. Returns the full origin record if found.

    Returns (if found):
        {
          "found": true,
          "creator_name": "Alice Smith",
          "creator_address": "ABCD...XYZ",
          "platform": "GenMark",
          "timestamp": "2024-01-15 14:30:00 UTC",
          "asa_id": 12345678,
          "flag_count": 0,
          "phash": "a9e3c4b2d1f5e7c8",
          "app_id": 123456789
        }

    Returns (if not found):
        { "found": false }
    """
    # ── Load image bytes ──────────────────────────────────────────────────────
    image_bytes: bytes

    if image and image.content_type and image.content_type.startswith("image/"):
        image_bytes = await image.read()
    elif image_url:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(image_url)
                response.raise_for_status()
                image_bytes = response.content
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to fetch image from URL: {e}",
            )
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either an image file (multipart) or an image_url (form field)",
        )

    # ── Compute perceptual hash ───────────────────────────────────────────────
    try:
        phash = compute_phash(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {e}")

    # ── Query blockchain (read-only simulation — no fees) ─────────────────────
    try:
        result = verify_content_on_chain(phash)
    except Exception as e:
        error_str = str(e)
        if "ALGORAND_APP_ID" in error_str or "not set" in error_str.lower():
            raise HTTPException(
                status_code=503,
                detail="Blockchain service not configured. Contract not yet deployed.",
            )
        logger.error(f"Blockchain verification failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Blockchain verification failed: {error_str}",
        )

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 3: Flag Misuse
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/flag")
async def flag(request: FlagRequest):
    """
    File an immutable misuse report against registered content.

    The flag and description are permanently stored on the Algorand blockchain.
    The returned transaction ID is legal evidence that the report was filed.

    Request body:
        { "phash": "a9e3c4b2d1f5e7c8", "description": "Used in deepfake video" }

    Returns:
        {
          "success": true,
          "tx_id": "ALGO_TX_ID...",
          "flag_index": 0,
          "phash": "a9e3c4b2d1f5e7c8",
          "message": "Misuse report permanently recorded on blockchain"
        }
    """
    if not request.phash or len(request.phash) != 16:
        raise HTTPException(
            status_code=400,
            detail="phash must be a 16-character perceptual hash hex string",
        )

    if not request.description or len(request.description.strip()) < 10:
        raise HTTPException(
            status_code=400,
            detail="Please provide a detailed description (at least 10 characters)",
        )

    try:
        result = flag_misuse_on_chain(request.phash, request.description.strip())
    except Exception as e:
        error_str = str(e)
        if "not registered" in error_str.lower():
            raise HTTPException(
                status_code=404,
                detail="Content not registered on GenMark — cannot file report",
            )
        logger.error(f"Misuse flag failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to file misuse report: {error_str}",
        )

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


@app.post("/api/certificate")
async def certificate(request: CertificateRequest):
    """
    Generate a forensic PDF certificate for a verified content registration.

    The certificate is suitable for submission to police cyber cells or courts.
    It contains all on-chain evidence identifiers and verification instructions.

    Returns:
        PDF file download (application/pdf)
    """
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
        raise HTTPException(
            status_code=500,
            detail=f"Certificate generation failed: {e}",
        )

    safe_creator = "".join(c for c in request.creator_name if c.isalnum() or c in "-_")
    filename = f"genmark_certificate_{safe_creator[:20]}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
