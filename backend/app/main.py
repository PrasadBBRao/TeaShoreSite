"""
app/main.py — Teashore FastAPI application entry point.

Routers are registered here. Each router lives in app/routers/ and handles
one domain (auth, menu, reservations, orders, …).

DO NOT add database drop/reset logic here or in any lifespan event.
Normal startup ONLY connects to the existing database and serves the app.
"""

import logging
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth as auth_router
from app.routers import menu as menu_router
from app.routers import reservations as reservations_router
from app.routers import tables as tables_router
from app.routers import qr_sessions as qr_router
from app.routers import orders as orders_router
from app.routers import reports as reports_router
from app.routers.admin import router as admin_router
from app.routers.admin import ratings_router
from app.order_progression import run_order_progression_worker


@asynccontextmanager
async def lifespan(_app: FastAPI):
    stop_event = threading.Event()
    worker = threading.Thread(
        target=run_order_progression_worker,
        args=(stop_event,),
        name="order-status-progression",
        daemon=True,
    )
    worker.start()
    try:
        yield
    finally:
        stop_event.set()
        worker.join(timeout=2)

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Teashore API", version="0.1.0", lifespan=lifespan)

# ── CORS ──────────────────────────────────────────────────────────────────
# Development origins — always included so local dev needs no extra config.
_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]

# Production origins — set FRONTEND_ORIGINS in the Railway environment as a
# comma-separated list of allowed URLs, e.g.:
#   FRONTEND_ORIGINS=https://teashore.vercel.app,https://www.teashore.in
# Each entry is stripped of surrounding whitespace.  An empty or absent value
# means only the dev origins above are permitted (correct for local dev).
_extra = os.environ.get("FRONTEND_ORIGINS", "")
_prod_origins = [o.strip() for o in _extra.split(",") if o.strip()]

_allowed_origins = _DEV_ORIGINS + _prod_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────
app.include_router(auth_router.router)
app.include_router(menu_router.router)
app.include_router(reservations_router.router)
app.include_router(tables_router.router)
app.include_router(qr_router.router)
app.include_router(orders_router.router)
app.include_router(admin_router)
app.include_router(ratings_router)
app.include_router(reports_router.router)


# ── Core endpoints ────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def root():
    """Root endpoint — confirms the backend process is running."""
    return {"status": "Teashore backend is running"}


@app.get("/health", tags=["Health"])
def health():
    """
    Health check — returns 200 if the backend process is alive.
    Deliberately does NOT check DB connectivity (use this to distinguish
    'backend down' from 'database down').

    Ping this at least every 5 days to keep the Supabase free-tier active.
    """
    return {"status": "ok"}
