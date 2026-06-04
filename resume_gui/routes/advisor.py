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
        if uid and uid not in seen:
            seen[uid] = {
                "user_id":        uid,
                "user_email":     r.get("user_email"),
                "latest_score":   r.get("score"),
                "latest_at":      r.get("created_at"),
                "analysis_count": sum(1 for x in rows if x.get("user_id") == uid),
            }
    student_roster = sorted(seen.values(), key=lambda x: x.get("latest_score") or 0)

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
            .select("id,user_email,label,score,result,created_at")
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

    # Build score history and extract latest analysis details
    score_history = [
        {"date": r.get("created_at"), "score": r.get("score"), "label": r.get("label")}
        for r in analyses
    ]
    latest = analyses[-1] if analyses else None
    latest_result = (latest or {}).get("result") or {}

    # Compute per-student averages across all analyses
    dim_keys = ["readability", "atsCompatibility", "jobMatch", "achievementQuality",
                "quantification", "sectionStructure", "languageQuality", "technicalBranding"]

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

    return JSONResponse({
        "student_id":     student_id,
        "user_email":     (analyses[0].get("user_email") if analyses else None),
        "analysis_count": len(analyses),
        "first_score":    first_score,
        "latest_score":   latest_score,
        "score_delta":    delta,
        "score_history":  score_history,
        "dim_avgs":       dim_avgs,
        "top_issues":     top_issues,
        "latest_strengths":     latest_result.get("topStrengths") or [],
        "latest_category_scores": latest_result.get("categoryScores") or {},
        "resumes":        resumes,
        "latest_resume_text":  (latest_result.get("extractedText") or "")[:4000],
    })
