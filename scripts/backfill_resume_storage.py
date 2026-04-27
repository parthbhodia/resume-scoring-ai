"""
backfill_resume_storage.py — diagnose & repair gaps between the `resumes` table,
Supabase Storage (resume-tex / resume-pdfs), and the local LIBRARY_ROOT.

Three-way reconciliation:
  - DB rows (resumes table)               — what the sidebar shows
  - Storage objects (resume-tex bucket)   — what backend reads on edit / diff
  - Local LIBRARY_ROOT folders            — what's still on Parth's disk

For each row, it checks:
  1. Is there a corresponding .tex in Storage under user_id/folder.tex?
  2. If no, is there a local <LIBRARY_ROOT>/<folder>/*.tex we can upload?

Pass --apply to actually upload the missing files. Without it, dry-run only.

Usage (from repo root):
  .venv/Scripts/python.exe scripts/backfill_resume_storage.py --user-id <UUID>
  .venv/Scripts/python.exe scripts/backfill_resume_storage.py --user-id <UUID> --apply

To find your user_id, run with --list-users to see every distinct user_id in the
resumes table along with row counts.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Repo paths
REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT / "linkedin_agent"))
sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv
load_dotenv(REPO_ROOT / "linkedin_agent" / ".env")

LIBRARY_ROOT = Path(os.environ.get("LIBRARY_ROOT", "C:/Users/parth/OneDrive/Documents/resume"))


def _client():
    from resume_gui.storage import _get_client  # type: ignore
    c = _get_client()
    if c is None:
        sys.exit("✗ Supabase client unavailable — check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env")
    return c


def list_users():
    rows = _client().table("resumes").select("user_id, folder").execute().data or []
    counts: dict = {}
    for r in rows:
        uid = r.get("user_id") or "(null)"
        counts[uid] = counts.get(uid, 0) + 1
    print(f"Found {len(rows)} rows across {len(counts)} user_ids:\n")
    for uid, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {uid}   {n} resume(s)")


def reconcile(user_id: str, apply_changes: bool = False):
    client = _client()

    # 1. DB rows for this user
    db_rows = client.table("resumes").select("folder, company, role, created_at") \
                    .eq("user_id", user_id).order("created_at", desc=True).execute().data or []
    db_folders = [r["folder"] for r in db_rows]
    print(f"DB rows for {user_id}: {len(db_folders)}")

    # 2. Storage listing
    try:
        objs = client.storage.from_("resume-tex").list(user_id) or []
    except Exception as exc:
        print(f"  ⚠ Storage list failed: {exc}")
        objs = []
    in_storage = {o["name"][:-4] for o in objs if o.get("name", "").endswith(".tex")}
    print(f"Storage .tex files: {len(in_storage)}")

    # 3. Local folders
    local_folders = set()
    if LIBRARY_ROOT.is_dir():
        local_folders = {p.name for p in LIBRARY_ROOT.iterdir()
                         if p.is_dir() and any(child.suffix == ".tex" for child in p.iterdir())}
    print(f"Local folders with .tex under {LIBRARY_ROOT}: {len(local_folders)}\n")

    # ── Per-row diagnosis
    missing_recoverable = []
    missing_lost        = []
    print(f"{'STATUS':<22}  {'FOLDER':<60}  COMPANY → ROLE")
    print("-" * 130)
    for row in db_rows:
        folder  = row["folder"]
        company = row.get("company", "?")
        role    = row.get("role", "?")
        if folder in in_storage:
            status = "✓ in storage"
        elif folder in local_folders:
            status = "→ recoverable"
            missing_recoverable.append(folder)
        else:
            status = "✗ LOST (no source)"
            missing_lost.append(folder)
        print(f"{status:<22}  {folder:<60}  {company} → {role}")

    print()
    print(f"Summary  |  in-storage={len(db_folders) - len(missing_recoverable) - len(missing_lost)}  "
          f"recoverable={len(missing_recoverable)}  lost={len(missing_lost)}")

    if not missing_recoverable:
        print("\nNothing to backfill from local.")
        return

    if not apply_changes:
        print(f"\nDry run — pass --apply to upload the {len(missing_recoverable)} recoverable file(s).")
        return

    # ── Upload recoverable ones
    from resume_gui.storage import upload_tex, upload_pdf  # type: ignore
    print(f"\nUploading {len(missing_recoverable)} .tex file(s)…")
    fixed = 0
    for folder in missing_recoverable:
        local = LIBRARY_ROOT / folder
        tex_files = list(local.glob("*.tex"))
        if not tex_files:
            print(f"  ✗ {folder}: no .tex inside (skipped)")
            continue
        url = upload_tex(user_id, folder, str(tex_files[0]))
        # Also opportunistically grab the PDF if present.
        pdf_files = list(local.glob("*.pdf"))
        if pdf_files:
            try:
                upload_pdf(user_id, folder, str(pdf_files[0]))
            except Exception as exc:
                print(f"    (pdf upload skipped: {exc})")
        if url:
            print(f"  ✓ {folder}")
            fixed += 1
        else:
            print(f"  ✗ {folder}: upload returned no URL")
    print(f"\nDone — {fixed}/{len(missing_recoverable)} backfilled.")


def main():
    ap = argparse.ArgumentParser(description="Backfill missing resume .tex/.pdf files into Supabase Storage")
    ap.add_argument("--user-id",    help="Supabase user UUID. Use --list-users first if unsure.")
    ap.add_argument("--list-users", action="store_true", help="List all user_ids in the resumes table")
    ap.add_argument("--apply",      action="store_true", help="Actually upload (default = dry run)")
    args = ap.parse_args()

    if args.list_users:
        list_users()
        return
    if not args.user_id:
        ap.error("--user-id required (or pass --list-users)")
    reconcile(args.user_id, apply_changes=args.apply)


if __name__ == "__main__":
    main()
