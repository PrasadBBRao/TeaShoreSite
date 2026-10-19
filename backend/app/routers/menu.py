"""
app/routers/menu.py — Menu API endpoints.

All endpoints are public (no authentication required) so customers can
browse the menu before logging in or scanning a QR code.

GET /menu                    — list available menu items (optionally filtered by category)
GET /menu/categories         — list distinct categories that have available items
GET /menu/{item_id}          — fetch a single menu item by UUID

Design notes:
  - Only items where is_available=True are returned by default.
  - Prices come from the database — never hardcoded.
  - Database errors return 503, not empty lists, so the client can distinguish
    "no items" from "DB temporarily down".
  - No write operations in this module; admin create/update/delete comes in the
    Admin API module.
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MenuItem
from app.schemas import MenuItemOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/menu", tags=["Menu"])


# ── GET /menu ─────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[MenuItemOut],
    summary="List available menu items",
)
def list_menu_items(
    category: Optional[str] = Query(
        None,
        description="Filter by category (case-insensitive). Omit to return all categories.",
        max_length=100,
    ),
    include_unavailable: bool = Query(
        False,
        description="Set true to include items where is_available=false. "
                    "Intended for admin use only — no auth enforced here yet.",
    ),
    db: Session = Depends(get_db),
):
    """
    Return menu items from the database.

    - Filters to `is_available=True` by default.
    - Optional `category` query param for category-scoped browsing.
    - Results ordered: category ASC, name ASC — stable, consistent ordering.
    - 200  OK          — list of items (may be empty)
    - 503  Unavailable — database temporarily unreachable
    """
    try:
        q = db.query(MenuItem)

        if not include_unavailable:
            q = q.filter(MenuItem.is_available.is_(True))

        if category:
            # Case-insensitive match so "teas", "Teas", "TEAS" all work
            q = q.filter(MenuItem.category.ilike(category))

        items = q.order_by(MenuItem.category.asc(), MenuItem.name.asc()).all()

    except SQLAlchemyError as exc:
        logger.error("list_menu_items: DB error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database temporarily unavailable. Please retry.",
        )

    return items


# ── GET /menu/categories ──────────────────────────────────────────────────

@router.get(
    "/categories",
    response_model=list[str],
    summary="List distinct menu categories that have available items",
)
def list_categories(db: Session = Depends(get_db)):
    """
    Return a sorted list of distinct category names that contain at least
    one available item.

    - 200  OK          — list of category strings (may be empty)
    - 503  Unavailable — database temporarily unreachable
    """
    try:
        rows = (
            db.query(MenuItem.category)
            .filter(MenuItem.is_available.is_(True))
            .distinct()
            .order_by(MenuItem.category.asc())
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("list_categories: DB error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database temporarily unavailable. Please retry.",
        )

    return [r.category for r in rows]


# ── GET /menu/{item_id} ───────────────────────────────────────────────────

@router.get(
    "/{item_id}",
    response_model=MenuItemOut,
    summary="Fetch a single menu item by ID",
)
def get_menu_item(item_id: UUID, db: Session = Depends(get_db)):
    """
    Return a single menu item by its UUID.

    Returns the item whether or not it is currently available (so the frontend
    can show "sold out" state for a known item rather than a 404).

    - 200  OK          — item found
    - 404  Not Found   — no item with that UUID
    - 503  Unavailable — database temporarily unreachable
    """
    try:
        item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    except SQLAlchemyError as exc:
        logger.error("get_menu_item: DB error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database temporarily unavailable. Please retry.",
        )

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu item '{item_id}' not found.",
        )

    return item
