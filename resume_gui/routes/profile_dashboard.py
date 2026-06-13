"""
Profile Dashboard API
GET /api/profile-dashboard — Aggregates all dashboard stats
"""

from datetime import datetime, timedelta
from typing import Optional
from starlette.routing import Route
from starlette.requests import Request
from starlette.responses import JSONResponse
from resume_gui.auth.supabase import get_current_user
from resume_gui.services.scan_limits import _scan_limit_status_for_user


async def profile_dashboard_handler(request: Request) -> JSONResponse:
    """
    GET /api/profile-dashboard

    Returns aggregated profile stats and recent activity.

    Response:
    {
      "stats": {
        "scansUsedToday": 4,
        "scansLimitDaily": 5,
        "analysesTotal": 12,
        "jobsSaved": 3,
        "resumesBuilt": 2
      },
      "activity": [
        {
          "type": "analysis",
          "date": "2026-06-12T14:32:00Z",
          "details": { "filename": "resume.pdf", "score": 78, ... }
        },
        ...
      ]
    }
    """
    try:
        # Get current user
        user = await get_current_user(request)
        if not user:
            return JSONResponse(
                {"error": "Unauthorized"},
                status_code=401,
            )

        user_id = user.get("id")
        user_email = user.get("email")

        # ===== SCANS LEFT TODAY =====
        scan_status = _scan_limit_status_for_user(user_id, user_email)
        scans_used_today = scan_status.get("used", 0)
        scans_limit_daily = scan_status.get("limit", 5)

        # ===== RECENT ACTIVITY =====
        try:
            from resume_gui.auth.supabase import get_supabase_client
            supabase = get_supabase_client()

            # Fetch recent analyses
            analyses_resp = supabase.table("resume_analyses") \
                .select("id, created_at, result") \
                .eq("user_id", user_id) \
                .order("created_at", desc=True) \
                .limit(5) \
                .execute()
            analyses_list = analyses_resp.data if analyses_resp.data else []

            # Fetch recent tailored resumes
            tailored_resp = supabase.table("resumes") \
                .select("id, created_at, name") \
                .eq("user_id", user_id) \
                .eq("tailored", True) \
                .order("created_at", desc=True) \
                .limit(5) \
                .execute()
            tailored_list = tailored_resp.data if tailored_resp.data else []

            # Fetch recent template builder resumes
            builder_resp = supabase.table("template_builder_resumes") \
                .select("id, created_at, name") \
                .eq("user_id", user_id) \
                .order("created_at", desc=True) \
                .limit(5) \
                .execute()
            builder_list = builder_resp.data if builder_resp.data else []

            # Merge and format activities
            recent_activity = []

            for analysis in analyses_list:
                try:
                    result = analysis.get("result", {})
                    score = result.get("overallScore", 0)
                    # Try to get previous score from history if available
                    previous_score = score - (result.get("improvement", 0) if "improvement" in result else 0)

                    recent_activity.append({
                        "type": "analysis",
                        "date": analysis.get("created_at", datetime.utcnow().isoformat() + "Z"),
                        "details": {
                            "filename": result.get("filename", "Resume"),
                            "score": score,
                            "previousScore": previous_score,
                        },
                    })
                except Exception:
                    pass

            for resume in tailored_list:
                recent_activity.append({
                    "type": "tailored",
                    "date": resume.get("created_at", datetime.utcnow().isoformat() + "Z"),
                    "details": {
                        "filename": resume.get("name", "Resume"),
                    },
                })

            for builder in builder_list:
                recent_activity.append({
                    "type": "builder",
                    "date": builder.get("created_at", datetime.utcnow().isoformat() + "Z"),
                    "details": {
                        "filename": builder.get("name", "Resume"),
                    },
                })

            # Sort by date and take top 5
            recent_activity.sort(
                key=lambda x: x.get("date", ""),
                reverse=True
            )
            recent_activity = recent_activity[:5]

        except Exception as e:
            # Fallback to empty if queries fail
            recent_activity = []

        # ===== TOTAL COUNTS =====
        try:
            from resume_gui.auth.supabase import get_supabase_client
            supabase = get_supabase_client()

            # Count analyses
            analyses_count_resp = supabase.table("resume_analyses") \
                .select("id", count="exact") \
                .eq("user_id", user_id) \
                .execute()
            analyses_total = analyses_count_resp.count if analyses_count_resp.count else 0

            # Count saved jobs (if table exists)
            try:
                jobs_count_resp = supabase.table("saved_jobs") \
                    .select("id", count="exact") \
                    .eq("user_id", user_id) \
                    .execute()
                jobs_saved = jobs_count_resp.count if jobs_count_resp.count else 0
            except Exception:
                jobs_saved = 0

            # Count template builder resumes
            resumes_count_resp = supabase.table("template_builder_resumes") \
                .select("id", count="exact") \
                .eq("user_id", user_id) \
                .execute()
            resumes_built = resumes_count_resp.count if resumes_count_resp.count else 0

        except Exception:
            # Fallback counts
            analyses_total = 0
            jobs_saved = 0
            resumes_built = 0

        return JSONResponse(
            {
                "stats": {
                    "scansUsedToday": scans_used_today,
                    "scansLimitDaily": scans_limit_daily,
                    "analysesTotal": analyses_total,
                    "jobsSaved": jobs_saved,
                    "resumesBuilt": resumes_built,
                },
                "activity": recent_activity,
            },
            status_code=200,
        )

    except Exception as e:
        return JSONResponse(
            {"error": str(e)},
            status_code=500,
        )


# Route definition
route = Route("/api/profile-dashboard", profile_dashboard_handler, methods=["GET"])
