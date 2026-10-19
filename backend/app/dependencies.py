"""
app/dependencies.py — FastAPI Depends() factories shared across routers.

Exports:
  get_current_user    — validates customer JWT, returns User
  get_current_admin   — validates admin JWT, checks is_active, returns Admin
  get_head_admin      — like get_current_admin but also enforces role='head_admin'

Role / token separation:
  - Customer JWTs have no 'role' claim (or role != 'admin').
  - Admin JWTs carry role='admin' in the payload.
  - get_current_user explicitly rejects admin tokens.
  - get_current_admin explicitly rejects non-admin tokens.
  - get_head_admin further rejects staff tokens (role DB field != 'head_admin').
  - Deactivated admin accounts are rejected by get_current_admin on every
    request — deactivation takes effect immediately without needing token
    revocation.
"""

import logging

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.audit import audit
from app.models import Admin, User
from app.core.security import decode_access_token

# tokenUrl points to our login endpoint so OpenAPI's "Authorize" button works.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
logger = logging.getLogger(__name__)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Validates the customer Bearer JWT and returns the User.

    HTTP 401  →  missing / malformed / expired token
    HTTP 401  →  admin token presented (wrong dependency)
    HTTP 401  →  user no longer exists in the database
    HTTP 503  →  database unreachable
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
    except JWTError:
        raise credentials_exc

    # Reject admin tokens — they belong to get_current_admin, not here
    if payload.get("role") == "admin":
        raise credentials_exc

    user_id: str = payload.get("sub")
    if not user_id:
        raise credentials_exc

    try:
        user = db.query(User).filter(User.id == user_id).first()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database temporarily unavailable. Please retry.",
        )

    if user is None:
        raise credentials_exc

    return user


def get_current_admin(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Admin:
    """
    Validates an admin Bearer JWT and returns the Admin.

    Checks performed on every request:
      1. JWT signature and expiry
      2. JWT payload carries role='admin'
      3. Admin row exists in the database
      4. Admin account is_active=True (deactivated → 403)

    HTTP 401  →  missing / malformed / expired token
    HTTP 403  →  valid token but role claim is not 'admin'
    HTTP 401  →  admin no longer exists in the database
    HTTP 403  →  admin account has been deactivated
    HTTP 503  →  database unreachable
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired admin token.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
    except JWTError:
        raise credentials_exc

    # JWT-level role gate — rejects customer tokens immediately
    if payload.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )

    admin_id: str = payload.get("sub")
    if not admin_id:
        raise credentials_exc

    try:
        admin = db.query(Admin).filter(Admin.id == admin_id).first()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database temporarily unavailable. Please retry.",
        )

    if admin is None:
        raise credentials_exc

    # DB-level active check — takes effect immediately on deactivation
    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This admin account has been deactivated.",
        )

    return admin


def get_head_admin(
    request: Request,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> Admin:
    """
    Extends get_current_admin — additionally enforces role='head_admin'.

    Use this dependency on any endpoint that only the Head Admin may call
    (staff creation, role changes, account deactivation, etc.).

    HTTP 403  →  authenticated admin has role='staff' (not head_admin)
    """
    if current_admin.role != "head_admin":
        try:
            audit(
                db,
                actor=current_admin,
                action="permission.denied",
                resource_type="admin_endpoint",
                resource_id=request.url.path,
                success=False,
                metadata={"method": request.method, "path": request.url.path},
            )
            db.commit()
        except SQLAlchemyError:
            db.rollback()
            logger.exception("permission-denied audit commit failed")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Head admin access required. Staff accounts cannot perform this action.",
        )
    return current_admin
