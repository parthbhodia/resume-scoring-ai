"""Advisor dashboard routes."""
from __future__ import annotations

from resume_gui.routes._shared import *  # noqa: F403

async def api_advisor_access(request: Request):
    """GET /api/advisor-access — lightweight yes/no check for Advisor nav visibility."""
    scope, scope_error = _advisor_scope_for_request(request)
    if scope_error is not None:
        status = getattr(scope_error, "status_code", 500)
        if status == 401:
            return JSONResponse({"allowed": False, "reason": "sign_in_required"})
        if status == 403:
            return JSONResponse({"allowed": False, "reason": "not_authorized"})
        return scope_error

    return JSONResponse({
        "allowed": True,
        "institutions": (scope or {}).get("institutions") or [],
    })


async def api_sync_institution_student(request: Request):
    """POST /api/sync-institution-student — ensure authenticated user is mapped to institution_students by email domain."""
    user_id, user_email = _authenticated_supabase_user(request)
    if not user_id or not user_email:
        return JSONResponse({"error": "authentication required"}, status_code=401)

    normalized_email = str(user_email or "").strip().lower()
    domain = normalized_email.rsplit("@", 1)[1] if "@" in normalized_email else ""
    if not domain:
        return JSONResponse({"mapped": False, "reason": "missing_email_domain", "institutions": []})

    institutions_table = _supabase_table("institutions")
    students_table = _supabase_table("institution_students")
    if institutions_table is None or students_table is None:
        return JSONResponse({"error": "advisor access schema unavailable"}, status_code=503)

    try:
        inst_resp = (
            institutions_table
            .select("id,slug,name,email_domain")
            .eq("email_domain", domain)
            .execute()
        )
        institutions = inst_resp.data or []
    except Exception as exc:
        logger.warning("sync institution lookup failed: %s", exc)
        return JSONResponse({"error": "institution lookup failed"}, status_code=500)

    if not institutions:
        return JSONResponse({"mapped": False, "reason": "no_matching_institution", "institutions": []})

    synced = 0
    now_iso = __import__("datetime").datetime.utcnow().isoformat() + "Z"
    for inst in institutions:
        institution_id = inst.get("id")
        if not institution_id:
            continue
        try:
            existing_resp = (
                students_table
                .select("institution_id,student_user_id,source")
                .eq("institution_id", institution_id)
                .eq("student_user_id", user_id)
                .limit(1)
                .execute()
            )
            existing_rows = existing_resp.data or []
            if existing_rows:
                update_payload = {
                    "student_email": normalized_email,
                    "last_seen_at": now_iso,
                }
                existing_source = str((existing_rows[0] or {}).get("source") or "").strip()
                if not existing_source:
                    update_payload["source"] = "manual"
                (
                    students_table
                    .update(update_payload)
                    .eq("institution_id", institution_id)
                    .eq("student_user_id", user_id)
                    .execute()
                )
            else:
                (
                    students_table
                    .insert({
                        "institution_id": institution_id,
                        "student_user_id": user_id,
                        "student_email": normalized_email,
                        "source": "manual",
                        "first_seen_at": now_iso,
                        "last_seen_at": now_iso,
                    })
                    .execute()
                )
            synced += 1
        except Exception as exc:
            logger.warning(
                "sync institution student failed: institution_id=%s user_id=%s err=%s",
                institution_id,
                user_id,
                exc,
            )

    return JSONResponse({
        "mapped": synced > 0,
        "institutions": institutions,
        "synced_count": synced,
        "user_id": user_id,
        "user_email": normalized_email,
    })

def _empty_roster_entry(uid_str: str, email: str | None = None) -> dict:
    return {
        "user_id": uid_str,
        "user_email": email,
        "latest_score": None,
        "first_score": None,
        "latest_at": None,
        "analysis_count": 0,
        "score_delta": None,
    }


def _merge_scoped_students_into_roster(
    seen: dict,
    scope: dict | None,
    student_ids: list[str],
) -> None:
    """Include institution-mapped students even when they have zero analyses."""
    for row in (scope or {}).get("student_rows") or []:
        uid_str = str(row.get("student_user_id") or "")
        if not uid_str or uid_str in seen:
            continue
        email = str(row.get("student_email") or "").strip() or None
        seen[uid_str] = _empty_roster_entry(uid_str, email)
    for uid in student_ids:
        uid_str = str(uid)
        if not uid_str or uid_str in seen:
            continue
        seen[uid_str] = _empty_roster_entry(uid_str)


def _finalize_roster_entries(seen: dict) -> list[dict]:
    missing_email_ids = [
        uid for uid, entry in seen.items() if not str(entry.get("user_email") or "").strip()
    ]
    if missing_email_ids:
        email_map = _email_by_user_id(missing_email_ids)
        for uid_str, entry in seen.items():
            if not str(entry.get("user_email") or "").strip():
                entry["user_email"] = email_map.get(uid_str)
    for entry in seen.values():
        first = entry.get("first_score")
        latest = entry.get("latest_score")
        if isinstance(first, (int, float)) and isinstance(latest, (int, float)):
            entry["score_delta"] = latest - first
        else:
            entry["score_delta"] = None
    return sorted(
        seen.values(),
        key=lambda x: (
            x.get("latest_score") is None,
            -(x.get("latest_score") or 0),
            str(x.get("user_email") or "").lower(),
        ),
    )


async def api_cohort_stats(request: Request):
    """GET /api/cohort-stats — aggregate analysis stats across all students.

    Verifies the Supabase session and scopes rows to the advisor's institutions.
    Returns cohort-level score distributions, weakest dimensions, and
    most common issue types — suitable for career center dashboards.
    """
    scope, scope_error = _advisor_scope_for_request(request)
    if scope_error is not None:
        return scope_error

    dim_keys = ["readability", "atsCompatibility", "jobMatch", "achievementQuality",
                "quantification", "sectionStructure", "languageQuality", "technicalBranding"]
    empty_dim_avgs = {dk: None for dk in dim_keys}

    student_ids = (scope or {}).get("student_ids") or []
    if not student_ids:
        return JSONResponse({
            "student_count": 0,
            "analysis_count": 0,
            "tailored_resume_count": 0,
            "avg_overall": None,
            "score_tiers": {"low": 0, "mid": 0, "good": 0, "strong": 0},
            "dimension_avgs": empty_dim_avgs,
            "weakest_dims": [],
            "top_issues": [],
            "student_roster": [],
            "institutions": (scope or {}).get("institutions") or [],
            "global_admin": bool((scope or {}).get("global_admin")),
            "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        })

    table = _supabase_table("resume_analyses")
    resumes_table = _supabase_table("resumes")
    if table is None:
        return JSONResponse({"error": "storage unavailable"}, status_code=503)

    try:
        resp = (
            table
            .select("user_id,user_email,score,result,created_at")
            .in_("user_id", student_ids)
            .order("created_at", desc=True)
            .limit(2000)
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:
        logger.warning("cohort_stats query failed: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=500)

    if not rows:
        seen: dict = {}
        _merge_scoped_students_into_roster(seen, scope, student_ids)
        student_roster = _finalize_roster_entries(seen)
        return JSONResponse({
            "student_count": len(seen),
            "analysis_count": 0,
            "tailored_resume_count": 0,
            "avg_overall": None,
            "score_tiers": {"low": 0, "mid": 0, "good": 0, "strong": 0},
            "dimension_avgs": empty_dim_avgs,
            "weakest_dims": [],
            "top_issues": [],
            "student_roster": student_roster,
            "institutions": (scope or {}).get("institutions") or [],
            "global_admin": bool((scope or {}).get("global_admin")),
            "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        })

    from collections import defaultdict

    def _avg(vals):
        clean = [v for v in vals if isinstance(v, (int, float))]
        return round(sum(clean) / len(clean), 1) if clean else None

    overall_scores = [r.get("score") for r in rows if r.get("score") is not None]
    dim_avgs = {}
    for dk in dim_keys:
        vals = [(r.get("result") or {}).get("categoryScores", {}).get(dk) for r in rows]
        dim_avgs[dk] = _avg(vals)

    # --- score tier distribution ---
    tiers = {"low": 0, "mid": 0, "good": 0, "strong": 0}
    for s in overall_scores:
        if s < 50:       tiers["low"]    += 1
        elif s < 70:     tiers["mid"]    += 1
        elif s < 85:     tiers["good"]   += 1
        else:            tiers["strong"] += 1

    # --- most common issues ---
    issue_students: dict[str, set[str]] = defaultdict(set)
    for r in rows:
        uid = str(r.get("user_id") or "")
        if not uid:
            continue
        for issue in ((r.get("result") or {}).get("topIssues") or []):
            title = (issue.get("title") or issue.get("issue")) if isinstance(issue, dict) else str(issue)
            if title:
                issue_students[title.strip()].add(uid)
    top_issues = [
        {"issue": title, "count": len(student_set)}
        for title, student_set in sorted(
            issue_students.items(),
            key=lambda kv: len(kv[1]),
            reverse=True,
        )[:10]
    ]

    # --- per-student latest scores (advisor roster) ---
    seen: dict = {}
    for r in rows:
        uid = r.get("user_id")
        if not uid:
            continue
        uid_str = str(uid)
        if uid_str not in seen:
            seen[uid_str] = {
                "user_id":        uid_str,
                "user_email":     None,
                "latest_score":   r.get("score"),
                "first_score":    r.get("score"),
                "latest_at":      r.get("created_at"),
                "analysis_count": 0,
            }
        entry = seen[uid_str]
        entry["analysis_count"] += 1
        row_email = str(r.get("user_email") or "").strip()
        if row_email and not entry.get("user_email"):
            entry["user_email"] = row_email
        # Rows are newest-first; later rows for same user are older runs.
        if r.get("score") is not None:
            entry["first_score"] = r.get("score")

    _merge_scoped_students_into_roster(seen, scope, student_ids)
    student_roster = _finalize_roster_entries(seen)

    weakest_dims = sorted(
        [(dk, dim_avgs[dk]) for dk in dim_keys if dim_avgs[dk] is not None],
        key=lambda x: x[1]
    )

    tailored_resume_count = 0
    if resumes_table is not None:
        try:
            rr = (
                resumes_table
                .select("user_id")
                .in_("user_id", student_ids)
                .limit(5000)
                .execute()
            )
            tailored_resume_count = len(rr.data or [])
        except Exception as exc:
            logger.warning("cohort_stats tailored resumes query failed: %s", exc)

    return JSONResponse({
        "student_count":   len(seen),
        "analysis_count":  len(rows),
        "tailored_resume_count": tailored_resume_count,
        "avg_overall":     _avg(overall_scores),
        "score_tiers":     tiers,
        "dimension_avgs":  dim_avgs,
        "weakest_dims":    [{"dimension": d, "avg": v} for d, v in weakest_dims[:3]],
        "top_issues":      top_issues,
        "student_roster":  student_roster,
        "institutions":    (scope or {}).get("institutions") or [],
        "global_admin":    bool((scope or {}).get("global_admin")),
        "generated_at":    __import__("datetime").datetime.utcnow().isoformat() + "Z",
    })

async def api_student_detail(request: Request):
    """GET /api/student-detail?student_id=<uuid> — full analysis history + resume list for one student.

    Advisor-only: requires a Supabase session with access to the student's institution.
    """
    scope, scope_error = _advisor_scope_for_request(request)
    if scope_error is not None:
        return scope_error

    student_id = (request.query_params.get("student_id") or "").strip()
    if not student_id:
        return JSONResponse({"error": "student_id required"}, status_code=400)
    if student_id not in set((scope or {}).get("student_ids") or []):
        return JSONResponse({"error": "student outside advisor scope"}, status_code=403)

    analyses_table = _supabase_table("resume_analyses")
    resumes_table  = _supabase_table("resumes")
    if analyses_table is None:
        return JSONResponse({"error": "storage unavailable"}, status_code=503)

    try:
        a_resp = (
            analyses_table
            .select("id,user_email,label,score,result,created_at,source_pdf_url,source_filename")
            .eq("user_id", student_id)
            .order("created_at", desc=False)
            .limit(100)
            .execute()
        )
        analyses = a_resp.data or []
    except Exception as exc:
        logger.warning("student_detail analyses query failed: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=500)

    resumes: list[dict] = []
    if resumes_table is not None:
        try:
            r_resp = (
                resumes_table
                .select("folder,company,role,score,pdf_url,created_at")
                .eq("user_id", student_id)
                .order("created_at", desc=True)
                .limit(50)
                .execute()
            )
            resumes = r_resp.data or []
        except Exception as exc:
            logger.warning("student_detail resumes query failed: %s", exc)

    dim_keys = ["readability", "atsCompatibility", "jobMatch", "achievementQuality",
                "quantification", "sectionStructure", "languageQuality", "technicalBranding"]

    # Build score history and extract latest analysis details
    score_history = [
        {"date": r.get("created_at"), "score": r.get("score"), "label": r.get("label")}
        for r in analyses
    ]
    category_history = [
        {
            "date": r.get("created_at"),
            "scores": {
                dk: ((r.get("result") or {}).get("categoryScores") or {}).get(dk)
                for dk in dim_keys
            },
        }
        for r in analyses
    ]
    latest = analyses[-1] if analyses else None
    latest_result = (latest or {}).get("result") or {}

    # Compute per-student averages across all analyses

    def _avg(vals):
        clean = [v for v in vals if isinstance(v, (int, float))]
        return round(sum(clean) / len(clean), 1) if clean else None

    dim_avgs = {}
    for dk in dim_keys:
        vals = [(r.get("result") or {}).get("categoryScores", {}).get(dk) for r in analyses]
        dim_avgs[dk] = _avg(vals)

    # Issue frequency across all this student's analyses
    from collections import Counter as _Counter
    issue_counter: _Counter = _Counter()
    for r in analyses:
        for issue in ((r.get("result") or {}).get("topIssues") or []):
            title = (issue.get("title") or issue.get("issue")) if isinstance(issue, dict) else str(issue)
            if title:
                issue_counter[title.strip()] += 1
    top_issues = [{"issue": k, "count": v} for k, v in issue_counter.most_common(8)]

    first_score  = analyses[0].get("score")  if analyses else None
    latest_score = analyses[-1].get("score") if analyses else None
    delta = (latest_score - first_score) if (first_score is not None and latest_score is not None) else None

    resolved_email = None
    latest_source_pdf_url = None
    latest_source_filename = None
    if analyses:
        for row in analyses:
            em = str(row.get("user_email") or "").strip()
            if em:
                resolved_email = em
                break
    if not resolved_email:
        resolved_email = _email_by_user_id([student_id]).get(student_id)

    latest_row = analyses[-1] if analyses else None
    # Prefer the most recent analysis that has an uploaded source PDF.
    for row in reversed(analyses):
        pdf_url = str(row.get("source_pdf_url") or "").strip()
        if pdf_url:
            latest_source_pdf_url = pdf_url
            latest_source_filename = str(row.get("source_filename") or "").strip() or None
            break
    if latest_row and not latest_source_pdf_url:
        latest_source_pdf_url = str(latest_row.get("source_pdf_url") or "").strip() or None
        latest_source_filename = str(latest_row.get("source_filename") or "").strip() or None

    return JSONResponse({
        "student_id":     student_id,
        "user_email":     resolved_email,
        "analysis_count": len(analyses),
        "first_score":    first_score,
        "latest_score":   latest_score,
        "score_delta":    delta,
        "score_history":  score_history,
        "category_history": category_history,
        "dim_avgs":       dim_avgs,
        "top_issues":     top_issues,
        "latest_strengths":     latest_result.get("topStrengths") or [],
        "latest_category_scores": latest_result.get("categoryScores") or {},
        "resumes":        resumes,
        "latest_resume_text":  (latest_result.get("extractedText") or "")[:4000],
        "latest_source_pdf_url": latest_source_pdf_url,
        "latest_source_filename": latest_source_filename,
    })
