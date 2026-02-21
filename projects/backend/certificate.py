"""
GenMark — Simple Certificate Generator
"""

import io
import logging
from datetime import datetime, timezone
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
)

logger = logging.getLogger(__name__)

BRAND_DARK = colors.HexColor("#1e1b4b")
BRAND_MID = colors.HexColor("#4f46e5")
BORDER_COLOR = colors.HexColor("#c7d2fe")
BRAND_LIGHT = colors.HexColor("#f0f9ff")
TEXT_DARK = colors.HexColor("#0f172a")
TEXT_MID = colors.HexColor("#64748b")


def generate_certificate(
    tx_id: str,
    creator_name: str,
    platform: str,
    timestamp: str,
    asa_id: str,
    app_id: str,
    phash: str,
    flag_descriptions: Optional[list] = None,
    modified_by: Optional[str] = None,
    original_phash: Optional[str] = None,
    provenance_chain: Optional[list] = None,
) -> bytes:
    """
    Generate a clean, minimal PDF certificate.
    Shows creator name, certification date, and visual fingerprint.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2.5 * cm,
        leftMargin=2.5 * cm,
        topMargin=3 * cm,
        bottomMargin=2.5 * cm,
    )

    styles = getSampleStyleSheet()
    page_width = A4[0] - 5 * cm

    title_style = ParagraphStyle(
        "Title", parent=styles["Title"],
        fontSize=24, textColor=BRAND_DARK,
        fontName="Helvetica-Bold", spaceAfter=4,
    )
    sub_style = ParagraphStyle(
        "Sub", parent=styles["Normal"],
        fontSize=10, textColor=BRAND_MID,
        fontName="Helvetica", spaceAfter=0,
    )
    label_style = ParagraphStyle(
        "Label", parent=styles["Normal"],
        fontSize=9, textColor=TEXT_MID,
        fontName="Helvetica",
    )
    value_style = ParagraphStyle(
        "Value", parent=styles["Normal"],
        fontSize=11, textColor=TEXT_DARK,
        fontName="Helvetica-Bold",
    )
    footer_style = ParagraphStyle(
        "Footer", parent=styles["Normal"],
        fontSize=8, textColor=TEXT_MID,
        fontName="Helvetica", alignment=1,
    )
    hash_style = ParagraphStyle(
        "Hash", parent=styles["Normal"],
        fontSize=8, textColor=TEXT_MID,
        fontName="Courier", alignment=1,
    )

    story = []
    now_utc = datetime.now(tz=timezone.utc).strftime("%d %B %Y")

    # ── Header ───────────────────────────────────────────────────────────────
    story.append(Paragraph("GenMark", title_style))
    story.append(Paragraph("Content Origin Certificate", sub_style))
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=2, color=BRAND_MID, spaceAfter=8 * mm))

    # ── Main certificate table ────────────────────────────────────────────────
    cert_data = [
        [Paragraph("CREATOR", label_style), Paragraph(creator_name or "—", value_style)],
        [Paragraph("CERTIFIED ON", label_style), Paragraph(timestamp or now_utc, value_style)],
    ]
    if modified_by:
        cert_data.append([Paragraph("MORPHED BY", label_style), Paragraph(modified_by, value_style)])
    if original_phash:
        cert_data.append([Paragraph("ORIGINAL HASH", label_style), Paragraph(original_phash, value_style)])
    cert_table = Table(cert_data, colWidths=[4 * cm, page_width - 4 * cm])
    cert_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.75, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(cert_table)
    story.append(Spacer(1, 10 * mm))

    # ── Provenance Timeline (only when chain has more than 1 step) ────────────
    if provenance_chain and len(provenance_chain) > 1:
        chain_title_style = ParagraphStyle(
            "ChainTitle", parent=styles["Normal"],
            fontSize=10, textColor=BRAND_MID,
            fontName="Helvetica-Bold", spaceAfter=4,
        )
        chain_label_style = ParagraphStyle(
            "ChainLabel", parent=styles["Normal"],
            fontSize=8, textColor=TEXT_MID,
            fontName="Helvetica",
        )
        chain_val_style = ParagraphStyle(
            "ChainVal", parent=styles["Normal"],
            fontSize=9, textColor=TEXT_DARK,
            fontName="Helvetica-Bold",
        )
        chain_sub_style = ParagraphStyle(
            "ChainSub", parent=styles["Normal"],
            fontSize=8, textColor=TEXT_MID,
            fontName="Helvetica",
        )

        chain_items = [Paragraph("Provenance Chain", chain_title_style)]

        for i, step in enumerate(provenance_chain):
            is_last = i == len(provenance_chain) - 1
            is_original = step.get("is_original", False)
            role = "Original Creator" if is_original else "Morphed By"
            morphed_by = step.get("morphed_by", "") or ""
            creator = step.get("creator_name", "Unknown")
            # For morph steps, show who morphed it; for original, show creator_name
            display_name = creator if is_original else (morphed_by or creator)
            ts_raw = step.get("timestamp", "")
            ts_display = ts_raw or "—"

            row_label = f"Step {i + 1} — {role}"

            step_data = [
                [Paragraph(row_label, chain_label_style),
                 Paragraph(display_name, chain_val_style)],
                [Paragraph("", chain_label_style),
                 Paragraph(ts_display, chain_sub_style)],
            ]
            step_table = Table(step_data, colWidths=[4 * cm, page_width - 4 * cm])
            bg = colors.HexColor("#f8faff") if step.get("is_original") else colors.HexColor("#fffaf0")
            step_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]))
            chain_items.append(step_table)
            if not is_last:
                arrow_style = ParagraphStyle(
                    "Arrow", parent=styles["Normal"],
                    fontSize=10, textColor=BRAND_MID,
                    fontName="Helvetica", alignment=0, leftIndent=14,
                )
                chain_items.append(Paragraph("↓", arrow_style))

        story.append(KeepTogether(chain_items))
        story.append(Spacer(1, 8 * mm))

    # ── Verification note ─────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_COLOR, spaceAfter=4 * mm))
    story.append(Paragraph("Verified on the Algorand Blockchain", footer_style))
    story.append(Spacer(1, 2 * mm))
    if phash:
        story.append(Paragraph(f"Visual Fingerprint: {phash}", hash_style))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(f"Certificate generated on {now_utc} · genmark.app", footer_style))

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    logger.info(f"Generated certificate for creator={creator_name} ({len(pdf_bytes)} bytes)")
    return pdf_bytes
