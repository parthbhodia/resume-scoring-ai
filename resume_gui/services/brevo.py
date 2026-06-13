"""
Brevo (formerly Sendinblue) marketing email sync.

Env vars required:
  BREVO_API_KEY          — API key from Brevo dashboard → Settings → API Keys
  BREVO_MARKETING_LIST_ID — integer ID of the "Resunova users" contact list

Used only for the opt-in "Tell me about new features" preference.
All calls are fire-and-forget: failures are logged but never raise to the caller.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_BASE = "https://api.brevo.com/v3"


def _api_key() -> Optional[str]:
    return os.environ.get("BREVO_API_KEY", "").strip() or None


def _list_id() -> Optional[int]:
    raw = os.environ.get("BREVO_MARKETING_LIST_ID", "").strip()
    try:
        return int(raw) if raw else None
    except ValueError:
        return None


def _headers() -> dict:
    return {
        "api-key": _api_key() or "",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def subscribe(email: str) -> bool:
    """Add email to the marketing list. Creates contact if it doesn't exist."""
    key = _api_key()
    list_id = _list_id()
    if not key or not list_id:
        logger.info("Brevo not configured — skipping subscribe for %s", email)
        return False
    try:
        resp = httpx.post(
            f"{_BASE}/contacts",
            headers=_headers(),
            json={"email": email, "listIds": [list_id], "updateEnabled": True},
            timeout=8,
        )
        if resp.status_code in (200, 201, 204):
            logger.info("Brevo: subscribed %s to list %d", email, list_id)
            return True
        logger.warning("Brevo subscribe %s → %d %s", email, resp.status_code, resp.text[:200])
        return False
    except Exception as exc:
        logger.warning("Brevo subscribe failed for %s: %s", email, exc)
        return False


def unsubscribe(email: str) -> bool:
    """Remove email from the marketing list (does not delete the contact)."""
    key = _api_key()
    list_id = _list_id()
    if not key or not list_id:
        logger.info("Brevo not configured — skipping unsubscribe for %s", email)
        return False
    try:
        resp = httpx.put(
            f"{_BASE}/contacts/{httpx.URL(email).raw_path.decode() if False else email}",
            headers=_headers(),
            json={"unlinkListIds": [list_id]},
            timeout=8,
        )
        if resp.status_code in (200, 201, 204):
            logger.info("Brevo: unsubscribed %s from list %d", email, list_id)
            return True
        logger.warning("Brevo unsubscribe %s → %d %s", email, resp.status_code, resp.text[:200])
        return False
    except Exception as exc:
        logger.warning("Brevo unsubscribe failed for %s: %s", email, exc)
        return False


def sync(email: str, *, features: bool) -> None:
    """Subscribe or unsubscribe based on the features preference flag."""
    if features:
        subscribe(email)
    else:
        unsubscribe(email)
