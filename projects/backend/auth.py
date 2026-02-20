"""
GenMark — Auth helpers (MongoDB + JWT)
"""

import os
from datetime import datetime, timedelta
from typing import Optional

import motor.motor_asyncio
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

ALGORITHM = "HS256"
EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Module-level client so we reuse the connection across requests
_client: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None


def get_db() -> Optional[motor.motor_asyncio.AsyncIOMotorDatabase]:
    """Return the 'genmark' MongoDB database, or None if not configured.
    Reads MONGODB_URI at call time so load_dotenv() in main.py takes effect first.
    """
    global _client
    uri = os.getenv("MONGODB_URI", "")
    if not uri:
        return None
    if _client is None:
        _client = motor.motor_asyncio.AsyncIOMotorClient(uri)
    return _client.genmark


# ── Pydantic models ──────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    email: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


# ── Password helpers ─────────────────────────────────────────────────────────

def _truncate(password: str) -> bytes:
    """Encode password to UTF-8 and truncate to bcrypt's 72-byte hard limit."""
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return pwd_context.hash(_truncate(password))


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(_truncate(plain), hashed)


# ── JWT helpers ──────────────────────────────────────────────────────────────

def create_token(user_id: str, email: str, name: str) -> str:
    secret = os.getenv("JWT_SECRET_KEY", "changeme-set-a-real-secret-in-production")
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "exp": datetime.utcnow() + timedelta(days=EXPIRE_DAYS),
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    secret = os.getenv("JWT_SECRET_KEY", "changeme-set-a-real-secret-in-production")
    try:
        return jwt.decode(token, secret, algorithms=[ALGORITHM])
    except JWTError:
        return None
