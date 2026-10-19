"""
app/routers/auth.py — Customer authentication endpoints.

POST /auth/signup  — register a new customer
POST /auth/login   — authenticate and receive a JWT
GET  /auth/me      — return the currently authenticated user (protected)

Design notes:
  - Passwords are hashed with bcrypt via passlib. Plaintext is never stored.
  - JWTs are signed HS256 with JWT_SECRET_KEY from .env.
  - Database errors are never silently converted to auth errors — a
    temporarily unreachable database returns 503, not 401.
  - Duplicate mobile numbers return 409 Conflict, not 500.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.schemas import LoginRequest, SignupRequest, TokenOut, UserOut
from app.core.security import create_access_token, hash_password, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── POST /auth/signup ─────────────────────────────────────────────────────

@router.post(
    "/signup",
    response_model=TokenOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new customer",
)
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    """
    Create a new customer account.

    - 201  Created      — account created, token returned
    - 409  Conflict     — mobile number already registered
    - 422  Unprocessable — validation error (missing / invalid fields)
    - 503  Unavailable  — database temporarily unreachable
    """
    # 1 — Check for existing user (explicit lookup before insert so we can
    #     return 409 rather than letting IntegrityError surface a 500).
    try:
        existing = (
            db.query(User)
            .filter(User.mobile_number == body.mobile_number)
            .first()
        )
    except SQLAlchemyError as exc:
        logger.error("signup: DB error during duplicate check: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database temporarily unavailable. Please retry.",
        )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Mobile number already registered.",
        )

    # 2 — Hash password and create user
    new_user = User(
        mobile_number=body.mobile_number,
        name=body.name,
        password_hash=hash_password(body.password),
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
    except IntegrityError:
        # Race-condition safety net: another request registered same number
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Mobile number already registered.",
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("signup: DB error during insert: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database temporarily unavailable. Please retry.",
        )

    # 3 — Issue token
    token = create_access_token(subject=str(new_user.id))
    return TokenOut(
        access_token=token,
        user_id=new_user.id,
        name=new_user.name,
        mobile_number=new_user.mobile_number,
    )


# ── POST /auth/login ──────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=TokenOut,
    summary="Authenticate and receive a JWT",
)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """
    Log in with mobile number and password.

    - 200  OK           — credentials valid, token returned
    - 401  Unauthorized — mobile number not found OR password incorrect
                          (same message intentionally — avoid user enumeration)
    - 422  Unprocessable — validation error
    - 503  Unavailable  — database temporarily unreachable

    IMPORTANT: DB errors are NOT collapsed into 401.
    A network failure returns 503 so it can be distinguished from bad creds.
    """
    _bad_creds = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect mobile number or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 1 — Fetch user
    try:
        user = (
            db.query(User)
            .filter(User.mobile_number == body.mobile_number)
            .first()
        )
    except SQLAlchemyError as exc:
        logger.error("login: DB error during user lookup: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database temporarily unavailable. Please retry.",
        )

    # 2 — User not found → same 401 as wrong password (no enumeration)
    if user is None:
        raise _bad_creds

    # 3 — User exists but was created before auth was introduced (no hash yet)
    if not user.password_hash:
        raise _bad_creds

    # 4 — Verify password
    if not verify_password(body.password, user.password_hash):
        raise _bad_creds

    # 5 — Issue token
    token = create_access_token(subject=str(user.id))
    return TokenOut(
        access_token=token,
        user_id=user.id,
        name=user.name,
        mobile_number=user.mobile_number,
    )


# ── GET /auth/me ──────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserOut,
    summary="Return the currently authenticated user",
)
def me(current_user: User = Depends(get_current_user)):
    """
    Protected endpoint — returns the authenticated user's profile.
    Requires a valid Bearer token in the Authorization header.

    - 200  OK           — authenticated user's data
    - 401  Unauthorized — missing / invalid / expired token
    - 503  Unavailable  — database temporarily unreachable
    """
    return current_user
