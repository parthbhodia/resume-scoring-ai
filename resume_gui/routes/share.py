"""Public share link routes."""
from __future__ import annotations

from resume_gui.routes._shared import *  # noqa: F403

async def api_share_create(request: Request):
    """POST /api/share/{folder} — mint a shortid for `folder`. Idempotent if
    the same user already created one — returns the existing one.

    Body: {"user_id": "...", "pdf_url": "..."}
    """
    folder = request.path_params["folder"]
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    try:
        body = await request.json()
    except Exception:
        body = {}
    user_id = (body.get("user_id") or "").strip()
    pdf_url = (body.get("pdf_url") or "").strip()
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)

    table = _share_table()
    if table is None:
        return JSONResponse({"error": "share storage not configured"}, status_code=503)

    # Ensure the resume exists and belongs to the caller before minting a public link.
    # Also lets us fall back to the stored PDF URL if the client did not send one.
    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        client = _get_client()
        if client is None:
            return JSONResponse({"error": "share storage not configured"}, status_code=503)
        resume_res = (
            client.table("resumes")
                  .select("id, pdf_url")
                  .eq("user_id", user_id)
                  .eq("folder", folder)
                  .limit(1)
                  .execute()
        )
        if not resume_res.data:
            return JSONResponse(
                {
                    "error": "Résumé not in your library yet — wait a moment and tap Share again, "
                    "or sign in and generate so we can save the row Supabase needs for links.",
                },
                status_code=404,
            )
        pdf_url = pdf_url or (resume_res.data[0].get("pdf_url") or "")
    except Exception as exc:
        logger.exception("share resume ownership lookup failed")
        return JSONResponse({"error": f"share lookup failed: {exc}"}, status_code=500)

    # Reuse existing shortid if one already exists for this user+folder.
    try:
        existing = (
            table.select("shortid, pdf_url, views, revoked")
                 .eq("user_id", user_id).eq("folder", folder)
                 .eq("revoked", False)
                 .limit(1).execute()
        )
        if existing.data:
            row = existing.data[0]
            return JSONResponse({
                "shortid": row["shortid"], "pdf_url": row.get("pdf_url"),
                "views":   row.get("views", 0), "reused": True,
            })
    except Exception as exc:
        logger.warning(f"share lookup failed: {exc}")

    # Mint a new one — retry on the (vanishingly unlikely) collision.
    for _ in range(5):
        shortid = _gen_shortid()
        try:
            table.insert({
                "shortid": shortid, "user_id": user_id,
                "folder":  folder,  "pdf_url": pdf_url or None,
            }).execute()
            return JSONResponse({"shortid": shortid, "pdf_url": pdf_url, "reused": False})
        except Exception as exc:
            msg = str(exc)
            logger.warning(f"share insert failed: {msg}")
            # Only retry actual shortid collisions; other DB errors need to be
            # surfaced so the UI/operator sees the real Supabase problem.
            if "duplicate key" in msg.lower() or "unique" in msg.lower():
                continue
            return JSONResponse({"error": f"share insert failed: {msg}"}, status_code=500)
    return JSONResponse({"error": "could not mint unique shortid after retries"}, status_code=500)

async def api_share_resolve(request: Request):
    """GET /api/share/{shortid} — resolve a share shortid or a resume `public_slug` to folder + pdf_url.
    Share rows increment the view counter; slug-based resolves do not.

    Public endpoint — used by the recipient page (no auth).
    """
    raw = (request.path_params.get("shortid") or "").strip().lower()
    if not raw:
        return JSONResponse({"error": "invalid id"}, status_code=400)

    table = _share_table()
    if table is None:
        return JSONResponse({"error": "share storage not configured"}, status_code=503)

    # ── 1) Legacy minted shortids (6–16 lowercase alnum) in share_links ─────
    if re.match(r"^[a-z0-9]{6,16}$", raw):
        try:
            rows = table.select("shortid, folder, pdf_url, views, revoked, created_at") \
                        .eq("shortid", raw).limit(1).execute()
        except Exception as exc:
            logger.exception("share resolve query failed")
            return JSONResponse({"error": str(exc)}, status_code=500)
        if rows.data:
            row = rows.data[0]
            if row.get("revoked"):
                return JSONResponse({"error": "link revoked"}, status_code=410)
            try:
                table.update({"views": (row.get("views") or 0) + 1}).eq("shortid", raw).execute()
            except Exception as exc:
                logger.warning(f"share view-counter update failed: {exc}")
            return JSONResponse({
                "shortid":    row["shortid"],
                "folder":     row["folder"],
                "pdf_url":    row.get("pdf_url"),
                "views":      (row.get("views") or 0) + 1,
                "created_at": row.get("created_at"),
            })

    # ── 2) Custom per-resume slug (resumes.public_slug, service-role read) ───
    if not _share_token_slug_shape(raw):
        return JSONResponse({"error": "invalid id"}, status_code=400)

    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        client = _get_client()
        if client is None:
            return JSONResponse({"error": "share storage not configured"}, status_code=503)
        resume_res = (
            client.table("resumes")
                  .select("folder, pdf_url, public_slug")
                  .eq("public_slug", raw)
                  .limit(1)
                  .execute()
        )
        if not resume_res.data:
            return JSONResponse({"error": "not found"}, status_code=404)
        r0 = resume_res.data[0]
        pdf_url = (r0.get("pdf_url") or "").strip()
        if not pdf_url:
            return JSONResponse({"error": "not found"}, status_code=404)
        return JSONResponse({
            "shortid":    raw,
            "folder":     r0.get("folder"),
            "pdf_url":    pdf_url,
            "views":      0,
            "created_at": None,
        })
    except Exception as exc:
        logger.exception("resume slug resolve failed")
        return JSONResponse({"error": str(exc)}, status_code=500)

async def api_share_revoke(request: Request):
    """DELETE /api/share/{shortid} — owner-only revoke. Body: {"user_id": "..."}.
    We require user_id match because this is what the frontend has after login.
    Service-role on the backend would let us bypass RLS, but we still scope by
    user_id to prevent cross-user revocation by a logged-in attacker."""
    shortid = request.path_params["shortid"]
    if not re.match(r"^[a-z0-9]{6,16}$", shortid or ""):
        return JSONResponse({"error": "invalid shortid"}, status_code=400)
    try:
        body = await request.json()
    except Exception:
        body = {}
    user_id = (body.get("user_id") or "").strip()
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)

    table = _share_table()
    if table is None:
        return JSONResponse({"error": "share storage not configured"}, status_code=503)
    try:
        table.update({"revoked": True}).eq("shortid", shortid).eq("user_id", user_id).execute()
    except Exception as exc:
        logger.exception("share revoke failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    return JSONResponse({"ok": True})


