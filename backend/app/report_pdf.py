"""Render an immutable daily report snapshot as an in-memory PDF."""

from io import BytesIO
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

from app.models import DailyReportSnapshot

_INK = colors.HexColor("#2B2118")
_MUTED = colors.HexColor("#766553")
_ACCENT = colors.HexColor("#9A6537")
_RULE = colors.HexColor("#DED5C9")
_PALE = colors.HexColor("#F5F1EB")


def _plain_text(value: Any) -> str:
    text = str(value if value is not None else "—")
    text = "".join(char for char in text if char in "\n\r\t" or ord(char) >= 32)
    return escape(text).replace("\n", "<br />")


def _paragraph(value: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(_plain_text(value), style)


def _section_table(rows: list[list[Any]], widths: list[float], body_style: ParagraphStyle) -> LongTable:
    header_style = ParagraphStyle(
        "ReportTableHeader",
        parent=body_style,
        textColor=colors.white,
        fontName="Helvetica-Bold",
    )
    content = [
        [
            _paragraph(cell, header_style if row_index == 0 else body_style)
            for cell in row
        ]
        for row_index, row in enumerate(rows)
    ]
    table = LongTable(content, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _PALE]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, _INK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.35, _RULE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def build_daily_report_pdf(snapshot: DailyReportSnapshot) -> bytes:
    """Return a PDF byte string for the supplied saved snapshot."""
    data = snapshot.report_data
    orders = data["orders"]
    reservations = data["reservations"]
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Daily historical report {snapshot.business_date.isoformat()}",
        author="Teashore",
    )
    base_styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=base_styles["Title"],
        alignment=TA_LEFT,
        textColor=_INK,
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=27,
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=base_styles["BodyText"],
        textColor=_MUTED,
        fontName="Helvetica",
        fontSize=9,
        leading=14,
        spaceAfter=10,
    )
    section_style = ParagraphStyle(
        "ReportSection",
        parent=base_styles["Heading2"],
        textColor=_ACCENT,
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        spaceBefore=13,
        spaceAfter=6,
        keepWithNext=True,
    )
    body_style = ParagraphStyle(
        "ReportTableBody",
        parent=base_styles["BodyText"],
        textColor=_INK,
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
    )
    story = [
        _paragraph("Daily historical report", title_style),
        _paragraph(
            f"Business date: {snapshot.business_date.isoformat()} ({snapshot.business_timezone})"
            f"\nGenerated: {snapshot.generated_at.isoformat()}",
            subtitle_style,
        ),
        _paragraph("Order summary", section_style),
    ]
    summary_rows = [
        ["Metric", "Value"],
        ["Total orders", str(orders["total_count"])],
        ["Order value, all orders (not revenue)", f"{orders['order_value_all_orders']}"],
        ["Revenue", "Unavailable" if not orders["revenue_available"] else str(orders["revenue_total"])],
    ]
    story.append(_section_table(summary_rows, [105 * mm, 69 * mm], body_style))
    if not orders["revenue_available"]:
        story.extend([
            Spacer(1, 4),
            _paragraph(orders.get("revenue_unavailable_reason", "Verified revenue data is unavailable."), subtitle_style),
        ])

    story.append(_paragraph("Order status counts", section_style))
    story.append(_section_table(
        [["Status", "Orders"]] + [[key.replace("_", " ").title(), str(value)]
                                   for key, value in orders["status_counts"].items()],
        [105 * mm, 69 * mm],
        body_style,
    ))
    story.append(_paragraph("Recorded payment statuses", section_style))
    story.append(_section_table(
        [["Payment status", "Orders"]] + [[key.replace("_", " ").title(), str(value)]
                                            for key, value in orders["payment_status_counts"].items()],
        [105 * mm, 69 * mm],
        body_style,
    ))

    story.append(_paragraph("Reservations", section_style))
    reservation_rows = [
        ["Metric", "Count / value"],
        ["Scheduled reservations", str(reservations["scheduled_count"])],
        ["Created on business date", str(reservations["created_on_business_date_count"])],
        ["Reservation add-on fees", "Unavailable" if not reservations["addon_fees_available"] else str(reservations["addon_fees_total"])],
    ]
    story.append(_section_table(reservation_rows, [105 * mm, 69 * mm], body_style))
    if not reservations["addon_fees_available"]:
        story.extend([
            Spacer(1, 4),
            _paragraph(reservations.get("addon_fees_unavailable_reason", "Historical fee data is unavailable."), subtitle_style),
        ])

    story.append(_paragraph("Reservation status counts", section_style))
    story.append(_section_table(
        [["Status", "Reservations"]] + [[key.replace("_", " ").title(), str(value)]
                                          for key, value in reservations["status_counts"].items()],
        [105 * mm, 69 * mm],
        body_style,
    ))

    menu_rows = [["Popular menu items", "Quantity"]]
    menu_rows.extend([
        [item.get("name_at_finalization", "Unnamed item"), str(item.get("quantity_ordered", 0))]
        for item in data.get("popular_menu_items", [])
    ] or [["No menu item quantities recorded", "—"]])
    story.append(_paragraph("Popular menu items", section_style))
    story.append(_section_table(menu_rows, [140 * mm, 34 * mm], body_style))

    addon_rows = [["Popular reservation add-ons", "Quantity"]]
    addon_rows.extend([
        [addon.get("name_at_finalization", "Unnamed add-on"), str(addon.get("quantity_selected", 0))]
        for addon in data.get("popular_addons", [])
    ] or [["No confirmed reservation add-ons recorded", "—"]])
    story.append(_paragraph("Popular reservation add-ons", section_style))
    story.append(_section_table(addon_rows, [140 * mm, 34 * mm], body_style))

    def draw_footer(canvas, _document) -> None:
        canvas.saveState()
        canvas.setStrokeColor(_RULE)
        canvas.line(18 * mm, 14 * mm, A4[0] - 18 * mm, 14 * mm)
        canvas.setFillColor(_MUTED)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(18 * mm, 9 * mm, f"Teashore - Historical report - {snapshot.business_date.isoformat()}")
        canvas.drawRightString(A4[0] - 18 * mm, 9 * mm, f"Page {_document.page}")
        canvas.restoreState()

    document.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    return buffer.getvalue()