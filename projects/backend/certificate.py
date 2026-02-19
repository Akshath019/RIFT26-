"""
GenMark — Forensic Certificate Generator
==========================================
Generates official-looking PDF forensic certificates for verified content.

The certificate serves as a human-readable summary of on-chain evidence,
suitable for submission to police cyber cells, courts, or legal proceedings.

Contents of each certificate:
  • GenMark logo and header
  • Content origin details (creator, platform, timestamp)
  • On-chain evidence identifiers (App ID, Transaction ID, ASA ID, pHash)
  • QR-style reference block for verifier use
  • Disclaimer about blockchain evidence standards
  • AlgoExplorer links for independent verification
"""

import io
import logging
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Flowable,
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger(__name__)

# Brand colors
BRAND_DARK = colors.HexColor("#1e1b4b")   # Indigo-950
BRAND_MID = colors.HexColor("#4f46e5")    # Indigo-600
BRAND_ACCENT = colors.HexColor("#06b6d4") # Cyan-500
BRAND_GREEN = colors.HexColor("#059669")  # Emerald-600
BRAND_LIGHT = colors.HexColor("#f0f9ff")  # Sky-50
TEXT_DARK = colors.HexColor("#0f172a")    # Slate-900
TEXT_MID = colors.HexColor("#475569")     # Slate-600
BORDER_COLOR = colors.HexColor("#c7d2fe") # Indigo-200


class HorizontalLine(Flowable):
    """A simple horizontal rule flowable."""

    def __init__(self, width, thickness=1, color=BORDER_COLOR):
        super().__init__()
        self.width = width
        self.thickness = thickness
        self.color = color

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 0, self.width, 0)


def generate_certificate(
    tx_id: str,
    creator_name: str,
    platform: str,
    timestamp: str,
    asa_id: str,
    app_id: str,
    phash: str,
    flag_descriptions: list[str] | None = None,
) -> bytes:
    """
    Generate a forensic PDF certificate for a verified content registration.

    Args:
        tx_id             : Algorand transaction ID of the registration
        creator_name      : Name of the content creator
        platform          : Platform used to generate the content
        timestamp         : Human-readable registration timestamp (UTC)
        asa_id            : Soulbound ASA ID (ownership credential)
        app_id            : GenMark smart contract App ID
        phash             : Perceptual hash fingerprint of the content
        flag_descriptions : Optional list of misuse flag descriptions

    Returns:
        Raw PDF bytes ready to stream to the client.
    """
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    page_width = A4[0] - 4 * cm  # usable width after margins

    # ── Custom styles ────────────────────────────────────────────────────────

    title_style = ParagraphStyle(
        "CertTitle",
        parent=styles["Title"],
        fontSize=22,
        textColor=BRAND_DARK,
        spaceAfter=4,
        fontName="Helvetica-Bold",
    )

    subtitle_style = ParagraphStyle(
        "CertSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=BRAND_MID,
        spaceAfter=6,
        fontName="Helvetica",
    )

    section_header_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Normal"],
        fontSize=11,
        textColor=BRAND_DARK,
        spaceBefore=10,
        spaceAfter=4,
        fontName="Helvetica-Bold",
    )

    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=9,
        textColor=TEXT_DARK,
        spaceAfter=3,
        fontName="Helvetica",
        leading=14,
    )

    mono_style = ParagraphStyle(
        "Mono",
        parent=styles["Normal"],
        fontSize=8,
        textColor=TEXT_DARK,
        fontName="Courier",
        wordWrap="CJK",
    )

    disclaimer_style = ParagraphStyle(
        "Disclaimer",
        parent=styles["Normal"],
        fontSize=7.5,
        textColor=TEXT_MID,
        fontName="Helvetica-Oblique",
        leading=11,
    )

    # ── Build content ────────────────────────────────────────────────────────

    story = []
    now_utc = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # ── Header ───────────────────────────────────────────────────────────────

    story.append(Paragraph("GenMark", title_style))
    story.append(Paragraph("AI Content Origin — Forensic Certificate", subtitle_style))
    story.append(HorizontalLine(page_width, thickness=2, color=BRAND_MID))
    story.append(Spacer(1, 6 * mm))

    # ── Certificate ID block ─────────────────────────────────────────────────

    cert_table = Table(
        [
            [
                Paragraph("<b>Certificate Generated</b>", body_style),
                Paragraph(now_utc, mono_style),
            ],
            [
                Paragraph("<b>Document Type</b>", body_style),
                Paragraph("Algorand Blockchain Evidence Certificate", body_style),
            ],
        ],
        colWidths=[5 * cm, page_width - 5 * cm],
    )
    cert_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), BRAND_LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(cert_table)
    story.append(Spacer(1, 6 * mm))

    # ── Section 1: Content Origin ────────────────────────────────────────────

    story.append(Paragraph("1. Content Origin Details", section_header_style))
    story.append(HorizontalLine(page_width, thickness=0.5))
    story.append(Spacer(1, 3 * mm))

    origin_data = [
        ["Field", "Value"],
        ["Creator Name", creator_name],
        ["Platform", platform],
        ["Registration Time", timestamp],
        ["Perceptual Hash (pHash)", phash],
    ]

    origin_table = Table(
        origin_data,
        colWidths=[4 * cm, page_width - 4 * cm],
    )
    origin_table.setStyle(
        TableStyle(
            [
                # Header row
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_DARK),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                # Data rows
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 1), (-1, -1), 9),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(origin_table)
    story.append(Spacer(1, 6 * mm))

    # ── Section 2: On-Chain Evidence ─────────────────────────────────────────

    story.append(Paragraph("2. Algorand Blockchain Evidence", section_header_style))
    story.append(HorizontalLine(page_width, thickness=0.5))
    story.append(Spacer(1, 3 * mm))

    story.append(
        Paragraph(
            "The following identifiers are permanently recorded on the Algorand TestNet "
            "blockchain and can be independently verified by any third party using "
            "AlgoExplorer or the Algorand API:",
            body_style,
        )
    )
    story.append(Spacer(1, 3 * mm))

    chain_data = [
        ["Identifier", "Value"],
        ["GenMark App ID", str(app_id)],
        ["Registration Transaction ID", tx_id],
        ["Soulbound ASA (Ownership Credential)", str(asa_id)],
    ]

    chain_table = Table(
        chain_data,
        colWidths=[5.5 * cm, page_width - 5.5 * cm],
    )
    chain_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_DARK),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("FONTNAME", (0, 1), (-1, -1), "Courier"),
                ("FONTSIZE", (0, 1), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("WORDWRAP", (1, 1), (1, -1), "CJK"),
            ]
        )
    )
    story.append(chain_table)
    story.append(Spacer(1, 3 * mm))

    story.append(
        Paragraph(
            f"<b>Verify independently:</b> "
            f"https://testnet.algoexplorer.io/tx/{tx_id}",
            body_style,
        )
    )
    story.append(Spacer(1, 6 * mm))

    # ── Section 3: Misuse Reports ────────────────────────────────────────────

    if flag_descriptions:
        story.append(Paragraph("3. Filed Misuse Reports", section_header_style))
        story.append(HorizontalLine(page_width, thickness=0.5))
        story.append(Spacer(1, 3 * mm))

        story.append(
            Paragraph(
                f"A total of <b>{len(flag_descriptions)}</b> misuse report(s) have been "
                "filed against this content and are permanently recorded on-chain:",
                body_style,
            )
        )
        story.append(Spacer(1, 3 * mm))

        flag_data = [["#", "Misuse Report Description"]]
        for i, desc in enumerate(flag_descriptions):
            flag_data.append([str(i + 1), desc])

        flag_table = Table(
            flag_data,
            colWidths=[1 * cm, page_width - 1 * cm],
        )
        flag_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dc2626")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 1), (-1, -1), 9),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fef2f2")]),
                    ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                    ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER_COLOR),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(flag_table)
        story.append(Spacer(1, 6 * mm))

    # ── Legal Disclaimer ─────────────────────────────────────────────────────

    story.append(HorizontalLine(page_width, thickness=1, color=BRAND_MID))
    story.append(Spacer(1, 3 * mm))

    story.append(
        Paragraph(
            "<b>Legal Notice & Evidence Standard</b>",
            ParagraphStyle(
                "LegalHeader",
                parent=body_style,
                fontName="Helvetica-Bold",
                textColor=BRAND_DARK,
            ),
        )
    )
    story.append(Spacer(1, 2 * mm))
    story.append(
        Paragraph(
            "This certificate is generated from immutable records stored on the Algorand "
            "public blockchain. The registration transaction and all associated data are "
            "permanently archived and cannot be altered, deleted, or backdated by any party. "
            "The Algorand blockchain operates on Byzantine fault-tolerant consensus with "
            "cryptographic finality, providing a verifiable chain of custody for digital evidence. "
            "The transaction ID listed above constitutes a unique, time-stamped, cryptographically "
            "signed record suitable for presentation in legal proceedings. "
            "For independent verification, query the Algorand TestNet using the App ID and "
            "Transaction ID provided above via any Algorand explorer or API client.",
            disclaimer_style,
        )
    )

    # ── Footer ───────────────────────────────────────────────────────────────

    story.append(Spacer(1, 4 * mm))
    story.append(HorizontalLine(page_width, thickness=0.5, color=BORDER_COLOR))
    story.append(Spacer(1, 2 * mm))
    story.append(
        Paragraph(
            "GenMark — AI Content Origin & Misuse Detection Platform | https://genmark.app | "
            "Built on Algorand Blockchain",
            disclaimer_style,
        )
    )

    # ── Render PDF ───────────────────────────────────────────────────────────

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    logger.info(f"Generated forensic certificate for tx_id={tx_id} ({len(pdf_bytes)} bytes)")
    return pdf_bytes
