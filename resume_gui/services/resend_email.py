"""
Resend transactional email helper.

Env vars required:
  RESEND_API_KEY     — API key from resend.com dashboard
  RESEND_FROM_EMAIL  — verified sender address (default: noreply@resunova.io)

Failures are logged and swallowed — transactional emails are best-effort.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_BASE = "https://api.resend.com"


def _api_key() -> Optional[str]:
    return os.environ.get("RESEND_API_KEY", "").strip() or None


def _from_address() -> str:
    return os.environ.get("RESEND_FROM_EMAIL", "Resunova <noreply@resunova.io>")


def send(
    to: str,
    subject: str,
    html: str,
    *,
    text: Optional[str] = None,
) -> bool:
    """
    Send a transactional email via Resend.
    Returns True on success, False on any failure.
    """
    key = _api_key()
    if not key:
        logger.info("Resend not configured — skipping email to %s: %s", to, subject)
        return False
    payload: dict = {
        "from": _from_address(),
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text
    try:
        resp = httpx.post(
            f"{_BASE}/emails",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
            timeout=10,
        )
        if resp.status_code in (200, 201):
            logger.info("Resend: sent '%s' to %s", subject, to)
            return True
        logger.warning("Resend %s → %d %s", to, resp.status_code, resp.text[:200])
        return False
    except Exception as exc:
        logger.warning("Resend failed for %s: %s", to, exc)
        return False


# ── Pre-built transactional templates ────────────────────────────────────────

def send_scan_limit_warning(to: str, scans_used: int, limit: int) -> bool:
    """Notify the user they've used all their daily scans."""
    subject = "You've used all your Resunova scans for today"
    html = f"""
<p>Hi,</p>
<p>You've used <strong>{scans_used} of {limit}</strong> free résumé scans today on
<a href="https://resunova.io">Resunova</a>.</p>
<p>Your limit resets at midnight UTC. Come back tomorrow to keep improving your résumé!</p>
<p style="margin-top:24px;font-size:12px;color:#888;">
  You're receiving this because you enabled scan-limit notifications in your
  <a href="https://resunova.io/?view=profile">Profile → Settings</a>.
  <a href="https://resunova.io/?view=profile">Manage preferences</a>
</p>
"""
    return send(to, subject, html)


def send_welcome(to: str) -> bool:
    """Welcome email for new sign-ups."""
    subject = "Welcome to Resunova 🎉"
    html = """
<p>Hi,</p>
<p>Thanks for joining <strong>Resunova</strong> — your AI-powered résumé coach.</p>
<ul>
  <li><a href="https://resunova.io/?view=analyze">Upload your résumé</a> for a free score</li>
  <li>Get bullet-level feedback and AI rewrites</li>
  <li>Tailor your résumé to any job description in seconds</li>
</ul>
<p>If you have any questions, just reply to this email.</p>
<p>— The Resunova Team</p>
"""
    return send(to, subject, html)
