"""Industry-specific evidence standards for resume analysis.

The analyzer should reward proof that is credible for the candidate's field.
For some fields that proof is a hard metric; for others it is scope, volume,
complexity, compliance, audience, tooling, or domain context.
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class IndustryPlaybook:
    """Evidence policy used by the comprehensive resume analyzer."""

    family: str
    label: str
    numeric_density: str
    evidence_standard: str
    proof_signals: tuple[str, ...]
    metric_or_proxy_examples: tuple[str, ...]
    action_verbs: tuple[str, ...]
    weak_patterns: tuple[str, ...]
    rewrite_examples: tuple[str, ...]
    keywords: tuple[str, ...]


PLAYBOOKS: dict[str, IndustryPlaybook] = {
    "software_data": IndustryPlaybook(
        family="software_data",
        label="Software, data, analytics, and technical product",
        numeric_density="high",
        evidence_standard=(
            "Prefer concrete impact metrics, scale, latency, accuracy, cost, usage, reliability, "
            "security, automation, data volume, deployment scope, or engineering ownership."
        ),
        proof_signals=(
            "users", "traffic", "latency", "runtime", "accuracy", "cost", "uptime", "SLA",
            "test coverage", "defects", "release cadence", "data volume", "API calls", "cloud services",
        ),
        metric_or_proxy_examples=(
            "reduced load time by [X%]", "served [N] users", "processed [N] records",
            "cut cloud cost by [$X]", "improved accuracy by [X points]", "owned [N] services",
        ),
        action_verbs=("built", "shipped", "optimized", "automated", "migrated", "instrumented", "hardened", "scaled"),
        weak_patterns=("worked on app", "helped with dashboard", "responsible for coding", "used various technologies"),
        rewrite_examples=(
            "Built a Vue/TypeScript dashboard for [audience], reducing review time by [X%] across [N] workflows.",
            "Optimized API and caching logic to cut page latency from [A] to [B] for [N] monthly users.",
        ),
        keywords=(
            "software", "developer", "engineer", "frontend", "backend", "full-stack", "vue", "react",
            "typescript", "javascript", "python", "java", "api", "aws", "azure", "gcp", "data",
            "analytics", "sql", "dashboard", "machine learning", "ml", "model", "etl", "pipeline",
            "devops", "cloud", "code", "database",
        ),
    ),
    "legal": IndustryPlaybook(
        family="legal",
        label="Legal, compliance, and policy",
        numeric_density="moderate-low",
        evidence_standard=(
            "Do not force percentages. Reward matter type, filing volume, jurisdictions, regulatory scope, "
            "research depth, memo/brief quality, deadline sensitivity, counsel/client support, and compliance outcomes."
        ),
        proof_signals=(
            "matters", "filings", "memos", "briefs", "contracts", "jurisdictions", "case types",
            "regulatory frameworks", "deadlines", "client support", "discovery", "due diligence", "compliance reviews",
        ),
        metric_or_proxy_examples=(
            "drafted [N] legal memos", "supported [matter/case type] across [jurisdiction]",
            "reviewed [N] contracts/filings", "tracked deadlines for [N] matters", "researched [statute/regulation]",
        ),
        action_verbs=("drafted", "researched", "reviewed", "summarized", "coordinated", "filed", "analyzed", "supported"),
        weak_patterns=("helped lawyers", "did legal research", "worked on cases", "handled paperwork"),
        rewrite_examples=(
            "Drafted [N] research memos on [legal issue] to support counsel strategy for [case/matter type].",
            "Reviewed [N] contracts for [risk/compliance issue], flagging exceptions against [policy/regulation].",
        ),
        keywords=(
            "legal", "law", "paralegal", "attorney", "counsel", "case", "court", "filing", "brief", "memo",
            "contract", "compliance", "regulatory", "jurisdiction", "litigation", "discovery", "statute", "policy",
        ),
    ),
    "healthcare": IndustryPlaybook(
        family="healthcare",
        label="Healthcare, clinical operations, and care coordination",
        numeric_density="moderate",
        evidence_standard=(
            "Reward patient volume, acuity, unit/setting, shift load, EHR/charting, care coordination, safety, "
            "privacy/compliance, turnaround time, and quality indicators. Percentages are useful but not mandatory."
        ),
        proof_signals=(
            "patient volume", "unit type", "caseload", "shift", "EHR", "charting", "HIPAA", "care plans",
            "triage", "safety", "quality", "medication", "lab", "coordination", "discharge", "vitals",
        ),
        metric_or_proxy_examples=(
            "supported [N] patients per shift", "documented care in [EHR]", "coordinated discharge for [unit/population]",
            "maintained [compliance/safety standard]", "reduced wait/charting time by [X]",
        ),
        action_verbs=("assessed", "coordinated", "documented", "monitored", "triaged", "educated", "administered", "supported"),
        weak_patterns=("helped patients", "worked in hospital", "did charts", "assisted nurses"),
        rewrite_examples=(
            "Coordinated care documentation for [N] patients per shift in [unit], maintaining HIPAA-compliant EHR records.",
            "Monitored [patient population] vitals and escalated changes to clinical staff within [timeframe/protocol].",
        ),
        keywords=(
            "healthcare", "clinical", "patient", "hospital", "clinic", "nurse", "medical", "ehr", "emr",
            "hipaa", "care", "pharmacy", "therapist", "lab", "vitals", "chart", "discharge", "triage",
        ),
    ),
    "education": IndustryPlaybook(
        family="education",
        label="Education, training, and student support",
        numeric_density="moderate-low",
        evidence_standard=(
            "Reward learner population, class size, curriculum scope, assessment methods, learning outcomes, "
            "retention, accommodations, program support, and stakeholder communication."
        ),
        proof_signals=("students", "class size", "curriculum", "lesson plans", "assessments", "IEP", "LMS", "retention", "workshops"),
        metric_or_proxy_examples=("taught [N] students", "designed [N] lesson plans", "supported [course/program]", "improved completion by [X%]"),
        action_verbs=("taught", "designed", "facilitated", "mentored", "assessed", "adapted", "coached", "coordinated"),
        weak_patterns=("helped students", "made lessons", "worked with kids", "assisted teacher"),
        rewrite_examples=("Designed [N] lessons for [grade/course], adapting activities for [learner need] and assessment goals.",),
        keywords=("teacher", "education", "student", "curriculum", "classroom", "tutor", "instruction", "training", "learning", "lms"),
    ),
    "finance_accounting": IndustryPlaybook(
        family="finance_accounting",
        label="Finance, accounting, audit, and business operations",
        numeric_density="high",
        evidence_standard=(
            "Reward dollars, portfolio/account size, close cycle, variance, audit scope, reconciliation volume, "
            "forecast accuracy, controls, and reporting cadence."
        ),
        proof_signals=("budget", "revenue", "forecast", "variance", "audit", "reconciliation", "ledger", "close", "controls", "portfolio"),
        metric_or_proxy_examples=("reconciled [$X]", "reduced close by [N] days", "analyzed [N] accounts", "improved forecast accuracy by [X%]"),
        action_verbs=("analyzed", "reconciled", "forecasted", "audited", "modeled", "reported", "reduced", "controlled"),
        weak_patterns=("worked on reports", "helped with accounting", "did finance tasks", "managed spreadsheets"),
        rewrite_examples=("Reconciled [$X] across [N] accounts, resolving discrepancies before month-end close.",),
        keywords=("finance", "accounting", "audit", "revenue", "budget", "forecast", "ledger", "reconciliation", "tax", "financial"),
    ),
    "sales_marketing": IndustryPlaybook(
        family="sales_marketing",
        label="Sales, marketing, growth, and communications",
        numeric_density="high",
        evidence_standard=(
            "Reward revenue, pipeline, conversion, leads, audience size, engagement, retention, campaign spend, "
            "ROAS, quota, market segment, and channel ownership."
        ),
        proof_signals=("revenue", "pipeline", "leads", "conversion", "engagement", "CTR", "CAC", "ROAS", "quota", "campaign", "audience"),
        metric_or_proxy_examples=("generated [$X] pipeline", "increased conversion by [X%]", "managed [N] campaigns", "reached [N] audience"),
        action_verbs=("generated", "converted", "launched", "positioned", "prospected", "negotiated", "grew", "optimized"),
        weak_patterns=("posted on social media", "helped sales", "made marketing materials", "talked to customers"),
        rewrite_examples=("Launched [channel] campaign reaching [N] prospects and increasing qualified leads by [X%].",),
        keywords=("sales", "marketing", "growth", "campaign", "lead", "crm", "pipeline", "quota", "seo", "social media", "brand"),
    ),
    "design_creative": IndustryPlaybook(
        family="design_creative",
        label="Design, content, media, and creative production",
        numeric_density="moderate-low",
        evidence_standard=(
            "Reward audience, platform, asset volume, design system contribution, usability findings, brand constraints, "
            "production cadence, stakeholder approval, and portfolio-ready outcomes."
        ),
        proof_signals=("portfolio", "brand", "assets", "design system", "prototype", "usability", "audience", "campaign", "production", "stakeholders"),
        metric_or_proxy_examples=("created [N] assets", "supported [campaign/platform]", "improved usability from [finding]", "served [audience]"),
        action_verbs=("designed", "produced", "concepted", "prototyped", "edited", "illustrated", "directed", "delivered"),
        weak_patterns=("made designs", "helped with graphics", "created content", "used Photoshop"),
        rewrite_examples=("Designed [N] brand assets for [campaign/platform], aligning layouts with [brand/system constraint].",),
        keywords=("design", "designer", "creative", "content", "figma", "adobe", "portfolio", "brand", "video", "ux", "ui", "graphic"),
    ),
    "research_academic": IndustryPlaybook(
        family="research_academic",
        label="Research, academic, laboratory, and scholarly work",
        numeric_density="moderate-low",
        evidence_standard=(
            "Reward research question, method, dataset/sample size when available, lab/tooling, publication/poster status, "
            "advisor/team context, grant/protocol compliance, and reproducible outputs."
        ),
        proof_signals=("research question", "method", "sample", "dataset", "lab", "protocol", "publication", "poster", "IRB", "grant", "advisor"),
        metric_or_proxy_examples=("analyzed [N] samples", "processed [dataset size]", "co-authored [paper/poster]", "used [method/tool]"),
        action_verbs=("investigated", "analyzed", "modeled", "validated", "synthesized", "presented", "co-authored", "collected"),
        weak_patterns=("did research", "worked in lab", "helped professor", "read papers"),
        rewrite_examples=("Analyzed [dataset/sample] using [method], producing findings for [poster/paper/lab deliverable].",),
        keywords=("research", "academic", "lab", "laboratory", "publication", "paper", "poster", "dataset", "sample", "experiment", "thesis"),
    ),
    "operations_admin": IndustryPlaybook(
        family="operations_admin",
        label="Operations, administration, HR, and coordination",
        numeric_density="moderate",
        evidence_standard=(
            "Reward process volume, turnaround time, stakeholder count, scheduling complexity, systems used, compliance, "
            "documentation accuracy, and workflow improvements."
        ),
        proof_signals=("workflow", "process", "scheduling", "records", "stakeholders", "turnaround", "documentation", "compliance", "vendor"),
        metric_or_proxy_examples=("processed [N] requests", "supported [N] stakeholders", "reduced turnaround by [X]", "maintained [system/process]"),
        action_verbs=("coordinated", "processed", "scheduled", "documented", "streamlined", "tracked", "resolved", "maintained"),
        weak_patterns=("office tasks", "helped admin", "answered emails", "managed files"),
        rewrite_examples=("Processed [N] weekly requests in [system], reducing follow-up time through standardized documentation.",),
        keywords=("operations", "admin", "administrative", "coordinator", "hr", "human resources", "office", "scheduling", "records", "workflow"),
    ),
    "customer_retail_hospitality": IndustryPlaybook(
        family="customer_retail_hospitality",
        label="Customer service, retail, hospitality, and food service",
        numeric_density="moderate",
        evidence_standard=(
            "Reward customer volume, transaction volume, shift load, guest satisfaction, upsell, speed, safety, cash handling, "
            "inventory, and conflict resolution."
        ),
        proof_signals=("customers", "guests", "transactions", "POS", "shift", "cash", "inventory", "satisfaction", "upsell", "service recovery"),
        metric_or_proxy_examples=("served [N] customers per shift", "handled [$X] cash", "processed [N] transactions", "improved rating by [X]"),
        action_verbs=("served", "resolved", "processed", "trained", "restocked", "upsold", "handled", "coordinated"),
        weak_patterns=("helped customers", "worked register", "served food", "cleaned store"),
        rewrite_examples=("Served [N] customers per shift while processing POS transactions and resolving service issues under peak-hour pressure.",),
        keywords=("customer", "retail", "cashier", "hospitality", "restaurant", "server", "barista", "guest", "pos", "store", "sales associate"),
    ),
    "trades_manufacturing": IndustryPlaybook(
        family="trades_manufacturing",
        label="Trades, manufacturing, logistics, and field work",
        numeric_density="moderate",
        evidence_standard=(
            "Reward equipment, safety record, production volume, route/load volume, certifications, downtime, quality, "
            "maintenance intervals, and compliance standards."
        ),
        proof_signals=("equipment", "safety", "OSHA", "production", "maintenance", "downtime", "quality", "routes", "loads", "certification"),
        metric_or_proxy_examples=("completed [N] work orders", "maintained [equipment]", "reduced downtime by [X]", "met [safety/quality standard]"),
        action_verbs=("installed", "repaired", "operated", "inspected", "maintained", "assembled", "delivered", "troubleshot"),
        weak_patterns=("fixed things", "worked in warehouse", "operated machines", "did deliveries"),
        rewrite_examples=("Completed [N] preventive maintenance work orders on [equipment], maintaining compliance with [safety/quality standard].",),
        keywords=("warehouse", "manufacturing", "technician", "mechanic", "electrician", "plumbing", "logistics", "forklift", "maintenance", "driver"),
    ),
    "public_service_nonprofit": IndustryPlaybook(
        family="public_service_nonprofit",
        label="Public service, nonprofit, community, and government programs",
        numeric_density="moderate-low",
        evidence_standard=(
            "Reward population served, program scope, grants/funding, policy or community outcome, case volume, partner network, "
            "compliance, and service delivery context."
        ),
        proof_signals=("community", "program", "clients", "beneficiaries", "grant", "policy", "case load", "partners", "public", "outreach"),
        metric_or_proxy_examples=("served [N] community members", "supported [$X] grant", "coordinated [N] partners", "managed [program scope]"),
        action_verbs=("served", "coordinated", "advocated", "implemented", "evaluated", "reported", "engaged", "supported"),
        weak_patterns=("helped community", "worked on programs", "did outreach", "supported nonprofit"),
        rewrite_examples=("Coordinated outreach for [program], serving [N] community members through [partner/service channel].",),
        keywords=("nonprofit", "government", "public", "community", "outreach", "program", "grant", "case manager", "policy", "service"),
    ),
    "early_career_general": IndustryPlaybook(
        family="early_career_general",
        label="Early-career, student, internship, and general resume",
        numeric_density="moderate-flexible",
        evidence_standard=(
            "Reward credible coursework, projects, clubs, volunteer work, tools, team size, deliverables, leadership, "
            "and learning outcomes when paid-work metrics are not available. Placeholders are acceptable for unknown scope."
        ),
        proof_signals=("coursework", "project", "club", "team", "capstone", "volunteer", "internship", "tools", "presentation", "leadership"),
        metric_or_proxy_examples=("built [project] for [N] users/class", "led [N]-person team", "completed [course/certification]", "presented to [audience]"),
        action_verbs=("built", "led", "collaborated", "presented", "organized", "analyzed", "designed", "completed"),
        weak_patterns=("learned about", "familiar with", "responsible for", "participated in"),
        rewrite_examples=("Built [project] using [tools] to solve [problem], presenting results to [class/team/audience].",),
        keywords=("student", "intern", "coursework", "project", "capstone", "club", "volunteer", "entry level", "graduate", "freshman", "sophomore"),
    ),
}

DEFAULT_FAMILY = "early_career_general"


def _normalize_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _iter_structured_values(value: object) -> Iterable[str]:
    """Yield searchable text from nested dict/list/Pydantic-like objects."""
    if value is None:
        return
    if isinstance(value, str):
        yield value
        return
    if isinstance(value, Mapping):
        for nested in value.values():
            yield from _iter_structured_values(nested)
        return
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        for nested in value:
            yield from _iter_structured_values(nested)
        return
    if hasattr(value, "model_dump"):
        yield from _iter_structured_values(value.model_dump())
        return
    if hasattr(value, "dict"):
        yield from _iter_structured_values(value.dict())
        return
    if hasattr(value, "__dict__"):
        yield from _iter_structured_values(vars(value))
        return
    yield str(value)


def infer_field_family(resume_text: str, structured: object | None = None) -> str:
    """Infer the best playbook using weighted keyword hits."""
    raw_text = _normalize_text(resume_text)
    structured_text = _normalize_text(" ".join(_iter_structured_values(structured))) if structured is not None else ""
    haystack = f"{raw_text} {structured_text} {structured_text}"

    scores: dict[str, int] = {}
    for family, playbook in PLAYBOOKS.items():
        score = 0
        for keyword in playbook.keywords:
            pattern = r"(?<![a-z0-9])" + re.escape(keyword.lower()) + r"(?![a-z0-9])"
            hits = len(re.findall(pattern, haystack))
            if hits:
                score += hits * (3 if " " in keyword else 1)
        if score:
            scores[family] = score

    if not scores:
        return DEFAULT_FAMILY

    scores[DEFAULT_FAMILY] = int(scores.get(DEFAULT_FAMILY, 0) * 0.8)
    return max(scores.items(), key=lambda item: item[1])[0]


def get_playbook(family: str | None) -> IndustryPlaybook:
    """Return a playbook, falling back to the early-career general standard."""
    return PLAYBOOKS.get(family or DEFAULT_FAMILY, PLAYBOOKS[DEFAULT_FAMILY])


def build_playbook_prompt_context(playbook: IndustryPlaybook) -> str:
    """Compact prompt block that teaches the model how to score evidence."""
    return "\n".join(
        [
            f"FIELD FAMILY: {playbook.family} - {playbook.label}",
            f"NUMERIC DENSITY TARGET: {playbook.numeric_density}",
            f"EVIDENCE STANDARD: {playbook.evidence_standard}",
            "PROOF SIGNALS: " + "; ".join(playbook.proof_signals),
            "METRIC / PROXY EXAMPLES: " + "; ".join(playbook.metric_or_proxy_examples),
            "ACTION VERBS: " + "; ".join(playbook.action_verbs),
            "WEAK PATTERNS TO PENALIZE: " + "; ".join(playbook.weak_patterns),
            "BEST-IN-CLASS REWRITE EXAMPLES: " + " | ".join(playbook.rewrite_examples),
        ]
    )
