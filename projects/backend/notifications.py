"""
GenMark — Email notifications via Resend
"""

import logging
import os

import httpx

logger = logging.getLogger(__name__)


async def send_flag_notification(
    creator_email: str,
    creator_name: str,
    phash: str,
    description: str,
    tx_id: str,
) -> None:
    """Send a misuse-report notification to the original content creator."""
    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key or not creator_email:
        logger.info("Email skipped: RESEND_API_KEY or creator email not set")
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": "GenMark <onboarding@resend.dev>",
                    "to": [creator_email],
                    "subject": "Your GenMark content has been flagged for misuse",
                    "html": f"""
                        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
                            <h2 style="color:#1e1b4b;margin-bottom:8px">Misuse Report Filed</h2>
                            <p style="color:#334155">Hi {creator_name},</p>
                            <p style="color:#334155">A misuse report has been filed against
                            your registered content on <strong>GenMark</strong>:</p>
                            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
                                <tr>
                                    <td style="padding:10px 12px;background:#f0f9ff;font-weight:600;width:140px;color:#1e1b4b">Fingerprint</td>
                                    <td style="padding:10px 12px;font-family:monospace;color:#334155">{phash}</td>
                                </tr>
                                <tr>
                                    <td style="padding:10px 12px;background:#f0f9ff;font-weight:600;color:#1e1b4b">Report</td>
                                    <td style="padding:10px 12px;color:#334155">{description}</td>
                                </tr>
                                <tr>
                                    <td style="padding:10px 12px;background:#f0f9ff;font-weight:600;color:#1e1b4b">Transaction</td>
                                    <td style="padding:10px 12px;font-family:monospace;color:#334155">{tx_id[:32]}…</td>
                                </tr>
                            </table>
                            <p style="color:#64748b;font-size:13px">
                                This report is permanently and immutably recorded on the Algorand blockchain.
                                It cannot be altered or deleted by anyone.
                            </p>
                            <p style="color:#64748b;font-size:13px">— The GenMark Team</p>
                        </div>
                    """,
                },
            )
            if resp.status_code >= 400:
                logger.warning(f"Resend API error {resp.status_code}: {resp.text[:200]}")
            else:
                logger.info(f"Flag notification sent to {creator_email}")
    except Exception as e:
        logger.warning(f"Failed to send flag notification: {e}")
