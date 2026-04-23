"""
Supabase Storage helpers — persists generated resume artifacts (.pdf, .tex)
so they survive Railway redeploys (Railway's filesystem is ephemeral).

Buckets (public, created via web/db/schema.sql):
  - resume-pdfs   →  <user_id>/<folder>.pdf
  - resume-tex    →  <user_id>/<folder>.tex

Uses the SERVICE_ROLE_KEY so uploads bypass RLS. The keys must be set as
Railway env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
If either is missing, the helpers no-op and return None — the app keeps
working off the local filesystem (legacy behavior).
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger("resume_gui.storage")

PDF_BUCKET = "resume-pdfs"
TEX_BUCKET = "resume-tex"

_client = None
_init_failed = False


def _get_client():
    """Lazy singleton — only imports/creates the client when first used."""
    global _client, _init_failed
    if _client is not None or _init_failed:
        return _client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        logger.info("Supabase Storage disabled (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY unset)")
        _init_failed = True
        return None

    try:
        from supabase import create_client  # type: ignore
        _client = create_client(url, key)
        logger.info("Supabase Storage client initialized")
        return _client
    except Exception as exc:
        logger.warning(f"Supabase Storage init failed: {exc}")
        _init_failed = True
        return None


def _safe_path(user_id: str, folder: str, ext: str) -> str:
    # Prevent path traversal — folder names are timestamped slugs but be defensive.
    safe_user   = "".join(c for c in user_id if c.isalnum() or c in "-_")
    safe_folder = "".join(c for c in folder  if c.isalnum() or c in "-_.")
    return f"{safe_user}/{safe_folder}.{ext}"


def _upload(bucket: str, path: str, data: bytes, content_type: str) -> Optional[str]:
    client = _get_client()
    if client is None:
        return None
    try:
        client.storage.from_(bucket).upload(
            path,
            data,
            file_options={
                "content-type": content_type,
                "upsert": "true",  # supabase-py expects strings here
                "cache-control": "3600",
            },
        )
        public = client.storage.from_(bucket).get_public_url(path)
        # supabase-py sometimes appends a trailing "?" — strip it.
        return public.rstrip("?")
    except Exception as exc:
        logger.warning(f"Storage upload failed [{bucket}/{path}]: {exc}")
        return None


def upload_pdf(user_id: str, folder: str, pdf_path: str) -> Optional[str]:
    """Upload a generated PDF to the resume-pdfs bucket. Returns public URL or None."""
    if not user_id or not pdf_path or not os.path.isfile(pdf_path):
        return None
    try:
        data = Path(pdf_path).read_bytes()
    except Exception as exc:
        logger.warning(f"Read PDF failed [{pdf_path}]: {exc}")
        return None
    url = _upload(PDF_BUCKET, _safe_path(user_id, folder, "pdf"), data, "application/pdf")
    if url:
        logger.info(f"PDF uploaded  |  {len(data)} bytes  |  {url}")
    return url


def upload_tex(user_id: str, folder: str, tex_path: str) -> Optional[str]:
    """Upload a generated .tex source to the resume-tex bucket. Returns public URL or None."""
    if not user_id or not tex_path or not os.path.isfile(tex_path):
        return None
    try:
        data = Path(tex_path).read_bytes()
    except Exception as exc:
        logger.warning(f"Read tex failed [{tex_path}]: {exc}")
        return None
    url = _upload(TEX_BUCKET, _safe_path(user_id, folder, "tex"), data, "application/x-tex")
    if url:
        logger.info(f"TEX uploaded  |  {len(data)} bytes  |  {url}")
    return url


def download_tex(user_id: str, folder: str) -> Optional[str]:
    """Download a previously-uploaded .tex file's text content. Returns None on failure."""
    client = _get_client()
    if client is None or not user_id:
        return None
    try:
        path = _safe_path(user_id, folder, "tex")
        data: bytes = client.storage.from_(TEX_BUCKET).download(path)
        return data.decode("utf-8", errors="replace")
    except Exception as exc:
        logger.warning(f"Storage download failed [{TEX_BUCKET}/{user_id}/{folder}]: {exc}")
        return None
