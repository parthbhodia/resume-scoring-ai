"""Admin analytics routes."""
from __future__ import annotations

import datetime
from collections import defaultdict

from resume_gui.routes._shared import *  # noqa: F403


async def api_admin_analytics(request: Request):
    """GET /api/admin/analytics — token + activity dashboard for global admins."""
    scope, scope_error = _advisor_scope_for_request(request)
    if scope_error is not None:
        return scope_error
    if not (scope or {}).get("global_admin"):
        return JSONResponse({"error": "forbidden"}, status_code=403)

    try:
        raw_days = (request.query_params.get("days") or "30").strip()
        days = max(1, min(365, int(raw_days)))
    except ValueError:
        days = 30

    cutoff_dt = datetime.datetime.utcnow() - datetime.timedelta(days=days)
    cutoff_iso = cutoff_dt.isoformat() + "Z"

    # ── usage_events (token-level telemetry) ─────────────────────────────────
    events_table = _supabase_table("usage_events")
    events: list[dict] = []
    if events_table is not None:
        try:
            resp = (
                events_table
                .select("user_id,user_email,tool_name,model_used,prompt_tokens,completion_tokens,total_tokens,status,created_at")
                .gte("created_at", cutoff_iso)
                .order("created_at", desc=True)
                .limit(10000)
                .execute()
            )
            events = resp.data or []
        except Exception as exc:
            logger.warning("admin analytics usage_events query failed: %s", exc)

    # ── resume_analyses (activity proxy — always has data) ───────────────────
    analyses_table = _supabase_table("resume_analyses")
    analyses: list[dict] = []
    if analyses_table is not None:
        try:
            resp = (
                analyses_table
                .select("user_id,user_email,score,created_at")
                .gte("created_at", cutoff_iso)
                .order("created_at", desc=True)
                .limit(10000)
                .execute()
            )
            analyses = resp.data or []
        except Exception as exc:
            logger.warning("admin analytics resume_analyses query failed: %s", exc)

    # ── aggregations over usage_events ───────────────────────────────────────
    total_runs = len(events)
    total_tokens = sum(int(e.get("total_tokens") or 0) for e in events)
    total_prompt = sum(int(e.get("prompt_tokens") or 0) for e in events)
    total_completion = sum(int(e.get("completion_tokens") or 0) for e in events)
    failed_runs = sum(1 for e in events if (e.get("status") or "") == "error")
    unique_users: set[str] = set()
    unique_tools: set[str] = set()
    unique_models: set[str] = set()

    user_tokens: dict[str, int] = defaultdict(int)
    user_runs: dict[str, int] = defaultdict(int)
    user_email_map: dict[str, str] = {}
    user_tools: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    tool_runs: dict[str, int] = defaultdict(int)
    tool_tokens: dict[str, int] = defaultdict(int)
    tool_prompt: dict[str, int] = defaultdict(int)
    tool_completion: dict[str, int] = defaultdict(int)

    model_runs: dict[str, int] = defaultdict(int)
    model_tokens: dict[str, int] = defaultdict(int)

    daily_runs: dict[str, int] = defaultdict(int)
    daily_tokens: dict[str, int] = defaultdict(int)
    daily_failures: dict[str, int] = defaultdict(int)

    for e in events:
        uid = str(e.get("user_id") or "unknown")
        email = str(e.get("user_email") or "")
        tool = str(e.get("tool_name") or "unknown")
        model = str(e.get("model_used") or "unknown")
        toks = int(e.get("total_tokens") or 0)
        pt = int(e.get("prompt_tokens") or 0)
        ct = int(e.get("completion_tokens") or 0)
        status = str(e.get("status") or "ok")
        raw_ts = str(e.get("created_at") or "")
        day = raw_ts[:10] if len(raw_ts) >= 10 else "unknown"

        unique_users.add(uid)
        unique_tools.add(tool)
        unique_models.add(model)

        user_tokens[uid] += toks
        user_runs[uid] += 1
        if email:
            user_email_map[uid] = email
        user_tools[uid][tool] += 1

        tool_runs[tool] += 1
        tool_tokens[tool] += toks
        tool_prompt[tool] += pt
        tool_completion[tool] += ct

        model_runs[model] += 1
        model_tokens[model] += toks

        daily_runs[day] += 1
        daily_tokens[day] += toks
        if status == "error":
            daily_failures[day] += 1

    users_sorted = sorted(
        [
            {
                "user_id": uid,
                "user_email": user_email_map.get(uid),
                "runs": user_runs[uid],
                "tokens": user_tokens[uid],
                "tools": dict(sorted(user_tools[uid].items(), key=lambda x: -x[1])),
            }
            for uid in unique_users
        ],
        key=lambda u: -u["tokens"],
    )

    tools_sorted = sorted(
        [
            {
                "tool_name": t,
                "runs": tool_runs[t],
                "tokens": tool_tokens[t],
                "prompt_tokens": tool_prompt[t],
                "completion_tokens": tool_completion[t],
                "tokens_per_run": round(tool_tokens[t] / tool_runs[t]) if tool_runs[t] else 0,
            }
            for t in unique_tools
        ],
        key=lambda x: -x["tokens"],
    )

    models_sorted = sorted(
        [{"model": m, "runs": model_runs[m], "tokens": model_tokens[m]} for m in unique_models],
        key=lambda x: -x["tokens"],
    )

    # Build daily series covering the full window (fill gaps with zeros)
    all_days = sorted({d for d in daily_runs if d != "unknown"})
    daily_series = [
        {
            "date": d,
            "runs": daily_runs.get(d, 0),
            "tokens": daily_tokens.get(d, 0),
            "failures": daily_failures.get(d, 0),
        }
        for d in all_days
    ]

    # ── activity from resume_analyses (supplements when usage_events is sparse) ─
    analyses_users: dict[str, int] = defaultdict(int)
    analyses_email_map: dict[str, str] = {}
    analyses_daily: dict[str, int] = defaultdict(int)

    for a in analyses:
        uid = str(a.get("user_id") or "unknown")
        email = str(a.get("user_email") or "")
        raw_ts = str(a.get("created_at") or "")
        day = raw_ts[:10] if len(raw_ts) >= 10 else "unknown"
        analyses_users[uid] += 1
        if email:
            analyses_email_map[uid] = email
        analyses_daily[day] += 1

    activity_by_user = sorted(
        [
            {
                "user_id": uid,
                "user_email": analyses_email_map.get(uid),
                "analyses": cnt,
            }
            for uid, cnt in analyses_users.items()
        ],
        key=lambda x: -x["analyses"],
    )[:50]

    activity_daily = sorted(
        [{"date": d, "analyses": analyses_daily[d]} for d in analyses_daily if d != "unknown"],
        key=lambda x: x["date"],
    )

    return JSONResponse({
        "window_days": days,
        "summary": {
            "total_runs": total_runs,
            "total_tokens": total_tokens,
            "total_prompt_tokens": total_prompt,
            "total_completion_tokens": total_completion,
            "unique_users": len(unique_users),
            "unique_tools": len(unique_tools),
            "unique_models": len(unique_models),
            "failed_runs": failed_runs,
            "failure_rate_pct": round(100 * failed_runs / total_runs, 1) if total_runs else 0,
        },
        "users": users_sorted[:100],
        "tools": tools_sorted,
        "models": models_sorted,
        "daily": daily_series,
        # supplemental activity data (always populated from resume_analyses)
        "activity": {
            "total_analyses": len(analyses),
            "unique_users": len(analyses_users),
            "by_user": activity_by_user,
            "daily": activity_daily,
        },
    })
