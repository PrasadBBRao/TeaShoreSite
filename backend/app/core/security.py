"""
app/core/security.py — password hashing and JWT utilities.

Uses:
  - passlib[bcrypt] for password hashing (bcrypt is the recommended
    algorithm available from our pinned passlib==1.7.4 + bcrypt==4.0.1)
  - python-jose for JWT creation/validation

All secrets come from environment variables — never hard-coded.
"""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from jose import JWTError, jwt
from passlib.context import CryptContext

# Load .env so this module works both standalone and inside uvicorn
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

# ── Password hashing ──────────────────────────────────────────────────────
# bcrypt is the recommended algorithm for passlib when bcrypt is installed.
# deprecated="auto" will upgrade old hashes on next login if the scheme changes.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of *plain*. Never store the plain value."""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed*."""
    return pwd_context.verify(plain, hashed)


# ── JWT configuration (from environment) ─────────────────────────────────
SECRET_KEY: str   = os.getenv("JWT_SECRET_KEY", "")
ALGORITHM: str    = os.getenv("JWT_ALGORITHM", "HS256")
EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

if not SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY is not set. "
        "Add it to backend/.env before starting the server."
    )


def create_access_token(subject: str, extra: Optional[dict] = None) -> str:
    """
    Create a signed JWT.

    Args:
        subject:  The value to store in the 'sub' claim — typically the
                  user's UUID (as a string) so we can look them up.
        extra:    Optional dict of additional claims to embed.

    Returns:
        A signed JWT string.
    """
    now    = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=EXPIRE_MINUTES)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": expire,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Decode and validate a JWT.

    Raises:
        jose.JWTError  if the token is invalid, expired, or tampered.

    Returns:
        The decoded payload dict.
    """
    # Raises JWTError on any validation failure (expiry, signature, etc.)
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
