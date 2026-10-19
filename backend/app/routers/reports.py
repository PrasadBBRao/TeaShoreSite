"""Head Admin APIs for finalized daily historical reports."""

import logging
import os
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.audit import audit
from app.core.security import verify_password
from app.daily_reports import (
    BusinessDateNotComplete,
    DailyReportAlreadyFinalized,
    business_today,
    finalize_daily_report,
)
from app.database import get_db
from app.dependencies import get_head_admin
from app.models import Admin, AuditLog, DailyReportSnapshot
from app.report_pdf import build_daily_report_pdf
from app.schemas import DailyReportOut, DailyReportSummaryOut, ReportDownloadRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/reports", tags=["Admin Reports"])
DOWNLOAD_FAILURE_LIMIT = 5
DOWNLOAD_FAILURE_WINDOW = timedelta(minutes=15)


def _audit_report_view(db: Session, actor: Admin, resource_id: str, view: str) -> None:
    try:
        audit(
            db,
            actor=actor,
            action="report.view",
            resource_type="daily_report",
            resource_id=resource_id,
            metadata={"view": view},
            required=True,
        )
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("report view audit failed: %s", exc)
        raise HTTPException(status_code=503, detail="Report access temporarily unavailable.")


def _audit_download(
    db: Session,
    actor: Admin,
    action: str,
    business_date: date,
    *,
    success: bool,
    metadata: dict | None = None,
) -> None:
    try:
        audit(
            db,
            actor=actor,
            action=action,
            resource_type="daily_report",
            resource_id=business_date.isoformat(),
            success=success,
            metadata=metadata,
            required=True,
        )
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.error("required report-download audit write failed: action=%s", action)
        raise HTTPException(status_code=503, detail="Report download temporarily unavailable.")


def _summary(snapshot: DailyReportSnapshot) -> DailyReportSummaryOut:
    report_data = snapshot.report_data
    order_data = report_data["orders"]
    reservation_data = report_data["reservations"]
    return DailyReportSummaryOut(
        business_date=snapshot.business_date,
        business_timezone=snapshot.business_timezone,
        generated_at=snapshot.generated_at,
        order_count=order_data["total_count"],
        order_status_counts=order_data["status_counts"],
        order_value_all_orders=Decimal(order_data["order_value_all_orders"]),
        revenue_total=order_data["revenue_total"],
        revenue_available=order_data["revenue_available"],
        reservation_count=reservation_data["scheduled_count"],
    )


@router.get("/daily", response_model=list[DailyReportSummaryOut])
def list_daily_reports(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_admin: Admin = Depends(get_head_admin),
    db: Session = Depends(get_db),
):
    try:
        snapshots = (
            db.query(DailyReportSnapshot)
            .order_by(DailyReportSnapshot.business_date.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
    except SQLAlchemyError as exc:
        logger.error("list_daily_reports DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")

    _audit_report_view(db, current_admin, "date-list", "list")
    return [_summary(snapshot) for snapshot in snapshots]


@router.get("/daily/{business_date}", response_model=DailyReportOut)
def get_daily_report(
    business_date: date,
    current_admin: Admin = Depends(get_head_admin),
    db: Session = Depends(get_db),
):
    try:
        snapshot = (
            db.query(DailyReportSnapshot)
            .filter(DailyReportSnapshot.business_date == business_date)
            .first()
        )
    except SQLAlchemyError as exc:
        logger.error("get_daily_report DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Daily report not found.")

    _audit_report_view(db, current_admin, business_date.isoformat(), "detail")
    return snapshot


@router.post("/daily/{business_date}/finalize", response_model=DailyReportOut, status_code=201)
def finalize_daily_report_endpoint(
    business_date: date,
    current_admin: Admin = Depends(get_head_admin),
    db: Session = Depends(get_db),
):
    if business_date >= business_today():
        raise HTTPException(
            status_code=400,
            detail=f"Only completed business dates before {business_today().isoformat()} can be finalized.",
        )
    try:
        return finalize_daily_report(db, business_date, actor=current_admin)
    except DailyReportAlreadyFinalized:
        raise HTTPException(status_code=409, detail="A finalized report already exists for this date.")
    except BusinessDateNotComplete:
        raise HTTPException(status_code=400, detail="Only completed business dates can be finalized.")
    except SQLAlchemyError as exc:
        logger.error("finalize_daily_report DB error: %s", exc)
        raise HTTPException(status_code=503, detail="Report finalization temporarily unavailable.")


@router.post("/daily/{business_date}/download", response_class=Response)
def download_daily_report(
    business_date: date,
    body: ReportDownloadRequest,
    current_admin: Admin = Depends(get_head_admin),
    db: Session = Depends(get_db),
):
    secret_hash = os.getenv("REPORT_DOWNLOAD_SECRET_HASH", "").strip()
    if not secret_hash:
        raise HTTPException(
            status_code=503,
            detail="Report downloads are disabled until REPORT_DOWNLOAD_SECRET_HASH is configured.",
        )

    try:
        locked_admin = (
            db.query(Admin)
            .filter(Admin.id == current_admin.id)
            .with_for_update()
            .first()
        )
        if locked_admin is None or not locked_admin.is_active or locked_admin.role != "head_admin":
            if locked_admin is not None:
                _audit_download(
                    db,
                    locked_admin,
                    "permission.denied",
                    business_date,
                    success=False,
                    metadata={"reason": "head_admin_access_revoked"},
                )
            raise HTTPException(status_code=403, detail="Head admin access required.")

        window_start = datetime.now(timezone.utc) - DOWNLOAD_FAILURE_WINDOW
        failed_attempts = (
            db.query(func.count(AuditLog.id))
            .filter(
                AuditLog.actor_id == current_admin.id,
                AuditLog.action == "report.download.secret_failed",
                AuditLog.created_at >= window_start,
            )
            .scalar()
        ) or 0
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("report download rate-limit lookup failed: %s", exc)
        raise HTTPException(status_code=503, detail="Report download temporarily unavailable.")

    if failed_attempts >= DOWNLOAD_FAILURE_LIMIT:
        _audit_download(
            db,
            locked_admin,
            "report.download.rate_limited",
            business_date,
            success=False,
            metadata={"window_minutes": int(DOWNLOAD_FAILURE_WINDOW.total_seconds() // 60)},
        )
        raise HTTPException(
            status_code=429,
            detail="Too many incorrect report-download secrets. Try again in 15 minutes.",
            headers={"Retry-After": str(int(DOWNLOAD_FAILURE_WINDOW.total_seconds()))},
        )

    secret = body.secret.get_secret_value()
    if len(secret.encode("utf-8")) > 72:
        _audit_download(
            db,
            locked_admin,
            "report.download.secret_failed",
            business_date,
            success=False,
            metadata={"reason": "incorrect_secret"},
        )
        raise HTTPException(status_code=401, detail="Incorrect report-download secret.")

    try:
        secret_matches = verify_password(secret, secret_hash)
    except Exception:
        db.rollback()
        logger.error("REPORT_DOWNLOAD_SECRET_HASH is invalid; report downloads are disabled")
        raise HTTPException(status_code=503, detail="Report downloads are misconfigured.")

    if not secret_matches:
        _audit_download(
            db,
            locked_admin,
            "report.download.secret_failed",
            business_date,
            success=False,
            metadata={"reason": "incorrect_secret"},
        )
        raise HTTPException(status_code=401, detail="Incorrect report-download secret.")

    try:
        snapshot = (
            db.query(DailyReportSnapshot)
            .filter(DailyReportSnapshot.business_date == business_date)
            .first()
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("report download snapshot lookup failed: %s", exc)
        raise HTTPException(status_code=503, detail="Report download temporarily unavailable.")

    if snapshot is None:
        _audit_download(
            db,
            locked_admin,
            "report.download.not_found",
            business_date,
            success=False,
            metadata={"reason": "no_finalized_snapshot"},
        )
        raise HTTPException(status_code=404, detail="Finalized report not found.")

    try:
        pdf_bytes = build_daily_report_pdf(snapshot)
    except Exception:
        db.rollback()
        logger.exception("PDF generation failed for daily report %s", business_date.isoformat())
        raise HTTPException(status_code=500, detail="Could not generate this report PDF.")

    _audit_download(
        db,
        locked_admin,
        "report.download.success",
        business_date,
        success=True,
        metadata={"format": "pdf"},
    )
    filename = f"daily-report-{business_date.isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )