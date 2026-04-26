"""
Supabase Storage helpers — persists generated resume artifacts (.pdf, .tex)
so they survive Railway redeploys (Railway's filesystem is ephemeral).

Buckets (public, created via web/db/schema.sql):
  - resume-pdfs   →  <user_id>/<folder>.pdf
  - resume-tex    →  <user_id>/<folder>.tex

Uses the SERVICE_ROLE_KEY so uploads bypass RLS. The keys must be set as
Railway env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
If either is missing, the helpers fall back to local filesystem.

Local fallback strategy:
  - PDFs: <LIBRARY_ROOT>/<user_id>/<folder>.pdf
  - Tex:  <LIBRARY_ROOT>/<user_id>/<folder>.tex
  - Parsed JSON: <LIBRARY_ROOT>/<user_id>/<folder>.json
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger("resume_gui.storage")

PDF_BUCKET = "resume-pdfs"
TEX_BUCKET = "resume-tex"
JSON_BUCKET = "resume-json"

_client = None
_init_failed = False

# Local fallback root — set from env or default to project's resumes/ folder
LIBRARY_ROOT = Path(os.environ.get("LIBRARY_ROOT", Path(__file__).parent.parent.parent / "resumes"))


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


def storage_status() -> dict:
    """Return whether Supabase Storage is configured for durable uploads."""
    url_set = bool(os.environ.get("SUPABASE_URL"))
    key_set = bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
    if not url_set or not key_set:
        return {
            "configured": False,
            "reason": "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set",
        }
    client = _get_client()
    return {
        "configured": client is not None,
        "reason": None if client is not None else "Supabase Storage client failed to initialize",
    }


def _safe_path(user_id: str, folder: str, ext: str) -> str:
    # Prevent path traversal — folder names are timestamped slugs but be defensive.
    safe_user   = "".join(c for c in user_id if c.isalnum() or c in "-_")
    safe_folder = "".join(c for c in folder  if c.isalnum() or c in "-_.")
    return f"{safe_user}/{safe_folder}.{ext}"


def _local_path(user_id: str, folder: str, ext: str) -> Path:
    """Local filesystem fallback path."""
    safe_user = "".join(c for c in user_id if c.isalnum() or c in "-_")
    folder_path = LIBRARY_ROOT / safe_user
    folder_path.mkdir(parents=True, exist_ok=True)
    return folder_path / f"{folder}.{ext}"


def _upload(bucket: str, path: str, data: bytes, content_type: str) -> Optional[str]:
    client = _get_client()
    if client is None:
        # Fallback: write to local filesystem
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


def _write_local(user_id: str, folder: str, ext: str, data: bytes | str) -> Optional[Path]:
    """Write to local filesystem as fallback. Returns path on success."""
    try:
        path = _local_path(user_id, folder, ext)
        path.write_bytes(data) if isinstance(data, bytes) else path.write_text(data)
        logger.info(f"Local write: {path}")
        return path
    except Exception as exc:
        logger.warning(f"Local write failed: {exc}")
        return None


def upload_pdf(user_id: str, folder: str, pdf_path: str) -> Optional[str]:
    """Upload a generated PDF to the resume-pdfs bucket. Returns public URL or None.
    
    Falls back to local filesystem if Supabase is unavailable."""
    if not user_id or not pdf_path or not os.path.isfile(pdf_path):
        return None
    try:
        data = Path(pdf_path).read_bytes()
    except Exception as exc:
        logger.warning(f"Read PDF failed [{pdf_path}]: {exc}")
        return None
    
    # Try Supabase first
    super_path = _safe_path(user_id, folder, "pdf")
    url = _upload(PDF_BUCKET, super_path, data, "application/pdf")
    
    # Fallback to local if Supabase fails, but do not return file:// to the browser.
    # The API can serve local files through /pdf/... while the container lives.
    if url is None:
        _write_local(user_id, folder, "pdf", data)
        return None
    
    if url:
        logger.info(f"PDF uploaded  |  {len(data)} bytes  |  {url}")
    return url


def upload_tex(user_id: str, folder: str, tex_path: str) -> Optional[str]:
    """Upload a generated .tex source. Falls back to local filesystem."""
    if not user_id or not tex_path or not os.path.isfile(tex_path):
        return None
    try:
        data = Path(tex_path).read_bytes()
    except Exception as exc:
        logger.warning(f"Read tex failed [{tex_path}]: {exc}")
        return None
    
    # Try Supabase first
    super_path = _safe_path(user_id, folder, "tex")
    url = _upload(TEX_BUCKET, super_path, data, "application/x-tex")
    
    # Fallback to local if Supabase fails, but do not return file:// to clients.
    if url is None:
        _write_local(user_id, folder, "tex", data)
        return None
    
    if url:
        logger.info(f"TEX uploaded  |  {len(data)} bytes  |  {url}")
    return url


def upload_json(user_id: str, folder: str, json_data: str) -> Optional[str]:
    """Upload parsed JSON for editor backup. Falls back to local filesystem."""
    if not user_id or not json_data:
        return None
    
    data = json_data.encode("utf-8")
    
    # Try Supabase first
    super_path = _safe_path(user_id, folder, "json")
    url = _upload(JSON_BUCKET, super_path, data, "application/json")
    
    # Fallback to local if Supabase fails, but do not return file:// to clients.
    if url is None:
        _write_local(user_id, folder, "json", data)
        return None
    
    return url


def download_tex(user_id: str, folder: str) -> Optional[str]:
    """Download .tex file. Tries Supabase first, falls back to local filesystem."""
    client = _get_client()
    if client and user_id:
        try:
            path = _safe_path(user_id, folder, "tex")
            data: bytes = client.storage.from_(TEX_BUCKET).download(path)
            return data.decode("utf-8", errors="replace")
        except Exception as exc:
            logger.warning(f"Storage download failed [{TEX_BUCKET}/{user_id}/{folder}]: {exc}")
    
    # Fallback: try local
    try:
        local_path = _local_path(user_id, folder, "tex")
        if local_path.exists():
            return local_path.read_text()
    except Exception as exc:
        logger.warning(f"Local tex read failed: {exc}")
    
    return None


def download_pdf(user_id: str, folder: str) -> Optional[bytes]:
    """Download PDF bytes. Tries Supabase first, falls back to local filesystem."""
    client = _get_client()
    if client and user_id:
        try:
            path = _safe_path(user_id, folder, "pdf")
            data: bytes = client.storage.from_(PDF_BUCKET).download(path)
            return data
        except Exception as exc:
            logger.warning(f"Storage download failed [{PDF_BUCKET}/{user_id}/{folder}]: {exc}")
    
    # Fallback: try local
    try:
        local_path = _local_path(user_id, folder, "pdf")
        if local_path.exists():
            return local_path.read_bytes()
    except Exception as exc:
        logger.warning(f"Local PDF read failed: {exc}")
    
    return None


def download_json(user_id: str, folder: str) -> Optional[str]:
    """Download parsed JSON backup. Tries Supabase first, falls back to local."""
    client = _get_client()
    if client and user_id:
        try:
            path = _safe_path(user_id, folder, "json")
            data: bytes = client.storage.from_(JSON_BUCKET).download(path)
            return data.decode("utf-8", errors="replace")
        except Exception as exc:
            logger.warning(f"Storage JSON download failed: {exc}")
    
    # Fallback: try local
    try:
        local_path = _local_path(user_id, folder, "json")
        if local_path.exists():
            return local_path.read_text()
    except Exception as exc:
        logger.warning(f"Local JSON read failed: {exc}")
    
    return None


# ── Version History ───────────────────────────────────────────────────────

def save_version(user_id: str, folder: str, parsed_json: str) -> Optional[dict]:
    """Save a version snapshot. Returns version info or None on failure."""
    client = _get_client()
    if client is None or not user_id or not parsed_json:
        return None
    
    try:
        # Get next version number
        res = client.table("resumes").select("id").eq("user_id", user_id).eq("folder", folder).execute()
        if not res.data:
            return None
        resume_id = res.data[0]["id"]
        
        # Get current max version
        ver_res = client.table("resume_versions").select("version").eq("resume_id", resume_id).order("version", desc=True).limit(1).execute()
        next_version = (ver_res.data[0]["version"] + 1) if ver_res.data else 1
        
        # Insert new version
        client.table("resume_versions").insert({
            "resume_id": resume_id,
            "version": next_version,
            "parsed_json": parsed_json,
        }).execute()
        
        logger.info(f"Version {next_version} saved for {folder}")
        return {"version": next_version, "resume_id": str(resume_id)}
    except Exception as exc:
        logger.warning(f"Save version failed: {exc}")
        return None


def list_versions(user_id: str, folder: str) -> Optional[list]:
    """List all versions for a resume. Returns list of {version, created_at} or None."""
    client = _get_client()
    if client is None or not user_id:
        return None
    
    try:
        # Get resume_id first
        res = client.table("resumes").select("id").eq("user_id", user_id).eq("folder", folder).execute()
        if not res.data:
            return None
        resume_id = res.data[0]["id"]
        
        # Get versions
        ver_res = client.table("resume_versions").select("version, created_at").eq("resume_id", resume_id).order("version", desc=True).execute()
        return ver_res.data
    except Exception as exc:
        logger.warning(f"List versions failed: {exc}")
        return None


def load_version(user_id: str, folder: str, version: int) -> Optional[str]:
    """Load a specific version's parsed JSON. Returns JSON string or None."""
    client = _get_client()
    if client is None or not user_id:
        return None
    
    try:
        # Get resume_id first
        res = client.table("resumes").select("id").eq("user_id", user_id).eq("folder", folder).execute()
        if not res.data:
            return None
        resume_id = res.data[0]["id"]
        
        # Get version
        ver_res = client.table("resume_versions").select("parsed_json").eq("resume_id", resume_id).eq("version", version).limit(1).execute()
        if not ver_res.data:
            return None
        return ver_res.data[0]["parsed_json"]
    except Exception as exc:
        logger.warning(f"Load version failed: {exc}")
        return None
