"""
Resume Library Integration

Reads and writes to the resume library at the path set by the LIBRARY_ROOT
environment variable.

Each resume lives in its own subfolder with a consistent naming scheme.
New resumes are generated as .tex files using the Rezume template,
then compiled to PDF with pdflatex when available.
"""

import difflib
import json
import logging
import os
import re
import subprocess
import time
from typing import Dict, List, Optional, Set, Tuple

import requests
from bs4 import BeautifulSoup
from urllib.parse import parse_qs, urlparse
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)


def primary_gemini_flash_model(explicit: Optional[str] = None) -> str:
    """Default Gemini Flash text model for stream/generate/JD/suggest paths.

    Set ``GEMINI_FLASH_MODEL`` (e.g. ``gemini-2.5-flash-lite``) when AI Studio shows
    **gemini-2.5-flash** RPM/RPD tight — Lite is often a separate per-model pool.
    """
    if explicit and str(explicit).strip():
        return str(explicit).strip()
    return (os.environ.get("GEMINI_FLASH_MODEL") or "gemini-2.5-flash").strip() or "gemini-2.5-flash"


def grok_preferred_for_throughput() -> bool:
    """Use xAI Grok as the primary model when ``XAI_API_KEY`` is set.

    Set ``LLM_PROVIDER=gemini`` to keep Google Gemini as primary despite having an xAI key.
    Unset or ``LLM_PROVIDER=grok`` → Grok-first (better RPM on many xAI tiers).
    """
    if not (os.environ.get("XAI_API_KEY") or "").strip():
        return False
    p = (os.environ.get("LLM_PROVIDER") or "").strip().lower()
    if p == "gemini":
        return False
    return True


def primary_llm_model_for_resume_workloads(explicit: Optional[str] = None) -> str:
    """Primary model for résumé generation, JD extract, skills, bullet rewrite.

    When ``grok_preferred_for_throughput()`` is true, uses ``GROK_MODEL`` (or the default
    Grok slug) even if the client sent a Gemini id — unless the client explicitly sent a ``grok-`` id."""
    ex = (explicit or "").strip()
    if grok_preferred_for_throughput():
        if ex.lower().startswith("grok"):
            return ex
        return (os.environ.get("GROK_MODEL") or _GROK_FALLBACK_MODELS[0]).strip() or _GROK_FALLBACK_MODELS[0]
    return primary_gemini_flash_model(explicit or None)


# Extra models to try when the primary hits quota errors (free tier is per-model).
# gemini-1.5-* are retired on the v1beta endpoint; including them just adds 404 noise.
# Prefer 2.5 Flash-Lite before older 2.0 models when 2.5 Flash is exhausted.
_GEMINI_FALLBACK_MODELS = (
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
)

# Cross-provider fallback: when the entire Gemini chain is quota-exhausted,
# roll over to Grok via xAI's Responses API. Requires XAI_API_KEY.
# grok-4-1-fast-non-reasoning is xAI's "best agentic tool calling" model
# in the non-reasoning tier — needed for reliable web_search invocation.
# Override per-deployment via env var GROK_MODEL.
_GROK_FALLBACK_MODELS = (
    os.environ.get("GROK_MODEL", "grok-4-1-fast-non-reasoning"),
)

# Reasoning-tier models used for analytical tasks (match scoring, ratings).
# gemini-2.5-pro has deep thinking enabled; grok-4 is xAI's reasoning model.
_REASONING_MODEL_GEMINI = "gemini-2.5-pro"
_REASONING_MODEL_GROK   = os.environ.get("GROK_REASONING_MODEL", "grok-4")


def _error_probe_text(exc: BaseException) -> str:
    """All text used to classify provider errors (str + repr; some SDKs hide detail in repr)."""
    parts: list[str] = []
    try:
        parts.append(str(exc))
    except Exception:
        parts.append("error")
    try:
        r = repr(exc)
        if r not in parts:
            parts.append(r)
    except Exception:
        pass
    return " ".join(parts)


def _sse_friendly_error(exc: BaseException) -> str:
    """User-visible SSE error line — avoid dumping raw provider JSON blobs."""
    probe = _error_probe_text(exc).lower()
    if _transient_provider_error_from_text(probe):
        return (
            "The AI service is temporarily busy. Please wait a minute and try again — "
            "demand spikes are usually short-lived."
        )
    raw = str(exc).strip()
    if len(raw) > 280 and ("'error'" in raw or '"error"' in raw):
        return (
            "Something went wrong while contacting the AI service. Please try again in a moment."
        )
    return raw if raw else "Something went wrong. Please try again."


def _transient_provider_error_from_text(m: str) -> bool:
    """True when `m` is already lowercased / normalized probe text."""
    return any(
        n in m
        for n in (
            "429",
            "resource_exhausted",
            "503",
            "unavailable",
            "service unavailable",
            "high demand",
            "spikes in demand",
            "overloaded",
            "try again later",
            "deadline exceeded",
            "too many requests",
            "rate limit",
            "quota exceeded",
        )
    )


def _transient_provider_error(exc: BaseException) -> bool:
    """True for quota/capacity errors where a short wait + retry often succeeds."""
    return _transient_provider_error_from_text(_error_probe_text(exc).lower())


def _backoff_if_rate_limited(exc: BaseException, default_wait: float = 5.0) -> None:
    """
    If the provider returned a transient quota/capacity error, pause before
    retrying the same model or advancing the fallback chain. 503 / UNAVAILABLE /
    "high demand" from Gemini get a slightly longer pause than plain 429.
    """
    if not _transient_provider_error(exc):
        return
    msg = str(exc).lower()
    if "503" in msg or "unavailable" in msg or "high demand" in msg or "overloaded" in msg:
        wait = min(max(default_wait + 3.0, 4.0), 14.0)
    else:
        wait = min(max(default_wait, 1.0), 8.0)
    logger.info(f"Transient API pressure — pausing {wait:.1f}s before retry or next model")
    time.sleep(wait)


def _model_chain(primary: str, extra: Tuple[str, ...] = _GEMINI_FALLBACK_MODELS) -> List[str]:
    """Deduplicated list: primary first, then Gemini fallbacks, then Grok (if key set)."""
    out: List[str] = []
    seen: set[str] = set()
    candidates: Tuple[str, ...] = (primary,) + extra
    if os.environ.get("XAI_API_KEY"):
        candidates = candidates + _GROK_FALLBACK_MODELS
    for m in candidates:
        if m not in seen:
            seen.add(m)
            out.append(m)
    return out


# ── xAI / Grok provider ─────────────────────────────────────────────────────
_xai_client = None


def _is_grok(model: str) -> bool:
    return model.lower().startswith("grok")


def _get_xai_client():
    """Lazy singleton — only imports openai + constructs client when first needed."""
    global _xai_client
    if _xai_client is not None:
        return _xai_client
    key = os.environ.get("XAI_API_KEY")
    if not key:
        raise RuntimeError("XAI_API_KEY not set — cannot use Grok")
    from openai import OpenAI  # openai comes in via langchain-openai already
    _xai_client = OpenAI(api_key=key, base_url="https://api.x.ai/v1")
    return _xai_client


def _stream_grok(
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.2,
    *,
    web_search: bool = True,
):
    """
    Stream a Grok generation via the xAI Responses API (optionally with the web_search tool).

    Yields typed event dicts the caller dispatches on:
      {"type": "text",   "delta": str}                     — incremental text
      {"type": "query",  "query": str}                     — Grok issued a Google search
      {"type": "source", "title": str|None, "url": str}    — Grok cited a page

    Background: xAI deprecated Live Search on Chat Completions in Apr 2026 and
    moved web search to the Responses API behind tools=[{"type":"web_search"}].
    So we have to use client.responses.create (not chat.completions.create)
    and parse a different streaming event format. Event names follow OpenAI's
    Responses API spec which xAI mirrors.
    """
    client = _get_xai_client()
    # Responses API uses `instructions` for the system message and `input` for
    # the user message (or a list of input items for multi-turn). Single-turn
    # is fine here.
    _kwargs = {
        "model": model,
        "instructions": system_prompt,
        "input": user_prompt,
        "temperature": temperature,
        "stream": True,
    }
    if web_search:
        _kwargs["tools"] = [{"type": "web_search"}]
    stream = client.responses.create(**_kwargs)

    seen_query_ids: set = set()
    seen_source_urls: set = set()

    for event in stream:
        et = getattr(event, "type", "") or ""

        # Text deltas — main content
        if et == "response.output_text.delta":
            delta = getattr(event, "delta", None)
            if delta:
                yield {"type": "text", "delta": delta}
            continue

        # New output item added — could be the start of a web_search_call
        if et in ("response.output_item.added", "response.output_item.done"):
            item = getattr(event, "item", None)
            if item is None:
                continue
            item_type = getattr(item, "type", None) or (item.get("type") if isinstance(item, dict) else None)
            if item_type == "web_search_call":
                # Pull the query from item.action.query (or item["action"]["query"]).
                action = getattr(item, "action", None) or (item.get("action") if isinstance(item, dict) else None)
                query = None
                if action is not None:
                    query = getattr(action, "query", None) or (action.get("query") if isinstance(action, dict) else None)
                # Fall back to item.query if the schema changes
                if not query:
                    query = getattr(item, "query", None) or (item.get("query") if isinstance(item, dict) else None)
                item_id = getattr(item, "id", None) or (item.get("id") if isinstance(item, dict) else None) or query
                if query and item_id and item_id not in seen_query_ids:
                    seen_query_ids.add(item_id)
                    yield {"type": "query", "query": query}
            continue

        # Citation annotations attached to text — fire as soon as Grok cites a page
        if et == "response.output_text.annotation.added":
            ann = getattr(event, "annotation", None)
            if ann is None:
                continue
            ann_type = getattr(ann, "type", None) or (ann.get("type") if isinstance(ann, dict) else None)
            if ann_type in ("url_citation", "web_citation"):
                url   = getattr(ann, "url",   None) or (ann.get("url")   if isinstance(ann, dict) else None)
                title = getattr(ann, "title", None) or (ann.get("title") if isinstance(ann, dict) else None)
                if url and url not in seen_source_urls:
                    seen_source_urls.add(url)
                    yield {"type": "source", "title": title, "url": url}
            continue

        # Final response — sweep up any citations we missed via the streaming events
        # (some servers only emit annotations on the completed event).
        if et == "response.completed":
            resp = getattr(event, "response", None)
            output = getattr(resp, "output", None) or []
            for it in output:
                content = getattr(it, "content", None) or (it.get("content") if isinstance(it, dict) else None) or []
                for c in content:
                    annotations = getattr(c, "annotations", None) or (c.get("annotations") if isinstance(c, dict) else None) or []
                    for ann in annotations:
                        ann_type = getattr(ann, "type", None) or (ann.get("type") if isinstance(ann, dict) else None)
                        if ann_type not in ("url_citation", "web_citation"):
                            continue
                        url   = getattr(ann, "url",   None) or (ann.get("url")   if isinstance(ann, dict) else None)
                        title = getattr(ann, "title", None) or (ann.get("title") if isinstance(ann, dict) else None)
                        if url and url not in seen_source_urls:
                            seen_source_urls.add(url)
                            yield {"type": "source", "title": title, "url": url}


def _json_grok(model: str, prompt: str, temperature: float = 0.2) -> Optional[Dict]:
    """One-shot JSON call against Grok. Returns parsed dict or None on failure."""
    try:
        client = _get_xai_client()
        r = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        text = (r.choices[0].message.content or "").strip()
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        return json.loads(text)
    except Exception as exc:
        logger.warning(f"Grok JSON call failed on {model}: {exc}")
        return None


# Match Markdown bold: **non-empty content not containing ** or newlines**.
# Non-greedy so adjacent groups don't merge. Excludes asterisks and newlines
# inside the group to avoid spanning paragraphs or eating sibling markers.
_MD_BOLD_RE = re.compile(r"\*\*([^*\n]+?)\*\*")


def _markdown_to_latex_bold(text: str) -> Tuple[str, int]:
    """
    Rewrite Markdown **bold** → \\textbf{bold}.

    pdflatex prints literal asterisks for **word**, which shows up in the
    rendered PDF as `**React**` instead of bolded `React`. The system prompt
    forbids Markdown but Grok in particular tends to default to it, so we
    sanitize the body unconditionally before saving the .tex file.

    Returns (rewritten_text, replacements_count).
    """
    if "**" not in text:
        return text, 0
    new_text, n = _MD_BOLD_RE.subn(r"\\textbf{\1}", text)
    return new_text, n


# Gemini / Chat-style grounding footnotes that must never reach pdflatex.
_MD_GEMINI_FOOTNOTE_RE = re.compile(r"\s*\[\[\d+\]\]\([^)]*\)")
_MD_GEMINI_FOOTNOTE_BARE_RE = re.compile(r"\s*\[\[\d+\]\]")


def _strip_llm_markdown_citations(text: str) -> str:
    """Remove [[n]](url) / [[n]] artifacts from model output before saving .tex."""
    if "[[" not in text:
        return text
    text = _MD_GEMINI_FOOTNOTE_RE.sub("", text)
    text = _MD_GEMINI_FOOTNOTE_BARE_RE.sub("", text)
    return text


def _is_removal_suggestion(suggested: str) -> bool:
    """True when the user (or coach JSON) indicates delete/omit with no replacement prose."""
    t = (suggested or "").strip().lower()
    if not t:
        return True
    if t in {
        "(remove)",
        "remove",
        "—",
        "-",
        "n/a",
        "[remove]",
        "omit",
        "(omit)",
        "deleted",
        "(deleted)",
    }:
        return True
    if t.startswith("(remove") or t.startswith("(omit") or t.startswith("[remove"):
        return True
    for phrase in (
        "delete this bullet",
        "remove this bullet",
        "omit this bullet",
        "remove this line",
        "delete this line",
    ):
        if t == phrase or t.startswith(phrase + " ") or t.startswith(phrase + "."):
            return True
    return False


LIBRARY_ROOT = os.environ.get("LIBRARY_ROOT", "")

# Prefer the system pdflatex (cross-platform); the binary must be on PATH or
# pointed to by the PDFLATEX env var for PDF compilation to work.
import shutil as _shutil
PDFLATEX = os.environ.get("PDFLATEX_PATH") or _shutil.which("pdflatex") or ""

# LaTeX preamble — shared across all generated resumes
_LATEX_PREAMBLE = r"""%-------------------------
% Resume - {role} - {company}
% Based on: Rezume template by Nanu Panchamurthy
%-------------------------

\documentclass[a4paper,11pt]{article}

\usepackage{verbatim}
\usepackage{titlesec}
\usepackage[dvipsnames]{xcolor}
\usepackage{enumitem}
\usepackage{multicol}
\usepackage{fancyhdr}
\usepackage{tabularx}
\usepackage{latexsym}
\usepackage{marvosym}
\usepackage[empty]{fullpage}
\usepackage[hidelinks]{hyperref}
\usepackage[normalem]{ulem}
\usepackage[english]{babel}

\input glyphtounicode
\pdfgentounicode=1

\usepackage{lmodern}
\urlstyle{same}

\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0in}
\renewcommand{\footrulewidth}{0in}
\setlength{\tabcolsep}{0in}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\topmargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textheight}{1.5in}
\addtolength{\footskip}{0in}
\addtolength{\textwidth}{1in}

\raggedright{}

\usepackage{titlesec}
\titlespacing{\section}{1pt}{*0}{*1}
\setlength{\parskip}{2pt}
\setlength{\parindent}{2pt}

\titleformat{\section}
  {\scshape\large}{}
    {0em}{\color{blue}}[\color{black}\titlerule\vspace{0pt}]

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}
\renewcommand{\ULdepth}{1pt}

\newcommand{\resumeItem}[1]{\item\small{#1}}
\newcommand{\resumeItemListStart}{\begin{itemize}[rightmargin=0.3in]}
\newcommand{\resumeItemListEnd}{\end{itemize}}

\newcommand{\resumeQuadHeading}[4]{
  \item
  \begin{tabular*}{0.96\textwidth}[t]{l@{\extracolsep{\fill}}r}
    \textbf{#1} & #2 \\
    \textit{\small#3} & \textit{\small #4} \\
  \end{tabular*}
}

\newcommand{\resumeTrioHeading}[3]{
  \item\small{
    \begin{tabular*}{0.96\textwidth}[t]{
      l@{\extracolsep{\fill}}c@{\extracolsep{\fill}}r
    }
      \textbf{#1} & \textit{#2} & #3
    \end{tabular*}
  }
}

\newcommand{\resumeHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeHeadingListEnd}{\end{itemize}}

% ── Malta CV-style macros (accent color: flame orange on dark) ───────────────
\definecolor{mcvAccent}{HTML}{E25822}
\definecolor{mcvMuted}{HTML}{555555}
\setlength\multicolsep{0pt}

% \cvsection{Title} — colored bold heading + rule
\newcommand{\cvsection}[1]{%
  \vspace{8pt}%
  {\color{mcvAccent}\large\bfseries\scshape #1}%
  \vspace{2pt}\\*%
  {\color{mcvAccent}\hrule height 0.6pt}%
  \vspace{4pt}%
}

% \cvexperience{Role}{Company}{Date}{Location}{Keywords}
\newcommand{\cvexperience}[5]{%
  \vspace{2pt}%
  \begin{tabular*}{\textwidth}[t]{l@{\extracolsep{\fill}}r}%
    \textbf{#1} {\color{mcvMuted}\textit{at}} \textbf{#2} & {\color{mcvMuted}\small #3}\\%
    {\color{mcvMuted}\small #4} & \\%
  \end{tabular*}%
  \ifx&#5&\else{\vspace{1pt}\textit{\color{mcvMuted}\small Tags: #5}\vspace{2pt}}\fi%
}

% \cvuniversity{Degree}{Institution}{Date}{Location}
\newcommand{\cvuniversity}[4]{%
  \vspace{2pt}%
  \begin{tabular*}{\textwidth}[t]{l@{\extracolsep{\fill}}r}%
    \textbf{#1} & {\color{mcvMuted}\small #3}\\%
    \textit{\small #2} & {\color{mcvMuted}\small #4}\\%
  \end{tabular*}%
  \vspace{2pt}%
}

% \cvlistitem{Name}{Detail} — used inside multicols or plain itemize
\newcommand{\cvlistitem}[2]{\item{\small\textbf{#1}\ifx&#2&\else{ --- \textit{#2}}\fi}}
\newcommand{\cvliststart}{\begin{itemize}[leftmargin=*, nosep, topsep=0pt]}
\newcommand{\cvlistend}{\end{itemize}}

% \bio{text} — italic summary paragraph
\newcommand{\bio}[1]{\vspace{4pt}\textit{\small #1}\vspace{6pt}}
% ─────────────────────────────────────────────────────────────────────────────

\begin{document}

% RESUME-CONTACT-BLOCK-START — parsed and edited by the structured editor.
% Edits via the editor splice this entire block; manual tweaks here are fine,
% just keep the start/end markers so the parser can find it.
\begin{tabular*}{\textwidth}{l@{\extracolsep{\fill}}r}
  \textbf{\Huge {contact_name} \vspace{2pt}} &
  Location: {contact_location} \\

"""

_LATEX_PREAMBLE_CONTACT_ROWS = (
    r"  \href{"
    + "{contact_website_url}"
    + r"}{\uline{"
    + "{contact_website}"
    + r"}} $|$\n"
    + r"  \href{"
    + "{contact_linkedin_url}"
    + r"}{\uline{"
    + "{contact_linkedin}"
    + r"}} $|$\n"
    + r"  \href{"
    + "{contact_github_url}"
    + r"}{\uline{"
    + "{contact_github}"
    + r"}}"
    + "\n"
    + r"  &"
    + "\n"
    + r"  Email: \href{mailto:"
    + "{contact_email_mailto}"
    + r"}{\uline{"
    + "{contact_email}"
    + r"}} $|$\n"
    + r"  Mobile: {contact_phone} \\"
    + "\n"
    + r"\end{tabular*}"
    + "\n"
    + r"% RESUME-CONTACT-BLOCK-END"
    + "\n"
)

_LATEX_PREAMBLE = _LATEX_PREAMBLE + _LATEX_PREAMBLE_CONTACT_ROWS

_LATEX_FOOTER = r"""
\end{document}
"""

# Default contact info — lives in the LaTeX header. Must be set via env vars.
# The editor can also override these per-folder via the structured `contact`
# field on `ParsedResume`.
DEFAULT_CONTACT: Dict[str, str] = {
    "name":          os.environ.get("CONTACT_NAME",          ""),
    "location":      os.environ.get("CONTACT_LOCATION",      ""),
    "website":       os.environ.get("CONTACT_WEBSITE",       ""),
    "website_url":   os.environ.get("CONTACT_WEBSITE_URL",   ""),
    "linkedin":      os.environ.get("CONTACT_LINKEDIN",      ""),
    "linkedin_url":  os.environ.get("CONTACT_LINKEDIN_URL",  ""),
    "github":        os.environ.get("CONTACT_GITHUB",        "GitHub"),
    "github_url":    os.environ.get("CONTACT_GITHUB_URL",    ""),
    "email":         os.environ.get("CONTACT_EMAIL",         ""),
    "email_mailto":  "",
    "phone":         os.environ.get("CONTACT_PHONE",         ""),
}

_PROFILE_EMAIL_RE = re.compile(
    r"\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b",
    re.IGNORECASE,
)
_PROFILE_PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b",
)
_PROFILE_LINKEDIN_RE = re.compile(
    r"(?:https?://)?(?:www\.)?linkedin\.com/(?:in|pub)/[\w\-]+/?",
    re.IGNORECASE,
)
_PROFILE_GITHUB_RE = re.compile(
    r"(?:https?://)?(?:www\.)?github\.com/[\w\-]+(?:/[\w\-]+)?/?",
    re.IGNORECASE,
)

# Shown in LaTeX \uline{…} only when URL exists — hide default labels with no href target.
_DEFAULT_CONTACT_LINK_LABELS = frozenset({"Website", "LinkedIn", "GitHub"})


def _ingest_contact_token(token: str, out: Dict[str, str]) -> None:
    """Parse one pipe- or space-delimited fragment into contact fields (best-effort)."""
    p = (token or "").strip()
    if len(p) < 3:
        return
    low = p.lower()

    em = _PROFILE_EMAIL_RE.search(p)
    if em and not out.get("email"):
        out["email"] = em.group(0).strip()
    ph = _PROFILE_PHONE_RE.search(p)
    if ph and not out.get("phone"):
        out["phone"] = ph.group(0).strip()

    if not out.get("linkedin_url") and "linkedin.com" in low:
        li = _PROFILE_LINKEDIN_RE.search(p)
        if li:
            u = li.group(0).strip()
            if not u.lower().startswith("http"):
                u = "https://" + u.lstrip("/")
            out["linkedin_url"] = u
            out.setdefault("linkedin", "LinkedIn")
        return
    if not out.get("github_url") and "github.com" in low:
        gh = _PROFILE_GITHUB_RE.search(p)
        if gh:
            u = gh.group(0).strip()
            if not u.lower().startswith("http"):
                u = "https://" + u.lstrip("/")
            out["github_url"] = u
            out.setdefault("github", "GitHub")
        return
    if low.startswith("http") and "linkedin.com" not in low and "github.com" not in low:
        if not out.get("website_url"):
            out["website_url"] = p
            out.setdefault("website", "Website")


def _contact_tokens_from_lines(lines: List[str], out: Dict[str, str]) -> None:
    """Scan first lines for pipe- or bullet-separated email / phone / URLs (common PDF header)."""
    for raw in lines[:8]:
        seg = re.sub(r"^[\s•\-–*]+", "", raw).strip()
        if not seg or len(seg) > 220:
            continue
        if re.match(
            r"^(experience|education|skills|projects|summary|objective|work|employment)\b",
            seg,
            re.I,
        ):
            continue
        if "|" in seg or "·" in seg or "\u00b7" in seg or "•" in seg:
            for part in re.split(r"\s*[|·•\u00b7]\s*", seg):
                _ingest_contact_token(part, out)
        elif sum(
            bool(x)
            for x in (
                _PROFILE_EMAIL_RE.search(seg),
                _PROFILE_PHONE_RE.search(seg),
                re.search(r"linkedin\.com|github\.com|https?://", seg, re.I),
            )
        ) >= 2:
            for part in re.split(r"\s{2,}|\t+", seg):
                _ingest_contact_token(part, out)


def _latex_escape_visible(s: str) -> str:
    """Escape user text embedded in LaTeX arguments (\\uline, \\textbf, etc.)."""
    if not s:
        return ""
    return (
        s.replace("\\", r"\textbackslash{}")
        .replace("{", r"\{")
        .replace("}", r"\}")
        .replace("&", r"\&")
        .replace("%", r"\%")
        .replace("$", r"\$")
        .replace("#", r"\#")
        .replace("_", r"\_")
        .replace("^", r"\textasciicircum{}")
        .replace("~", r"\textasciitilde{}")
    )


def _latex_href_url(url: str) -> str:
    """Make URL safe inside \\href{...}{} for pdflatex + hyperref."""
    if not (url or "").strip() or (url or "").strip() == "#":
        return "#"
    u = url.strip()
    return u.replace("%", r"\%").replace("#", r"\#")


def _latex_mailto_href_arg(email: str) -> str:
    """Minimal escaping for mailto: URL inside \\href (LaTeX + hyperref)."""
    if not email:
        return ""
    return email.replace("%", r"\%").replace("#", r"\#")


def _contact_from_candidate_profile(candidate_profile: Optional[str]) -> Dict[str, str]:
    """Pull contact fields from the multiline profile the UI sends with generate-stream."""
    out: Dict[str, str] = {}
    if not candidate_profile or not str(candidate_profile).strip():
        return out
    text = str(candidate_profile).strip()
    lines = [
        re.sub(r"^[\s•\-–*]+", "", ln).strip()
        for ln in text.replace("\r\n", "\n").split("\n")
        if ln.strip()
    ]

    m = re.search(r"(?im)^Name:\s*(.+)$", text)
    if m:
        out["name"] = m.group(1).strip()

    m = re.search(r"(?im)^Location:\s*(.+)$", text)
    if m:
        out["location"] = m.group(1).strip()

    for pat in (
        r"(?im)^E-?mail:\s*([^\s|]+)",
        r"(?im)^Email:\s*([^\s|]+)",
    ):
        m = re.search(pat, text)
        if m and "@" in m.group(1):
            out["email"] = m.group(1).strip()
            break

    for pat in (
        r"(?im)^(?:Tel|Telephone|Phone|Mobile):\s*([^|\n]+)",
        r"(?im)^Phone:\s*([^|\n]+)",
        r"(?im)^Mobile:\s*([^|\n]+)",
    ):
        m = re.search(pat, text)
        if m:
            out["phone"] = m.group(1).strip()
            break

    m = re.search(r"(?im)^LinkedIn:\s*(\S+)", text)
    if m:
        u = m.group(1).strip()
        if "linkedin.com" in u.lower():
            if not u.lower().startswith("http"):
                u = "https://" + u.lstrip("/")
            out["linkedin_url"] = u
            out.setdefault("linkedin", "LinkedIn")

    m = re.search(r"(?im)^GitHub:\s*(\S+)", text)
    if m:
        u = m.group(1).strip()
        if "github.com" in u.lower():
            if not u.lower().startswith("http"):
                u = "https://" + u.lstrip("/")
            out["github_url"] = u
            out.setdefault("github", "GitHub")

    m = re.search(r"(?im)^(?:Website|Portfolio|URL):\s*([^\n|]+)", text)
    if m:
        w = m.group(1).strip()
        if w.lower().startswith("http"):
            out["website_url"] = w
            out.setdefault("website", "Website")
        elif w:
            out["website"] = w

    # Pipe- / bullet-separated header lines (very common in PDF extracts).
    _contact_tokens_from_lines(lines, out)

    # Heuristic fallbacks — candidate text is often raw PDF extract without "Name:" lines.
    if not out.get("email"):
        em = _PROFILE_EMAIL_RE.search(text)
        if em:
            out["email"] = em.group(0).strip()
    if not out.get("phone"):
        ph = _PROFILE_PHONE_RE.search(text)
        if ph:
            out["phone"] = ph.group(0).strip()
    if not out.get("linkedin_url"):
        li = _PROFILE_LINKEDIN_RE.search(text)
        if li:
            u = li.group(0).strip()
            if not u.lower().startswith("http"):
                u = "https://" + u.lstrip("/")
            out["linkedin_url"] = u
            out.setdefault("linkedin", "LinkedIn")
    if not out.get("github_url"):
        gh = _PROFILE_GITHUB_RE.search(text)
        if gh:
            u = gh.group(0).strip()
            if not u.lower().startswith("http"):
                u = "https://" + u.lstrip("/")
            out["github_url"] = u
            out.setdefault("github", "GitHub")
    if not out.get("name"):
        for line in lines[:14]:
            if len(line) > 55 or len(line) < 3:
                continue
            if _PROFILE_EMAIL_RE.search(line) or _PROFILE_PHONE_RE.search(line) or re.search(
                r"https?:", line, re.I
            ):
                continue
            if re.match(
                r"^(experience|education|skills|projects|summary|objective|work|employment)\b",
                line,
                re.I,
            ):
                continue
            if re.match(r"^\d{4}\s*[-–]\s*", line):
                continue
            words = line.split()
            if 2 <= len(words) <= 6 and re.match(r"^[A-Za-z.'\s\-]+$", line):
                out["name"] = line
                break

    return out


def _strip_contact_block_empty_hrefs(tex: str) -> str:
    """Remove empty \\href{#}{\\uline{}} link slots and stray $|$ so the PDF header is not a thin pipe row."""
    start = tex.find("% RESUME-CONTACT-BLOCK-START")
    end = tex.find("% RESUME-CONTACT-BLOCK-END")
    if start == -1 or end == -1 or end <= start:
        return tex
    head, mid, tail = tex[:start], tex[start:end], tex[end:]
    chunk = mid
    for _ in range(40):
        nxt = re.sub(r"\s*\\href\{#\}\{\\uline\{\}\}\s*(?:\$\|\$\s*)?", "", chunk)
        nxt = re.sub(r"\s*\\href\{#\}\{\\uline\{\s*\}\}\s*(?:\$\|\$\s*)?", "", nxt)
        if nxt == chunk:
            break
        chunk = nxt
    chunk = re.sub(r"(?:\s*\$\|\$\s*){2,}", r" $|$ ", chunk)
    chunk = re.sub(r"(?m)^(\s*)\$\|\$\s*$", r"\1", chunk)
    return head + chunk + tail


def _canonical_contact_fragment() -> str:
    """Marked contact tabular from the canonical preamble (for splicing after template \\begin{document})."""
    s = _LATEX_PREAMBLE
    start_m = "% RESUME-CONTACT-BLOCK-START"
    end_m = "% RESUME-CONTACT-BLOCK-END"
    a = s.find(start_m)
    b = s.find(end_m)
    if a == -1 or b == -1:
        return ""
    return s[a : b + len(end_m)] + "\n"


def _inject_latex_packages_before_document(pre: str, packages: List[str]) -> str:
    if not packages:
        return pre
    return pre.rstrip() + "\n" + "\n".join(packages) + "\n"


def _build_export_preamble(
    reference_tex: Optional[str],
    role: str,
    company: str,
    contact: Optional[Dict[str, str]],
) -> str:
    """Use the selected reference template preamble when possible; always emit a filled contact block."""
    frag = _canonical_contact_fragment()
    rt = (reference_tex or "").strip()
    if rt and "\\begin{document}" in rt and frag:
        pre_doc, sep, _rest = rt.partition("\\begin{document}")
        if sep:
            pre_doc = pre_doc.rstrip() + "\n"
            low = pre_doc.lower()
            adds: List[str] = []
            if "hyperref" not in low:
                adds.append("\\usepackage[hidelinks]{hyperref}")
            if "ulem" not in low:
                adds.append("\\usepackage[normalem]{ulem}")
            pre_doc = _inject_latex_packages_before_document(pre_doc, adds)
            combined = pre_doc + "\\begin{document}\n" + frag
            return _apply_preamble_subs(combined, role, company, contact)
    return _apply_preamble_subs(_LATEX_PREAMBLE, role, company, contact)


def _apply_preamble_subs(preamble: str, role: str, company: str, contact: Optional[Dict[str, str]] = None) -> str:
    """Fill the {role}/{company}/{contact_*} placeholders in the LaTeX preamble.

    Centralized so `_save_and_compile` and any future caller stay in sync.
    Unknown contact fields fall back to DEFAULT_CONTACT so a partial override
    (just changing the email, say) still works.
    """
    out = preamble.replace("{role}", role).replace("{company}", company)
    merged: Dict[str, str] = {**DEFAULT_CONTACT, **(contact or {})}

    for uk, vk in (
        ("website_url", "website"),
        ("linkedin_url", "linkedin"),
        ("github_url", "github"),
    ):
        u = (merged.get(uk) or "").strip()
        if not u:
            merged[uk] = "#"
            v = (merged.get(vk) or "").strip()
            if v in _DEFAULT_CONTACT_LINK_LABELS or not v:
                merged[vk] = ""
        else:
            merged[uk] = u

    url_keys = ("website_url", "linkedin_url", "github_url")
    vis_keys = ("name", "location", "phone", "linkedin", "github", "website")
    raw_email = (merged.get("email") or "").strip()
    merged["email_mailto"] = _latex_mailto_href_arg(raw_email)

    for key, val in list(merged.items()):
        if not isinstance(val, str):
            merged[key] = str(val) if val is not None else ""

    for key, val in merged.items():
        raw = val if isinstance(val, str) else ""
        if key in url_keys:
            raw = _latex_href_url(raw)
        elif key == "email_mailto":
            pass
        elif key == "email":
            raw = _latex_escape_visible(raw_email) if raw_email else ""
        elif key in vis_keys:
            raw = _latex_escape_visible(raw) if raw else ""
        out = out.replace("{contact_" + key + "}", raw)

    out = re.sub(
        r"Email:\s*\\href\{mailto:\}\{\\uline\{\}\}\s*\$\|\$\s*",
        "",
        out,
    )
    out = _strip_contact_block_empty_hrefs(out)
    return out


# ============================================================================
# READ — list and inspect existing resumes
# ============================================================================

def list_resumes() -> List[Dict]:
    if not os.path.isdir(LIBRARY_ROOT):
        return []
    results = []
    for folder in sorted(os.listdir(LIBRARY_ROOT)):
        folder_path = os.path.join(LIBRARY_ROOT, folder)
        if not os.path.isdir(folder_path):
            continue
        files = os.listdir(folder_path)
        tex_files = [f for f in files if f.endswith(".tex")]
        pdf_files = [f for f in files if f.endswith(".pdf")]
        results.append({
            "folder": folder,
            "path": folder_path,
            "tex_files": tex_files,
            "pdf_files": pdf_files,
            "has_pdf": bool(pdf_files),
        })
    return results


def get_resume_tex(folder: str) -> Optional[str]:
    folder_path = os.path.join(LIBRARY_ROOT, folder)
    if not os.path.isdir(folder_path):
        return None
    for filename in os.listdir(folder_path):
        if filename.endswith(".tex"):
            with open(os.path.join(folder_path, filename), "r", encoding="utf-8") as f:
                return f.read()
    return None


def _get_resume_tex_for_user(folder: str, user_id: Optional[str] = None) -> Optional[str]:
    """Read a resume source locally first, then from Supabase Storage for a user."""
    tex = get_resume_tex(folder)
    if tex or not user_id or user_id == "local":
        return tex

    try:
        try:
            from resume_gui.storage import download_tex  # type: ignore
        except ImportError:
            from storage import download_tex  # type: ignore
        tex = download_tex(user_id, folder)
        if tex:
            logger.info(f"Loaded .tex from Supabase Storage  |  {folder}  |  user={user_id}")
        return tex
    except Exception as exc:
        logger.warning(f"Supabase .tex load failed  |  folder={folder}  |  user={user_id}  |  {exc}")
        return None


def _extract_body(full_tex: str) -> str:
    """Pull just the content between \\begin{document} and \\end{document}."""
    if "\\begin{document}" in full_tex:
        body = full_tex.split("\\begin{document}", 1)[1]
        if "\\end{document}" in body:
            body = body.rsplit("\\end{document}", 1)[0]
        return body.strip()
    return full_tex.strip()


# ─────────────────────────────────────────────────────────────────────────────
# Resume tree parser & save-back — powers the post-analysis bullet editor.
#
# We only parse what the user can EDIT: sections, entry headers, and bullets.
# Everything else (preamble, macros, list-start/end markers) stays as-is in
# the original .tex; on save we splice individual `\resumeItem{...}` lines
# back into the original text by line number. Lossless round-trip, no
# template-format guessing.
# ─────────────────────────────────────────────────────────────────────────────

_SECTION_RE       = re.compile(r"\\section\*?\{([^}]*)\}")
_QUAD_HEADING_RE  = re.compile(r"\\resumeQuadHeading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}")
_TRIO_HEADING_RE  = re.compile(r"\\resumeTrioHeading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}")
# Match `\resumeItem{...}` allowing balanced braces inside via a (deliberately
# non-greedy) outer match; we then strip braces ourselves to avoid pulling in
# trailing tokens like `\resumeItemListEnd` if a bullet contains a `}`.
_RESUME_ITEM_RE   = re.compile(r"\\resumeItem\{(.*)\}\s*$")

# Sections we never let the editor touch. (Was {"education"} originally per
# user request — they later asked to allow editing Education too.) Kept as a
# named constant in case we ever want to lock a section again.
_LOCKED_SECTIONS: set = set()


def _latex_to_plain(s: str) -> str:
    """LaTeX → editor-friendly plain text. We intentionally only undo the few
    transformations the user is likely to recognize; everything else is left
    as-is so a power-user can still work in raw LaTeX if they want."""
    s = re.sub(r"\\textbf\{([^}]*)\}", r"**\1**", s)
    s = re.sub(r"\\textit\{([^}]*)\}", r"*\1*",   s)
    s = s.replace(r"\&", "&").replace(r"\%", "%").replace(r"\$", "$").replace(r"\#", "#")
    s = s.replace(r"\textendash", "–").replace(r"\textemdash", "—")
    return s.strip()


def _plain_to_latex(s: str) -> str:
    """Inverse of `_latex_to_plain`. Conservative — escapes only the
    characters that would otherwise blow up pdflatex."""
    # Bold first — order matters because escape would mangle the `**` markers.
    s, _ = _markdown_to_latex_bold(s)
    s = re.sub(r"(?<!\*)\*([^*\n]+?)\*(?!\*)", r"\\textit{\1}", s)
    # Escape LaTeX specials that aren't already part of a command. We skip
    # backslash itself — assume any `\command` the user typed is intentional.
    s = (s.replace("&", r"\&")
           .replace("%", r"\%")
           .replace("$", r"\$")
           .replace("#", r"\#"))
    # But un-escape inside our own \textbf{...} so we don't double-escape.
    return s


def _quad_to_header(m: "re.Match[str]") -> str:
    a, b, c, d = m.group(1), m.group(2), m.group(3), m.group(4)
    parts = [_latex_to_plain(p) for p in (a, b, c, d) if p.strip()]
    return " · ".join(parts)


def _trio_to_header(m: "re.Match[str]") -> str:
    a, b, c = m.group(1), m.group(2), m.group(3)
    parts = [_latex_to_plain(p) for p in (a, b, c) if p.strip()]
    return " · ".join(parts)


_CONTACT_START = "% RESUME-CONTACT-BLOCK-START"
_CONTACT_END   = "% RESUME-CONTACT-BLOCK-END"


def _parse_contact_block(full_tex: str) -> Optional[Dict]:
    """Detect and parse the contact header.

    We look for a marker-bracketed block (`% RESUME-CONTACT-BLOCK-START`/`-END`)
    first — that's what new generations emit. Older resumes don't have the
    markers; for those, we fall back to scanning the first `\\begin{tabular*}`
    block after `\\begin{document}` and pulling whatever fields we can.

    Returns:
        {
          "blockStart": int,   # 0-based line index, inclusive
          "blockEnd":   int,   # inclusive
          "name":       str,
          "location":   str,
          "website":      str, "websiteUrl":  str,
          "linkedin":     str, "linkedinUrl": str,
          "github":       str, "githubUrl":   str,
          "email":      str,
          "phone":      str,
          "marked":     bool,  # True if found via markers, False if heuristic
        }
        or None if no contact block found at all.
    """
    lines = full_tex.splitlines()
    block_start = block_end = -1
    marked = False

    # Strategy 1: marker block (preferred)
    for i, ln in enumerate(lines):
        if _CONTACT_START in ln and block_start == -1:
            block_start = i
        elif _CONTACT_END in ln and block_start != -1:
            block_end = i
            marked = True
            break

    # Strategy 2: heuristic — first tabular* block after \begin{document}
    if block_start == -1 or block_end == -1:
        in_doc = False
        for i, ln in enumerate(lines):
            if not in_doc:
                if "\\begin{document}" in ln:
                    in_doc = True
                continue
            if "\\section" in ln:
                break  # gave up — went past where contact should be
            if "\\begin{tabular*}" in ln and block_start == -1:
                block_start = i
                continue
            if block_start != -1 and "\\end{tabular*}" in ln:
                block_end = i
                break
        if block_start == -1 or block_end == -1:
            return None

    block_text = "\n".join(lines[block_start : block_end + 1])

    def _grab(pattern: str, default: str = "") -> str:
        m = re.search(pattern, block_text, re.S)
        return m.group(1).strip() if m else default

    # Name: `\textbf{\Huge NAME \vspace{2pt}}` — NAME may have spaces.
    name = _grab(r"\\textbf\{\\Huge\s+([^}\\]+?)\s*\\vspace")
    if not name:
        name = _grab(r"\\Huge\s+([^}\\]+)")

    location = _grab(r"Location:\s*([^\\]+?)\s*\\\\")
    location_label = _grab(r"([^:\\]+):\s*[^\\]+?\s*\\\\") or "Location"

    # Three \href{URL}{\uline{TEXT}} pairs in order: website, linkedin, github.
    href_iter = list(re.finditer(r"\\href\{([^{}]*)\}\{\\uline\{([^{}]*)\}\}", block_text))

    def _hp(idx: int) -> Tuple[str, str]:
        if idx < len(href_iter):
            m = href_iter[idx]
            return m.group(1).strip(), m.group(2).strip()
        return "", ""

    website_url,  website  = _hp(0)
    linkedin_url, linkedin = _hp(1)
    github_url,   github   = _hp(2)

    # Email: prefer the mailto: link, fall back to the visible text.
    email = _grab(r"mailto:([^\s}]+)")
    if not email:
        email = _grab(r"Email:\s*\\href\{[^}]*\}\{\\uline\{([^}]+)\}\}")

    phone = _grab(r"Mobile:\s*([^\\]+?)\s*\\\\")
    email_label = _grab(r"([^:\\]+):\s*\\href\{mailto:") or "Email"
    phone_label = _grab(r"\$\|\s*([^:\\]+):\s*[^\\]+?\s*\\\\") or "Mobile"

    return {
        "blockStart":   block_start,
        "blockEnd":     block_end,
        "name":         name,
        "location":     location,
        "locationLabel": location_label,
        "website":      website,
        "websiteUrl":   website_url,
        "linkedin":     linkedin,
        "linkedinUrl":  linkedin_url,
        "github":       github,
        "githubUrl":    github_url,
        "email":        email,
        "phone":        phone,
        "emailLabel":   email_label,
        "phoneLabel":   phone_label,
        "customFields": [],
        "marked":       marked,
    }


def _render_contact_block(contact: Dict) -> List[str]:
    """Render a parsed contact dict back into LaTeX lines (with start/end markers).

    Output mirrors the template baked into _LATEX_PREAMBLE so the on-disk file
    stays human-readable and the parser can re-read it on the next round-trip.
    Empty fields render as empty strings — pdflatex handles this gracefully.
    """
    def esc(s: str) -> str:
        # Escape LaTeX-special chars in user-supplied text. URLs are passed
        # through as-is (they live inside \href{...} which doesn't apply most
        # special-char rules to the URL arg).
        return (s or "").replace("&", r"\&").replace("%", r"\%").replace("#", r"\#")

    name      = esc(contact.get("name", ""))
    location  = esc(contact.get("location", ""))
    location_label = esc(contact.get("locationLabel", "Location") or "Location")
    website     = esc(contact.get("website", ""))
    website_url = (contact.get("websiteUrl") or "").strip()
    linkedin     = esc(contact.get("linkedin", ""))
    linkedin_url = (contact.get("linkedinUrl") or "").strip()
    github       = esc(contact.get("github", "GitHub"))
    github_url   = (contact.get("githubUrl") or "").strip()
    email     = (contact.get("email") or "").strip()
    email_label = esc(contact.get("emailLabel", "Email") or "Email")
    phone     = esc(contact.get("phone", ""))
    phone_label = esc(contact.get("phoneLabel", "Mobile") or "Mobile")
    custom_fields = contact.get("customFields") if isinstance(contact.get("customFields"), list) else []

    extra_lines: List[str] = []
    for f in custom_fields:
        if not isinstance(f, dict):
            continue
        label = esc((f.get("label") or "").strip())
        value = esc((f.get("value") or "").strip())
        if not label and not value:
            continue
        extra_lines.append(f"  {label or 'Field'}: {value} \\\\")

    return [
        _CONTACT_START,
        r"\begin{tabular*}{\textwidth}{l@{\extracolsep{\fill}}r}",
        f"  \\textbf{{\\Huge {name} \\vspace{{2pt}}}} &",
        f"  {location_label}: {location} \\\\",
        "",
        f"  \\href{{{website_url}}}{{\\uline{{{website}}}}} $|$",
        f"  \\href{{{linkedin_url}}}{{\\uline{{{linkedin}}}}} $|$",
        f"  \\href{{{github_url}}}{{\\uline{{{github}}}}}",
        "  &",
        f"  {email_label}: \\href{{mailto:{email}}}{{\\uline{{{email}}}}} $|$",
        f"  {phone_label}: {phone} \\\\",
        *extra_lines,
        r"\end{tabular*}",
        _CONTACT_END,
    ]


def parse_resume_tex(full_tex: str) -> Dict:
    """
    Parse a saved .tex resume into a structured tree the editor can manipulate.

    Returns the JSON shape consumed by web/lib/types.ts → ParsedResume:
        {
          "rawTex":   <original .tex>,
          "sections": [
            {"name", "editable", "sectionStartLine", "sectionEndLine", "entries": [
              {"header", "headerLine", "bulletBlockStart", "bulletBlockEnd",
               "indent", "useListMacros",
               "bullets": [{"id", "text", "texLine"}]}
            ]}
          ]
        }

    Per-entry bookkeeping powers the block-rewrite save path used by Phase 3
    (add / delete / reorder). `bulletBlockStart` / `bulletBlockEnd` describe
    the *inclusive* line range the entry "owns" for its bullets — either the
    range bracketed by `\\resumeItemListStart` / `\\resumeItemListEnd`, or
    just the contiguous run of `\\resumeItem{...}` lines if no markers exist
    (Summary / Skills sections work that way). On save we drop those lines
    and emit a fresh block built from the current bullet list.
    """
    # Walk the full .tex line-by-line so `texLine` indices are guaranteed to
    # round-trip with the on-disk file. We skip everything until we cross
    # `\begin{document}` (and stop at `\end{document}`) so preamble macros
    # never accidentally look like content.
    sections: List[Dict] = []
    cur_section: Optional[Dict] = None
    cur_entry:   Optional[Dict] = None
    bullet_counter = 0
    in_body = False  # flips true on the line AFTER \begin{document}
    in_item_list = False  # tracking \resumeItemListStart / End

    all_lines = full_tex.splitlines()
    has_doc_marker = any("\\begin{document}" in ln for ln in all_lines)
    if not has_doc_marker:
        in_body = True  # treat the whole file as body when no marker present

    def _new_entry(header: str, header_line: int, indent: str) -> Dict:
        return {
            "header":           header,
            "headerLine":       header_line,
            "indent":           indent,
            "useListMacros":    False,   # set true when we see \resumeItemListStart
            "bulletBlockStart": -1,       # inclusive start (line index, full-tex)
            "bulletBlockEnd":   -1,       # inclusive end
            "bullets":          [],
        }

    for line_in_full, line in enumerate(all_lines):
        if not in_body:
            if "\\begin{document}" in line:
                in_body = True
            continue
        if "\\end{document}" in line:
            break
        stripped = line.strip()
        leading_ws = line[: len(line) - len(line.lstrip())]

        # --- Section boundary ---
        m = _SECTION_RE.search(stripped)
        if m:
            name = m.group(1).strip()
            editable = name.lower() not in _LOCKED_SECTIONS
            cur_section = {
                "name":             name,
                "editable":         editable,
                "sectionStartLine": line_in_full,
                "entries":          [],
            }
            sections.append(cur_section)
            cur_entry = None
            in_item_list = False
            continue

        if cur_section is None:
            continue  # skip whatever sits before the first \section

        # --- List markers — track them so we know whether to wrap on save ---
        if "\\resumeItemListStart" in stripped:
            if cur_entry is not None:
                cur_entry["useListMacros"]    = True
                cur_entry["bulletBlockStart"] = line_in_full  # the marker line itself
                in_item_list = True
            continue
        if "\\resumeItemListEnd" in stripped:
            if cur_entry is not None and cur_entry["bulletBlockStart"] != -1:
                cur_entry["bulletBlockEnd"] = line_in_full
            in_item_list = False
            continue

        # --- Entry header (Quad / Trio) ---
        mq = _QUAD_HEADING_RE.search(stripped)
        if mq:
            cur_entry = _new_entry(_quad_to_header(mq), line_in_full, leading_ws)
            cur_section["entries"].append(cur_entry)
            in_item_list = False
            continue
        mt = _TRIO_HEADING_RE.search(stripped)
        if mt:
            cur_entry = _new_entry(_trio_to_header(mt), line_in_full, leading_ws)
            cur_section["entries"].append(cur_entry)
            in_item_list = False
            continue

        # --- Bullet ---
        mi = _RESUME_ITEM_RE.search(stripped)
        if mi:
            raw = mi.group(1)
            # Strip a single trailing `}` if present (common when the inner text
            # itself contains a brace — our regex was greedy by design).
            if raw.endswith("}"):
                raw = raw[:-1]
            text = _latex_to_plain(raw)
            if cur_entry is None:
                # Bullet without a preceding entry header (e.g. Skills section).
                cur_entry = _new_entry("", line_in_full, leading_ws)
                cur_section["entries"].append(cur_entry)
            bullet_counter += 1
            cur_entry["bullets"].append({
                "id":      f"b{bullet_counter}",
                "text":    text,
                "texLine": line_in_full,
            })
            # Track the contiguous-run block range for non-list-macro entries.
            if not in_item_list:
                if cur_entry["bulletBlockStart"] == -1:
                    cur_entry["bulletBlockStart"] = line_in_full
                cur_entry["bulletBlockEnd"] = line_in_full

    # Section end-line = line of next section minus 1, or end-of-document.
    for idx, sec in enumerate(sections):
        if idx + 1 < len(sections):
            sec["sectionEndLine"] = sections[idx + 1]["sectionStartLine"] - 1
        else:
            # Find \end{document} and cap there.
            for j, ln in enumerate(all_lines):
                if "\\end{document}" in ln:
                    sec["sectionEndLine"] = j - 1
                    break
            else:
                sec["sectionEndLine"] = len(all_lines) - 1

    # Free-text paragraph capture (Summary / Objective sections).
    # The LLM sometimes emits Summary as a `\section{Summary}\n<prose>` block
    # with no `\resumeItem{}` wrapper. Without this pass, the editor shows
    # "0 bullets" and the user can't edit the summary at all.
    #
    # Strategy: for any section that has zero entries, scan the lines between
    # its sectionStartLine and sectionEndLine for prose lines (no `\command`
    # at start, non-empty after strip). Group contiguous prose into a single
    # synthetic entry/bullet with block range covering all those lines.
    for sec in sections:
        if sec.get("entries"):
            continue
        start = sec.get("sectionStartLine", -1) + 1
        end   = sec.get("sectionEndLine",   -1)
        if start < 0 or end < start:
            continue
        # Find contiguous prose lines, skipping leading blanks / structural macros.
        prose_lines: List[Tuple[int, str]] = []
        for j in range(start, min(end + 1, len(all_lines))):
            ln = all_lines[j]
            s  = ln.strip()
            if not s:
                if prose_lines:
                    break  # blank line after prose ends the paragraph
                continue
            # Skip pure structural macro lines (no surrounding text).
            if s.startswith("\\") and ("{" not in s or s.endswith("}")) and re.match(r"^\\[a-zA-Z]+\*?(\{[^}]*\})?\s*$", s):
                if prose_lines:
                    break
                continue
            prose_lines.append((j, ln))
        if not prose_lines:
            continue
        first_idx = prose_lines[0][0]
        last_idx  = prose_lines[-1][0]
        # `\small{...}` wrapper is common — strip the wrapping macro for editing.
        joined = " ".join(l for _, l in prose_lines).strip()
        joined = re.sub(r"^\\small\s*\{", "", joined)
        if joined.endswith("}"):
            joined = joined[:-1]
        bullet_counter += 1
        leading_ws = all_lines[first_idx][: len(all_lines[first_idx]) - len(all_lines[first_idx].lstrip())]
        synthetic_entry: Dict = {
            "header":           "",
            "headerLine":       -1,
            "indent":           leading_ws,
            "useListMacros":    False,
            "bulletBlockStart": first_idx,
            "bulletBlockEnd":   last_idx,
            "bullets":          [{
                "id":      f"b{bullet_counter}",
                "text":    _latex_to_plain(joined),
                "texLine": first_idx,
                # Marker so the splicer knows to emit this as a paragraph
                # (no `\resumeItem{}` wrapper) on save — see splice_bullets_into_tex.
                "isProse": True,
            }],
        }
        sec["entries"].append(synthetic_entry)

    contact = _parse_contact_block(full_tex)
    # If no contact block exists at all, hand the editor a synthetic one
    # pre-filled with the deployment's defaults so the user sees editable
    # fields instead of "(name not set) READ-ONLY". On save, the splicer
    # inserts a fresh marker block right after `\begin{document}`.
    if contact is None:
        contact = {
            "blockStart":   -1,
            "blockEnd":     -1,
            "marked":       False,
            "name":         DEFAULT_CONTACT.get("name", ""),
            "location":     DEFAULT_CONTACT.get("location", ""),
            "locationLabel": "Location",
            "website":      DEFAULT_CONTACT.get("website", ""),
            "websiteUrl":   DEFAULT_CONTACT.get("website_url", ""),
            "linkedin":     DEFAULT_CONTACT.get("linkedin", ""),
            "linkedinUrl":  DEFAULT_CONTACT.get("linkedin_url", ""),
            "github":       DEFAULT_CONTACT.get("github", "GitHub"),
            "githubUrl":    DEFAULT_CONTACT.get("github_url", ""),
            "email":        DEFAULT_CONTACT.get("email", ""),
            "phone":        DEFAULT_CONTACT.get("phone", ""),
            "emailLabel":   "Email",
            "phoneLabel":   "Mobile",
            "customFields": [],
            "synthetic":    True,   # signals to splicer: insert, don't replace
        }
    return {"rawTex": full_tex, "sections": sections, "contact": contact}


def splice_bullets_into_tex(full_tex: str, parsed: Dict) -> str:
    """
    Block-rewrite save path — replaces each entry's bullet block with a fresh
    one built from the parsed tree. This (unlike a per-line splice) lets the
    editor add, delete, and reorder bullets safely.

    Strategy: collect a list of (start, end_inclusive, replacement_lines)
    edits, sort by start descending, and apply them. Doing edits bottom-up
    keeps line indices stable across mutations.

    Locked sections are skipped wholesale — defense in depth on top of the
    frontend lock. If a section has zero bullets after edit, we collapse the
    block to nothing (existing list-macro markers, if any, are kept so the
    template's empty-list rendering stays consistent).
    """
    lines = full_tex.splitlines()
    edits: List[Tuple[int, int, List[str]]] = []

    # Contact block — three cases:
    #   1. Real block (blockStart >= 0): replace it in place.
    #   2. Synthetic block (synthetic=True, blockStart=-1): insert a fresh
    #      marker-bracketed block right after `\begin{document}` so future
    #      reads see a real block.
    #   3. Missing entirely (no contact dict): leave source alone.
    contact = parsed.get("contact")
    if isinstance(contact, dict):
        c_start = contact.get("blockStart", -1)
        c_end   = contact.get("blockEnd",   -1)
        if isinstance(c_start, int) and isinstance(c_end, int) and 0 <= c_start <= c_end < len(lines):
            edits.append((c_start, c_end, _render_contact_block(contact)))
        elif any(contact.get(k) for k in ("name", "email", "phone", "location", "website", "linkedin", "github")):
            # Find `\begin{document}` and insert immediately after it (with a
            # blank line above for breathing room).
            for j, ln in enumerate(lines):
                if "\\begin{document}" in ln:
                    block = [""] + _render_contact_block(contact)
                    # Insert: range (j+1, j) is a 0-length window — splicing
                    # `lines[j+1:j+1]` inserts without removing anything.
                    edits.append((j + 1, j, block))
                    break

    for section in parsed.get("sections", []):
        if not section.get("editable", True):
            continue
        for entry in section.get("entries", []):
            block_start = entry.get("bulletBlockStart", -1)
            block_end   = entry.get("bulletBlockEnd",   -1)
            indent      = entry.get("indent",  "")
            uses_macros = bool(entry.get("useListMacros", False))
            bullets     = entry.get("bullets", [])

            # Build the replacement lines — formatted to match the template.
            new_block: List[str] = []
            # Single-bullet prose entries (synthesized from `\section{Summary}`
            # paragraphs by the parser) round-trip as a `\small{...}` paragraph
            # — NOT a `\resumeItem`. That preserves the original visual style.
            if (len(bullets) == 1 and bullets[0].get("isProse")):
                text = _plain_to_latex(bullets[0].get("text", ""))
                new_block.append(f"{indent}\\small{{{text}}}")
            elif uses_macros:
                # Inner-bullet indent = entry indent + 2 spaces (matches what the
                # generator emits today). pdflatex doesn't care, but a human
                # browsing the .tex will, and so will diff tools.
                inner = indent + "  "
                new_block.append(f"{indent}\\resumeItemListStart")
                for b in bullets:
                    new_block.append(f"{inner}\\resumeItem{{{_plain_to_latex(b.get('text', ''))}}}")
                new_block.append(f"{indent}\\resumeItemListEnd")
            else:
                # Free-floating bullets (Summary / Skills) — emit one per line.
                for b in bullets:
                    new_block.append(f"{indent}\\resumeItem{{{_plain_to_latex(b.get('text', ''))}}}")

            # If the parser never saw an existing block (entry had zero bullets
            # in source AND no list markers), insert immediately after the header.
            if block_start == -1 or block_end == -1:
                header_line = entry.get("headerLine", -1)
                if header_line == -1 or not bullets:
                    continue  # nothing to insert
                # Insert AFTER the header line — so range = (header+1, header), 0-length.
                edits.append((header_line + 1, header_line, new_block))
                continue

            edits.append((block_start, block_end, new_block))

    # Apply bottom-up so earlier indices stay valid as later ranges resize.
    edits.sort(key=lambda e: e[0], reverse=True)
    for start, end, replacement in edits:
        if start < 0 or end >= len(lines) or start > end + 1:
            continue
        lines[start : end + 1] = replacement

    # Preserve original trailing-newline style (pdflatex doesn't care, but a
    # roundtripped file that loses its trailing \n is a noisy git diff).
    return "\n".join(lines) + ("\n" if full_tex.endswith("\n") else "")


def _apply_pdf_layout_to_tex(full_tex: str, layout: Optional[Dict]) -> str:
    """Apply user-selected PDF layout settings to a LaTeX source string."""
    if not isinstance(layout, dict):
        layout = {}

    page_size = str(layout.get("pageSize") or "letter").lower()
    if page_size not in {"a4", "letter"}:
        page_size = "letter"

    density = str(layout.get("density") or "standard").lower()
    if density not in {"compact", "standard", "spacious"}:
        density = "standard"

    try:
        font_scale = int(layout.get("fontScale", 0))
    except Exception:
        font_scale = 0
    if font_scale not in {-1, 0, 1}:
        font_scale = 0

    doc_size = { -1: "10pt", 0: "11pt", 1: "12pt" }[font_scale]
    header_size = { -1: r"\LARGE", 0: r"\Huge", 1: r"\huge" }[font_scale]

    margin_map = {
        "compact":  {"odds": "-0.55in", "top": "-0.35in", "textheight": "1.45in", "textwidth": "1.05in"},
        "standard": {"odds": "-0.50in", "top": "-0.25in", "textheight": "1.30in", "textwidth": "1.00in"},
        "spacious": {"odds": "-0.42in", "top": "-0.15in", "textheight": "1.12in", "textwidth": "0.90in"},
    }[density]

    out = full_tex
    out = re.sub(
        r"\\documentclass\[[^\]]*\]\{article\}",
        rf"\\documentclass[{page_size}paper,{doc_size}]{{article}}",
        out,
        count=1,
    )

    out = re.sub(r"\\addtolength\{\\oddsidemargin\}\{[^}]*\}",  rf"\\addtolength{{\\oddsidemargin}}{{{margin_map['odds']}}}", out, count=1)
    out = re.sub(r"\\addtolength\{\\evensidemargin\}\{[^}]*\}", rf"\\addtolength{{\\evensidemargin}}{{{margin_map['odds']}}}", out, count=1)
    out = re.sub(r"\\addtolength\{\\topmargin\}\{[^}]*\}",      rf"\\addtolength{{\\topmargin}}{{{margin_map['top']}}}", out, count=1)
    out = re.sub(r"\\addtolength\{\\textheight\}\{[^}]*\}",     rf"\\addtolength{{\\textheight}}{{{margin_map['textheight']}}}", out, count=1)
    out = re.sub(r"\\addtolength\{\\textwidth\}\{[^}]*\}",      rf"\\addtolength{{\\textwidth}}{{{margin_map['textwidth']}}}", out, count=1)

    # Keep contact header visible in PDF by adding a tiny top spacer and
    # using the configured heading size.
    out = re.sub(r"\\textbf\{\\Huge\s+", rf"\\textbf{{{header_size} ", out, count=1)
    if "\\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}" in out:
        out = out.replace(
            "\\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}",
            "\\vspace*{2pt}\n\\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}",
            1,
        )

    return out


def recompile_resume_from_tex(folder: str, full_tex: str, layout: Optional[Dict] = None) -> Dict:
    """
    Overwrite the .tex file at `folder` with `full_tex`, re-run pdflatex, and
    return {"folder", "tex_path", "pdf_path", "compiled", "compile_error"}.
    Used by POST /api/resume/{folder} after the user edits bullets.
    """
    folder_path = os.path.join(LIBRARY_ROOT, folder)
    if not os.path.isdir(folder_path):
        return {"folder": folder, "tex_path": None, "pdf_path": None,
                "compiled": False, "compile_error": "folder not found"}

    # Find the existing .tex file in the folder.
    tex_files = [f for f in os.listdir(folder_path) if f.endswith(".tex")]
    if not tex_files:
        return {"folder": folder, "tex_path": None, "pdf_path": None,
                "compiled": False, "compile_error": ".tex file not found in folder"}
    filename = tex_files[0]
    tex_path = os.path.join(folder_path, filename)

    rendered_tex = _apply_pdf_layout_to_tex(full_tex, layout)
    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(rendered_tex)
    logger.info(f"Re-saved .tex  |  {tex_path}  |  {len(full_tex)} chars")

    result = {"folder": folder, "folder_path": folder_path, "tex_path": tex_path, "pdf_path": None}

    if not os.path.exists(PDFLATEX):
        result["compiled"]      = False
        result["compile_error"] = "pdflatex not installed"
        logger.warning("pdflatex not found — skipping recompile")
        return result

    logger.info("Re-compiling PDF after edit...")
    t = time.time()
    try:
        proc = subprocess.run(
            [PDFLATEX, "-interaction=nonstopmode", "-output-directory", folder_path, tex_path],
            capture_output=True, text=True, timeout=60,
        )
        pdf_path = os.path.join(folder_path, filename[:-4] + ".pdf")
        if os.path.exists(pdf_path):
            result["pdf_path"] = pdf_path
            result["compiled"] = True
            logger.info(f"PDF re-compiled  |  {time.time()-t:.1f}s")
        else:
            tail = (proc.stdout[-800:] if proc.stdout else "") or (proc.stderr[-800:] if proc.stderr else "")
            result["compiled"]      = False
            result["compile_error"] = tail or f"exit={proc.returncode}"
            logger.warning(f"Re-compile FAILED  |  exit={proc.returncode}\npdflatex tail:\n{tail}")
    except Exception as exc:
        result["compiled"]      = False
        result["compile_error"] = str(exc)
        logger.warning(f"Re-compile EXCEPTION  |  {exc}")
    return result


def ai_rewrite_bullet(bullet_text: str, instruction: str, jd_snippet: str = "") -> str:
    """
    One-shot bullet rewrite for the post-analysis editor's ✨ AI button.

    Uses the same Gemini fallback chain as the main generator. Returns the
    rewritten text or raises on hard failure (the frontend surfaces the
    error in the popover).
    """
    instr = (instruction or "Make this bullet stronger and more quantified.").strip()
    prompt = (
        "You are improving a single resume bullet. Apply the user's instruction "
        "while preserving every concrete fact (companies, technologies, metrics) "
        "in the original. Do NOT invent numbers, dates, or systems. Output ONLY "
        "the rewritten bullet text — no preamble, no quotes, no markdown headers.\n\n"
        f"USER INSTRUCTION: {instr}\n\n"
        f"ORIGINAL BULLET:\n{bullet_text}\n\n"
        + (f"JOB DESCRIPTION (for tone alignment):\n{jd_snippet[:1500]}\n\n" if jd_snippet else "")
        + "REWRITTEN BULLET:"
    )

    # Try Gemini first (fast + free), fall back to Grok if configured.
    last_err: Optional[BaseException] = None
    for model in _model_chain(primary_llm_model_for_resume_workloads()):
        try:
            if _is_grok(model):
                # _stream_grok yields events; we just need the final text.
                pieces: List[str] = []
                for ev in _stream_grok(model, "You rewrite resume bullets.", prompt, temperature=0.3):
                    if isinstance(ev, dict) and ev.get("type") == "text":
                        pieces.append(ev.get("text", ""))
                out = "".join(pieces).strip()
                if out:
                    return out.strip().strip('"').strip("'")
                continue
            # Gemini path
            from google import genai  # type: ignore
            client = genai.Client()
            resp = client.models.generate_content(model=model, contents=prompt)
            out = (getattr(resp, "text", "") or "").strip()
            if out:
                return out.strip().strip('"').strip("'")
        except BaseException as exc:
            last_err = exc
            _backoff_if_rate_limited(exc)
            continue
    raise RuntimeError(f"All models failed for bullet rewrite: {last_err}")


def ai_generate_skills(role: str, existing_skills: Optional[List[str]] = None) -> List[str]:
    """Generate a list of relevant skills for a job role.

    Returns a flat list of skill strings. Avoids duplicating anything in
    `existing_skills`. Raises on hard failure.
    """
    existing = ", ".join(existing_skills or []) or "none"
    prompt = (
        "You are a professional resume writer. Generate 12-15 relevant professional "
        f"skills for a candidate applying for this role: {role}\n\n"
        f"Existing skills already on the resume (do not duplicate): {existing}\n\n"
        "Return ONLY a valid JSON array of concise skill strings — no preamble, "
        "no markdown, no code fences, just the raw array. "
        "Mix technical skills with domain-relevant soft skills. "
        'Example: ["Python", "SQL", "Data Analysis", "Machine Learning", "Communication"]'
    )

    import json as _json
    last_err: Optional[BaseException] = None
    for model in _model_chain(primary_llm_model_for_resume_workloads()):
        try:
            if _is_grok(model):
                pieces: List[str] = []
                for ev in _stream_grok(model, "You generate resume skills lists.", prompt, temperature=0.4):
                    if isinstance(ev, dict) and ev.get("type") == "text":
                        pieces.append(ev.get("text", ""))
                raw = "".join(pieces).strip()
            else:
                from google import genai  # type: ignore
                client = genai.Client()
                resp = client.models.generate_content(model=model, contents=prompt)
                raw = (getattr(resp, "text", "") or "").strip()

            # Strip markdown fences if the model ignored instructions
            if raw.startswith("```"):
                raw = raw.split("```")[1].lstrip("json").strip()
            skills = _json.loads(raw)
            if isinstance(skills, list):
                return [str(s).strip() for s in skills if str(s).strip()]
        except BaseException as exc:
            last_err = exc
            _backoff_if_rate_limited(exc)
            continue
    raise RuntimeError(f"All models failed for skills generation: {last_err}")


# ============================================================================
# ATS CHECK — structural + keyword-coverage scoring against a JD
# ============================================================================
#
# This is *not* a JD-fit score (we already have that via `_rate_resume`).
# It's a "will an ATS actually parse this PDF?" check — text-extractable,
# single-column, sections present, contact info detected, page count — plus
# a keyword coverage table built from the JD.
#
# Runs locally on the compiled PDF; no LLM needed. Fast (~200ms).

_STOPWORDS = {
    "a","an","and","the","or","but","if","of","to","in","on","for","with","by",
    "as","is","are","was","were","be","been","being","this","that","these",
    "those","it","its","at","from","not","you","your","we","our","us","i",
    "they","them","their","he","she","his","her","will","would","can","could",
    "should","may","might","must","do","does","did","done","have","has","had",
    "having","about","into","over","under","up","down","out","than","then",
    "so","because","while","when","where","how","what","which","who","whom",
    "all","any","each","every","other","some","such","no","nor","only","own",
    "same","also","just","more","most","very","there","here","both","few","many",
    "much","new","please","via","etc","including","include","includes","using",
    "use","used","uses","make","makes","made","work","works","worked","working",
    "team","teams","role","roles","skills","skill","ability","experience",
    "experiences","year","years","job","jobs","position","candidate","required",
    "preferred","plus","strong","excellent","good","great","across","within",
}

# Common section labels — case-insensitive substring check on extracted text.
_ATS_REQUIRED_SECTIONS = ["experience", "education", "skills"]
_ATS_OPTIONAL_SECTIONS = ["projects", "summary", "objective"]

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = re.compile(r"(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}")
_URL_RE   = re.compile(r"(?:https?://|www\.|linkedin\.com|github\.com)[\w./?=&%+#:-]+", re.I)


def _extract_jd_keywords(jd: str, max_keywords: int = 25) -> List[Dict]:
    """Pull weighted keywords from a JD. Frequency-based, with multi-word phrase
    promotion so "machine learning" beats "machine" + "learning" separately.

    Returns: [{"keyword": "...", "weight": 1-3}, ...] sorted by weight desc.
    """
    text = (jd or "").lower()
    if not text.strip():
        return []

    # 1. Single tokens (alpha-words 3+ chars, no stopwords)
    tokens = re.findall(r"[a-z][a-z+#./-]{2,}", text)
    tokens = [t.strip(".-/+#") for t in tokens]
    tokens = [t for t in tokens if t and t not in _STOPWORDS and len(t) >= 3]

    freq: Dict[str, int] = {}
    for t in tokens:
        freq[t] = freq.get(t, 0) + 1

    # 2. Bigrams — only when both halves aren't stopwords
    raw_words = re.findall(r"[a-z][a-z+#./-]{1,}", text)
    bigram_freq: Dict[str, int] = {}
    for a, b in zip(raw_words, raw_words[1:]):
        if a in _STOPWORDS or b in _STOPWORDS:
            continue
        if len(a) < 3 or len(b) < 3:
            continue
        bg = f"{a} {b}"
        bigram_freq[bg] = bigram_freq.get(bg, 0) + 1

    # Bigrams that appear 2+ times and beat their parts get promoted
    for bg, count in list(bigram_freq.items()):
        if count >= 2:
            freq[bg] = max(freq.get(bg, 0), count + 1)

    # Sort: most-frequent first, drop very-rare singletons
    items = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))
    items = [(k, c) for k, c in items if c >= 2 or " " in k][:max_keywords]

    out: List[Dict] = []
    for k, c in items:
        if c >= 4:
            w = 3
        elif c >= 2:
            w = 2
        else:
            w = 1
        out.append({"keyword": k, "weight": w, "jd_count": c})
    return out


def _check_keyword_in_resume(keyword: str, resume_text: str) -> Dict:
    """Find a JD keyword in resume text. Multi-word keywords match either as a
    contiguous phrase (status=found) or with all parts present separately
    (status=partial). Single words are found/missing only.

    Counts matches case-insensitively with word-boundary regex so "react"
    doesn't match "reaction".
    """
    rt = (resume_text or "").lower()
    if not rt:
        return {"keyword": keyword, "status": "missing", "count": 0}

    # Word-boundary match for the full phrase
    pat = re.compile(r"\b" + re.escape(keyword) + r"\b", re.I)
    count = len(pat.findall(rt))
    if count > 0:
        return {"keyword": keyword, "status": "found", "count": count}

    # For multi-word phrases, also check if all words appear separately
    if " " in keyword:
        parts = keyword.split()
        all_present = all(re.search(r"\b" + re.escape(p) + r"\b", rt) for p in parts)
        if all_present:
            return {"keyword": keyword, "status": "partial", "count": 0}

    return {"keyword": keyword, "status": "missing", "count": 0}


# --- ATS: JD signals, weighted keywords, bullet/summary heuristics (no LLM) ---

_KEYWORD_TYPE_WEIGHTS: Dict[str, int] = {
    "jobTitle": 25,
    "requiredSkills": 25,
    "repeatedKeywords": 15,
    "certifications": 15,
    "preferredSkills": 10,
    "industryTerms": 10,
}

_ATS_SCORE_WEIGHTS: Dict[str, int] = {
    "jdKeywordMatch": 30,
    "requiredSkillMatch": 20,
    "categoryAndTitleMatch": 15,
    "experienceBulletQuality": 15,
    "formattingAndParseability": 10,
    "contactAndLinks": 5,
}

_JD_CATEGORY_KEYWORDS: Dict[str, Tuple[str, ...]] = {
    "Engineering / Software": (
        "software", "engineer", "developer", "frontend", "front-end", "backend", "back-end",
        "full stack", "fullstack", "devops", "sre", "api", "microservices", "cloud", "kubernetes",
        "python", "java", "typescript", "javascript", "react", "vue", "angular", "node",
    ),
    "Data / Analytics": (
        "data analyst", "analytics", "sql", "tableau", "looker", "power bi", "snowflake",
        "etl", "warehouse", "metrics", "dashboard", "reporting", "scientist", "machine learning",
    ),
    "Sales": (
        "sales", "account executive", "ae ", " sdr", "bdr", "quota", "pipeline", "territory",
        "business development", "revenue", "prospecting",
    ),
    "Marketing": (
        "marketing", "seo", "sem", "content", "brand", "campaign", "growth", "email marketing",
        "social media", "copywriting",
    ),
    "Healthcare": (
        "clinical", "patient", "rn ", "nurse", "hospital", "medical", "pharma", "healthcare",
        "hipaa",
    ),
    "Finance / Accounting": (
        "finance", "accounting", "cpa", "audit", "budget", "forecast", "fp&a", "controller",
        "treasury", "tax",
    ),
    "Product / Program": (
        "product manager", "program manager", "roadmap", "stakeholder", "agile", "scrum",
        "prioritization", "discovery",
    ),
}

_COMMON_SKILL_PHRASES: Tuple[str, ...] = (
    "machine learning", "deep learning", "computer vision", "natural language",
    "ci/cd", "object oriented", "object-oriented", "rest api", "rest apis", "graphql",
    "react native", "next.js", "node.js", "vue.js", "ruby on rails", "spring boot",
    "power bi", "google cloud", "aws lambda", "kubernetes",
)

_COMMON_SKILL_TOKENS: frozenset = frozenset({
    "python", "java", "kotlin", "swift", "go", "golang", "rust", "ruby", "php", "scala", "r",
    "javascript", "typescript", "react", "vue", "angular", "svelte", "nextjs", "nodejs", "node",
    "express", "django", "flask", "fastapi", "spring", "rails", "laravel", "dotnet", "csharp",
    "sql", "mysql", "postgresql", "postgres", "mongo", "mongodb", "redis", "elasticsearch",
    "dynamodb", "cassandra", "snowflake", "databricks", "spark", "kafka", "rabbitmq",
    "aws", "gcp", "azure", "terraform", "docker", "kubernetes", "jenkins", "nginx",
    "graphql", "grpc", "html", "css", "sass", "tailwind", "webpack", "vite",
    "pandas", "numpy", "tensorflow", "pytorch", "sklearn", "tableau", "looker", "excel",
    "salesforce", "sap", "figma", "jira", "confluence", "git", "github", "gitlab",
    "linux", "bash", "shell", "c++", "csharp", "dotnet", ".net",
})

_STRONG_ACTION_VERBS: frozenset = frozenset({
    "built", "developed", "designed", "launched", "led", "managed", "delivered", "improved",
    "reduced", "increased", "decreased", "automated", "implemented", "architected", "scaled",
    "migrated", "secured", "optimized", "debugged", "refactored", "integrated", "deployed",
    "owned", "created", "established", "accelerated", "streamlined", "drove", "shipped",
    "grew", "saved", "expanded", "negotiated", "mentored", "coached", "defined", "spearheaded",
})

_ATS_WEAK_VERBS: frozenset = frozenset({
    "worked", "helped", "assisted", "responsible", "involved", "participated", "contributed",
    "supported", "handled", "did", "made", "got", "had", "tried", "attempted",
})

_WEAK_BULLET_PREFIXES: Tuple[str, ...] = (
    "responsible for ", "worked on ", "helped with ", "involved in ", "assisted with ",
    "duties included ", "tasked with ", "duty to ", "main duty",
)

_ATS_NUMBER_RE = re.compile(r"\b\d+([.,]\d+)?[%KkMmBb]?\+?\b|\$\d|\b\d+x\b", re.I)

_CERT_PATTERNS = re.compile(
    r"\b(?:PMP|CAPM|CPA|CFA|SHRM(?:-CP)?|PHR|SPHR|CISSP|CISM|CEH|Security\+|CompTIA|"
    r"AWS\s+Certified|Azure\s+Certified|Google\s+Cloud\s+Professional|GCP\s+Professional|"
    r"Scrum\s*Master|PSM\s*(?:I{1,3}|1|2)|CSM|ITIL|PE\s*License|Six\s+Sigma)\b",
    re.I,
)

_UNPROFESSIONAL_EMAIL_LOCAL = re.compile(
    r"(?:^|\b)(?:beer|booze|partygirl|partyguy|hotmail420|sexy|badass|killer|"
    r"princess|gangsta|420|69{2,})(?:\b|\d)",
    re.I,
)

_US_CITY_STATE_RE = re.compile(
    r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2}\b",
)


def _jd_slice(lower: str, start_keys: Tuple[str, ...], end_keys: Tuple[str, ...]) -> str:
    """Return substring of JD between first start marker and earliest end marker."""
    idx = len(lower)
    for k in start_keys:
        p = lower.find(k)
        if p != -1 and p < idx:
            idx = p
    if idx >= len(lower):
        return ""
    end = len(lower)
    for k in end_keys:
        p = lower.find(k, idx + 5)
        if p != -1 and p < end:
            end = p
    return lower[idx:end]


def _tokenize_skill_line(line: str) -> List[str]:
    parts = re.split(r"[,;|/•\n]+", line)
    out: List[str] = []
    for p in parts:
        t = re.sub(r"^[\s\d.\-+*)]+", "", p).strip()
        t = re.sub(r"\s+", " ", t)
        if 2 <= len(t) <= 60:
            out.append(t)
    return out


def _extract_jd_skill_phrases(jd_lower: str) -> Tuple[List[str], List[str]]:
    """Heuristic required vs preferred skill phrases from JD structure."""
    req_keys = (
        "requirements", "required qualifications", "minimum qualifications",
        "must have", "you have", "you'll need", "basic qualifications",
    )
    pref_keys = ("preferred qualifications", "nice to have", "bonus", "plus:", "preferred skills")
    end_keys = (
        "benefits", "we offer", "salary", "how to apply", "application", "equal opportunity",
        "about the company", "what you bring", "what we offer",
    )
    req_blob = _jd_slice(jd_lower, req_keys, pref_keys + end_keys)
    pref_blob = _jd_slice(jd_lower, pref_keys, end_keys)

    def _from_blob(blob: str) -> List[str]:
        found: List[str] = []
        for line in blob.splitlines():
            line_l = line.strip().lower()
            if len(line_l) < 4:
                continue
            if line_l.startswith(("•", "-", "*")):
                line_l = line_l.lstrip("•-* ").strip()
            for tok in _tokenize_skill_line(line_l):
                if len(tok) >= 3 and tok not in _STOPWORDS:
                    found.append(tok)
        # De-dupe preserving order
        seen: Set[str] = set()
        uniq: List[str] = []
        for t in found:
            k = t.lower()
            if k in seen:
                continue
            seen.add(k)
            uniq.append(t)
        return uniq[:40]

    required = _from_blob(req_blob) if req_blob else []
    preferred = _from_blob(pref_blob) if pref_blob else []

    # If structure didn't yield skills, mine common tech tokens from whole JD
    if len(required) < 3:
        extra: List[str] = []
        for phrase in _COMMON_SKILL_PHRASES:
            if phrase in jd_lower and phrase not in extra:
                extra.append(phrase)
        for tok in sorted(_COMMON_SKILL_TOKENS, key=len, reverse=True):
            if re.search(r"\b" + re.escape(tok) + r"\b", jd_lower):
                extra.append(tok)
        for e in extra:
            if e.lower() not in {x.lower() for x in required}:
                required.append(e)
        required = required[:35]

    return required[:35], preferred[:25]


def _infer_jd_job_title(jd: str, target_role: str) -> str:
    tr = (target_role or "").strip()
    if tr and len(tr) < 120:
        return tr
    lines = [ln.strip() for ln in (jd or "").splitlines() if ln.strip()]
    skip = re.compile(r"^(location|remote|hybrid|onsite|apply|salary|company|overview)\b", re.I)
    for ln in lines[:25]:
        if len(ln) > 100 or skip.search(ln):
            continue
        if re.search(r"\b(inc\.|llc|corp\.)\b", ln, re.I) and "engineer" not in ln.lower():
            continue
        return ln[:120]
    return ""


def _infer_jd_category(jd_lower: str) -> str:
    best_cat = "General"
    best = 0
    for cat, kws in _JD_CATEGORY_KEYWORDS.items():
        score = sum(1 for k in kws if re.search(r"\b" + re.escape(k) + r"\b", jd_lower))
        if score > best:
            best, best_cat = score, cat
    return best_cat if best > 0 else "General"


def _extract_certifications(jd: str) -> List[str]:
    return sorted(set(m.group(0).strip() for m in _CERT_PATTERNS.finditer(jd or "")))


def _years_experience_hint(jd_lower: str) -> Optional[int]:
    m = re.search(
        r"\b(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)\b",
        jd_lower,
    )
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return None
    return None


def _analyze_jd_signals(jd: str, target_role: str) -> Dict:
    jd = jd or ""
    jd_lower = jd.lower()
    title = _infer_jd_job_title(jd, target_role)
    category = _infer_jd_category(jd_lower)
    req_skills, pref_skills = _extract_jd_skill_phrases(jd_lower)
    certs = _extract_certifications(jd)
    repeated: List[Dict] = []
    for item in _extract_jd_keywords(jd, max_keywords=40):
        if item.get("jd_count", 0) >= 3:
            repeated.append({"keyword": item["keyword"], "count": item["jd_count"]})
    # Employer problem — first substantive sentences
    prob = ""
    for ln in jd.splitlines():
        s = ln.strip()
        if 40 < len(s) < 280:
            low = s.lower()
            if any(
                x in low
                for x in ("you will", "you'll", "looking for", "seeking", "responsible for", "build", "scale", "lead", "drive", "improve")
            ):
                prob = s
                break
    if not prob and jd.strip():
        prob = jd.strip().split("\n\n")[0][:240]
    return {
        "jobTitle": title,
        "jobCategory": category,
        "requiredSkills": req_skills,
        "preferredSkills": pref_skills,
        "certifications": certs,
        "repeatedKeywords": repeated[:15],
        "minYearsExperience": _years_experience_hint(jd_lower),
        "employerProblemHint": prob[:400],
    }


def _classify_keyword_type(
    keyword: str,
    jd_lower: str,
    signals: Dict,
    title_l: str,
) -> str:
    kl = keyword.lower()
    for c in signals.get("certifications") or []:
        cl = c.lower()
        if cl in kl or kl in cl or re.search(r"\b" + re.escape(kl) + r"\b", cl):
            return "certifications"
    if kl in title_l or (len(kl) > 3 and kl in title_l.replace("-", " ")):
        return "jobTitle"
    req_l = {s.lower() for s in (signals.get("requiredSkills") or [])}
    if kl in req_l or any(kl in r or r in kl for r in req_l if len(r) >= 5):
        return "requiredSkills"
    pref_l = {s.lower() for s in (signals.get("preferredSkills") or [])}
    if kl in pref_l or any(kl in r or r in kl for r in pref_l if len(r) >= 5):
        return "preferredSkills"
    rep = signals.get("repeatedKeywords") or []
    if any(r.get("keyword", "").lower() == kl for r in rep):
        return "repeatedKeywords"
    return "industryTerms"


def _resume_bullets(full_text: str, parsed: Optional[Dict]) -> List[str]:
    out: List[str] = []
    if parsed and isinstance(parsed.get("sections"), list):
        for sec in parsed["sections"]:
            if not sec.get("editable"):
                continue
            name = (sec.get("name") or "").lower()
            if "skill" in name and "experience" not in name:
                continue
            for ent in sec.get("entries") or []:
                for b in ent.get("bullets") or []:
                    t = (b.get("text") or "").strip()
                    if len(t) > 10:
                        out.append(t)
    if out:
        return out[:120]
    for raw in (full_text or "").splitlines():
        s = raw.strip()
        if len(s) < 22 or len(s) > 420:
            continue
        if s[:1] in "•–-*●◦▪·" or re.match(r"^[\-\u2013\u2014]\s+\S", s) or re.match(r"^\d+[\).\]]\s+\S", s):
            t = re.sub(r"^[\d\s.)•–\-*●◦▪·]+", "", s).strip()
            if len(t) > 15:
                out.append(t)
    return out[:100]


_US_PHONE_INLINE = re.compile(
    r"\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b",
)


def _bullet_looks_like_contact_or_latex_noise(b: str) -> bool:
    """PDF bullet heuristics often swallow the header row (email, LaTeX). Skip for metrics."""
    low = b.lower()
    if "@" in b or "mailto:" in low or "linkedin.com" in low or "github.com" in low:
        return True
    if "href" in low or "http://" in low or "https://" in low or "www." in low:
        return True
    if "\\" in b or "{" in b:
        return True
    if _US_PHONE_INLINE.search(b):
        return True
    return False


def _token_is_long_bare_id_or_phone(token: str) -> bool:
    """7+ digit runs without %, $, or k/m/b scale are almost never résumé impact metrics."""
    if re.search(r"[%$]", token) or re.search(r"[kKmMbB]", token):
        return False
    if re.search(r"\d\s*x\b", token, re.I):
        return False
    core = re.sub(r"[^\d]", "", token.split("+", 1)[0])
    return bool(core.isdigit() and len(core) >= 7)


def _pick_strongest_metric_snippet(bullets: List[str]) -> str:
    """Pick a number that reads like an accomplishment metric — not longest digit substring."""
    best_key: Tuple[int, float] = (-1, -1.0)
    best_snip = ""

    for b in bullets:
        if _bullet_looks_like_contact_or_latex_noise(b):
            continue
        for mm in _ATS_NUMBER_RE.finditer(b):
            tok = mm.group(0).strip()
            if _token_is_long_bare_id_or_phone(tok):
                continue
            prio = 1
            tie = 0.0
            if "%" in tok:
                prio = 5
                try:
                    tie = float(re.sub(r"[^\d.]", "", tok.split("%", 1)[0] or "0"))
                except ValueError:
                    tie = 0.0
            elif re.match(r"^\$", tok):
                prio = 4
                try:
                    tie = float(re.sub(r"[^\d.]", "", tok.replace(",", "")))
                except ValueError:
                    tie = 0.0
            elif re.search(r"\d+\s*x\b", tok, re.I):
                prio = 3
                try:
                    tie = float(re.sub(r"[^\d.]", "", re.split(r"(?i)x", tok)[0] or "0"))
                except ValueError:
                    tie = 0.0
            elif re.search(r"[kKmMbB]", tok, re.I):
                prio = 2
                mscale = re.search(r"([\d.,]+)\s*[kKmMbB]", tok, re.I)
                if mscale:
                    try:
                        tie = float(mscale.group(1).replace(",", ""))
                    except ValueError:
                        tie = 0.0
            else:
                try:
                    parts = re.split(r"\s+", tok.strip(), 1)
                    tie = float(re.sub(r"[^\d.]", "", parts[0] or "0"))
                except ValueError:
                    tie = 0.0
                prio = 2 if "+" in tok else 1
            if (prio, tie) > best_key:
                best_key = (prio, tie)
                best_snip = tok + " — " + b[:100]
    return best_snip


def _summary_excerpt(lower_text: str, full_text: str) -> str:
    """Best-effort summary/objective region from PDF text."""
    markers = ("summary", "profile", "objective", "about me")
    lines = full_text.splitlines()
    grab = False
    buf: List[str] = []
    for ln in lines:
        l = ln.strip()
        low = l.lower()
        if any(re.match(rf"^\s*{re.escape(m)}\b", low) for m in markers):
            grab = True
            continue
        if grab:
            if any(
                re.match(rf"^\s*{re.escape(m)}\b", low)
                for m in ("experience", "employment", "work history", "education", "skills", "projects")
            ):
                break
            if l:
                buf.append(l)
        if len(buf) > 12:
            break
    return " ".join(buf)[:1200]


def _bullet_score_row(text: str, jd_terms: Set[str]) -> Dict:
    low = text.lower()
    words = re.findall(r"[A-Za-z']+", text)
    first = words[0].lower() if words else ""
    starts_action = first in _STRONG_ACTION_VERBS
    has_metric = bool(_ATS_NUMBER_RE.search(text))
    impact_kw = any(
        x in low
        for x in (
            "revenue", "cost", "latency", "churn", "conversion", "retention", "efficiency",
            "downtime", "customer", "user", "users", "traffic", "throughput", "budget",
            "deadline", "satisfaction", "nps", "arr", "mrr",
        )
    )
    has_rel = False
    for t in jd_terms:
        if len(t) >= 3 and re.search(r"\b" + re.escape(t.lower()) + r"\b", low):
            has_rel = True
            break
    weak_prefix = any(low.startswith(p) for p in _WEAK_BULLET_PREFIXES)
    is_generic = (
        weak_prefix
        or first in _ATS_WEAK_VERBS
        or (len(words) < 10 and not has_metric)
    )
    return {
        "startsWithActionVerb": starts_action,
        "hasMetric": has_metric,
        "hasBusinessImpact": impact_kw,
        "hasRelevantKeyword": has_rel,
        "isTooGeneric": is_generic,
    }


def _skill_suggestion_rows(
    jd_lower: str,
    resume_lower: str,
    required: List[str],
    preferred: List[str],
) -> List[Dict]:
    rows: List[Dict] = []
    for skill in required[:20]:
        sl = skill.lower()
        in_jd = len(re.findall(r"\b" + re.escape(sl) + r"\b", jd_lower))
        present = bool(re.search(r"\b" + re.escape(sl) + r"\b", resume_lower))
        related = False
        if not present:
            for tok in sl.replace("/", " ").split():
                if len(tok) >= 4 and tok != sl and tok in resume_lower:
                    related = True
                    break
        if present:
            status = "already_present"
            rec = "add_if_true"
        elif related:
            status = "candidate_claimed_related"
            rec = "add_if_true"
        else:
            status = "missing"
            rec = "add_if_true" if in_jd >= 2 else "do_not_add_without_experience"
        rows.append({
            "skill": skill,
            "source": "job_description",
            "status": status,
            "recommendation": rec,
            "jdMentions": in_jd,
        })
    for skill in preferred[:12]:
        sl = skill.lower()
        if any(r["skill"].lower() == sl for r in rows):
            continue
        present = bool(re.search(r"\b" + re.escape(sl) + r"\b", resume_lower))
        rows.append({
            "skill": skill,
            "source": "job_description",
            "status": "already_present" if present else "missing",
            "recommendation": "add_if_true" if present else "do_not_add_without_experience",
            "jdMentions": len(re.findall(r"\b" + re.escape(sl) + r"\b", jd_lower)),
        })
    return rows[:28]


def _detect_layout_issues(pdf) -> Dict:
    """Heuristics for ATS-unfriendly layouts. Multi-column resumes (common in
    designer templates) often confuse parsers — the text comes out interleaved
    line-by-line instead of column-by-column.

    We look at the x-coordinate distribution of words on the first page: if
    there are two clear clusters with a gap, it's likely multi-column.
    """
    out = {"single_column": True, "x0_clusters": 1, "detail": ""}
    try:
        if not pdf.pages:
            out["detail"] = "no pages"
            return out
        page = pdf.pages[0]
        words = page.extract_words() or []
        if len(words) < 20:
            out["detail"] = "too few words to analyze layout"
            return out
        x0s = sorted(w["x0"] for w in words)
        # Bin x0 to nearest 10pt; the most common bin is the left margin.
        from collections import Counter
        bins = Counter(int(x) // 10 * 10 for x in x0s)
        # If two bins each contain >25% of words, with a gap of 100+ pts, multi-col.
        sorted_bins = bins.most_common(3)
        total = sum(bins.values())
        big_bins = [(b, c) for b, c in sorted_bins if c / total > 0.20]
        if len(big_bins) >= 2:
            xs = sorted(b for b, _ in big_bins)
            if xs[-1] - xs[0] > 100:
                out["single_column"] = False
                out["x0_clusters"] = len(big_bins)
                out["detail"] = f"two text columns detected at x≈{xs[0]} and x≈{xs[-1]}"
        if out["single_column"]:
            out["detail"] = f"primary column at x≈{sorted_bins[0][0]}"
    except Exception as exc:
        out["detail"] = f"layout check failed: {exc}"
    return out


def ats_check(
    folder: str,
    jd: str = "",
    user_id: str = "",
    pdf_bytes: Optional[bytes] = None,
    *,
    target_role: str = "",
    parsed: Optional[Dict] = None,
) -> Dict:
    """Run an ATS + job-alignment check on the compiled PDF (text extraction).

    Resolution order for the PDF:
      1. `pdf_bytes` arg (if caller already has it)
      2. local LIBRARY_ROOT/<folder>/*.pdf
      3. Supabase resume-pdfs bucket via download_pdf

    Always returns legacy keys: ``score``, ``checks``, ``keywords``, ``stats``.
    When a job description is present, adds JD match analysis, weighted
    keyword types, bullet/summary heuristics, recruiter scan, and score
    breakdown (rule-based — not a guarantee any ATS will pass).
    """
    import io as _io

    # 1. Locate PDF bytes
    data: Optional[bytes] = pdf_bytes
    if data is None:
        folder_path = os.path.join(LIBRARY_ROOT, folder)
        if os.path.isdir(folder_path):
            for fn in os.listdir(folder_path):
                if fn.endswith(".pdf"):
                    try:
                        with open(os.path.join(folder_path, fn), "rb") as f:
                            data = f.read()
                        break
                    except Exception as exc:
                        logger.warning(f"ats_check: read {fn} failed: {exc}")
    if data is None and user_id and user_id != "local":
        try:
            try:
                from resume_gui.storage import download_pdf  # type: ignore
            except ImportError:
                from storage import download_pdf  # type: ignore
            data = download_pdf(user_id, folder)
        except Exception as exc:
            logger.warning(f"ats_check: storage download failed: {exc}")

    if data is None:
        raise FileNotFoundError(f"PDF for folder '{folder}' not found locally or in storage")

    try:
        import pdfplumber  # type: ignore
    except ImportError as exc:
        raise RuntimeError(f"pdfplumber required for ATS check: {exc}")

    pages_text: List[str] = []
    layout: Dict = {"single_column": True, "detail": "(not analyzed)"}
    page_count = 0
    with pdfplumber.open(_io.BytesIO(data)) as pdf:
        page_count = len(pdf.pages)
        for p in pdf.pages:
            pages_text.append(p.extract_text() or "")
        layout = _detect_layout_issues(pdf)

    full_text = "\n".join(pages_text)
    word_count = len(re.findall(r"\b\w+\b", full_text))
    char_count = len(full_text)
    lower_text = full_text.lower()
    jd_stripped = (jd or "").strip()
    jd_lower = jd_stripped.lower()

    jd_signals = _analyze_jd_signals(jd_stripped, target_role)
    title_guess = jd_signals.get("jobTitle") or ""
    title_l = title_guess.lower()

    # --- Structural checks (legacy + summary hygiene) ----------------------------
    checks: List[Dict] = []

    text_extractable = char_count > 200
    checks.append({
        "id":     "text_extractable",
        "name":   "Text is selectable / extractable",
        "pass":   text_extractable,
        "detail": f"extracted {char_count:,} chars across {page_count} page(s)"
                  if text_extractable else
                  f"only {char_count} chars extracted — PDF may be image-based",
    })

    checks.append({
        "id":     "single_column",
        "name":   "Single-column, ATS-friendly layout",
        "pass":   layout["single_column"],
        "detail": layout.get("detail", ""),
    })

    page_ok = 1 <= page_count <= 3
    checks.append({
        "id":     "page_count",
        "name":   "Concise length (1–3 pages)",
        "pass":   page_ok,
        "detail": f"{page_count} page(s) — aim for 1–2 for most roles, up to 3 for deep senior histories",
    })

    sections_found  = [s for s in _ATS_REQUIRED_SECTIONS if s in lower_text]
    sections_missing = [s for s in _ATS_REQUIRED_SECTIONS if s not in lower_text]
    checks.append({
        "id":     "required_sections",
        "name":   "Standard sections present (Experience, Education, Skills)",
        "pass":   not sections_missing,
        "detail": (f"found: {', '.join(sections_found).title()}" if sections_found else "none found")
                  + (f"  |  missing: {', '.join(sections_missing).title()}" if sections_missing else ""),
    })

    has_email = bool(_EMAIL_RE.search(full_text))
    has_phone = bool(_PHONE_RE.search(full_text))
    has_url   = bool(_URL_RE.search(full_text))
    checks.append({
        "id":     "contact_info",
        "name":   "Contact info detectable (email + phone/URL)",
        "pass":   has_email and (has_phone or has_url),
        "detail": f"email={'✓' if has_email else '✗'}  phone={'✓' if has_phone else '✗'}  url={'✓' if has_url else '✗'}",
    })

    wc_ok = 200 <= word_count <= 1000
    checks.append({
        "id":     "word_count",
        "name":   "Word count in a healthy range (about 200–1,000)",
        "pass":   wc_ok,
        "detail": f"{word_count:,} words "
                  + ("(too short — add detail)" if word_count < 200 else
                     "(likely too long — trim to ~1–2 pages; most résumés stay under ~1,000 words)" if word_count > 1000 else "(OK)"),
    })

    has_objective = bool(re.search(r"\bobjective\b", lower_text)) or bool(
        re.search(r"\bseeking (a |an )?(challenging|new|)?\s*(role|position|opportunity)", lower_text)
    )
    checks.append({
        "id":     "summary_not_objective",
        "name":   "Use a professional summary (avoid a generic objective)",
        "pass":   not has_objective,
        "detail": "Objective-style headers or 'seeking a challenging role' openings read dated to recruiters."
                  if has_objective else "No classic objective pattern detected in extracted text.",
    })

    # --- Keyword table with JD signal types ------------------------------------
    kw_merge: List[Dict] = []
    seen_kw: Set[str] = set()
    for item in _extract_jd_keywords(jd_stripped, max_keywords=28):
        kw_merge.append(dict(item))
        seen_kw.add(item["keyword"].lower())
    for s in jd_signals.get("requiredSkills") or []:
        sl = s.lower()
        if sl not in seen_kw and len(sl) >= 2:
            kw_merge.append({
                "keyword": s,
                "weight": 3,
                "jd_count": len(re.findall(re.escape(sl), jd_lower)) or 1,
            })
            seen_kw.add(sl)

    kw_results: List[Dict] = []
    w_num = 0.0
    w_den = 0.0
    for kw in kw_merge:
        r = _check_keyword_in_resume(kw["keyword"], full_text)
        r["weight"] = kw["weight"]
        r["jd_count"] = kw["jd_count"]
        ktype = _classify_keyword_type(kw["keyword"], jd_lower, jd_signals, title_l)
        r["keywordType"] = ktype
        tw = float(_KEYWORD_TYPE_WEIGHTS.get(ktype, 10))
        w_den += tw
        frac = 1.0 if r["status"] == "found" else (0.5 if r["status"] == "partial" else 0.0)
        w_num += tw * frac
        kw_results.append(r)

    jd_kw_ratio = (w_num / w_den) if w_den > 0 else 1.0

    # --- Required skills vs resume ---------------------------------------------
    req_skills: List[str] = list(jd_signals.get("requiredSkills") or [])
    resume_lower = lower_text
    missing_req: List[str] = []
    matched_req: List[str] = []
    for s in req_skills:
        sl = s.lower()
        if re.search(r"\b" + re.escape(sl) + r"\b", resume_lower) or sl in resume_lower:
            matched_req.append(s)
        else:
            missing_req.append(s)

    req_ratio = (len(matched_req) / max(1, len(req_skills))) if req_skills else 1.0

    # --- Title & category alignment --------------------------------------------
    title_tokens = [
        t for t in re.findall(r"[a-z0-9+#./-]{3,}", title_l)
        if t not in _STOPWORDS and not t.isdigit()
    ]
    title_hits = sum(
        1 for t in title_tokens
        if len(t) >= 3 and re.search(r"\b" + re.escape(t) + r"\b", resume_lower)
    )
    title_ratio = (title_hits / max(1, len(title_tokens))) if title_tokens else 0.0
    if title_ratio >= 0.45:
        title_match_label = "Strong"
    elif title_ratio >= 0.2:
        title_match_label = "Partial"
    else:
        title_match_label = "Weak"

    cat_name = jd_signals.get("jobCategory") or "General"
    cat_kws = _JD_CATEGORY_KEYWORDS.get(cat_name, ())
    cat_hits = sum(1 for k in cat_kws if re.search(r"\b" + re.escape(k) + r"\b", resume_lower))
    cat_jd = sum(1 for k in cat_kws if re.search(r"\b" + re.escape(k) + r"\b", jd_lower))
    cat_strength = cat_hits / max(5, cat_jd + 4) if jd_lower else 0.0
    if cat_strength >= 0.28:
        category_match_label = "Strong"
    elif cat_strength >= 0.12:
        category_match_label = "Partial"
    else:
        category_match_label = "Weak"

    # --- Bullets & quantification -----------------------------------------------
    jd_term_set: Set[str] = set()
    for k in kw_results[:40]:
        jd_term_set.add(k["keyword"].lower())
    for s in req_skills[:25]:
        jd_term_set.add(s.lower())

    bullets = _resume_bullets(full_text, parsed)
    bullet_rows: List[Dict] = []
    metrics_n = 0
    action_n = 0
    generic_n = 0
    weak_starts: List[str] = []
    for b in bullets:
        row = _bullet_score_row(b, jd_term_set)
        bullet_rows.append({"text": b[:220], **row})
        if row["hasMetric"]:
            metrics_n += 1
        if row["startsWithActionVerb"]:
            action_n += 1
        if row["isTooGeneric"]:
            generic_n += 1
        bl = b.lower()
        for p in _WEAK_BULLET_PREFIXES:
            if bl.startswith(p.strip()):
                weak_starts.append(b[:80])
                break
    n_bul = len(bullets)
    if n_bul:
        quant_ratio = metrics_n / n_bul
        action_ratio = action_n / n_bul
        generic_ratio = generic_n / n_bul
        bullet_quality = min(
            1.0,
            0.45 * quant_ratio + 0.35 * action_ratio + 0.25 * (1.0 - generic_ratio),
        )
    else:
        quant_ratio = 0.35
        action_ratio = 0.35
        generic_ratio = 0.35
        bullet_quality = 0.45

    # --- Summary heuristics -----------------------------------------------------
    summary_text = _summary_excerpt(lower_text, full_text)
    sum_low = summary_text.lower()
    generic_summary = bool(
        re.search(r"\b(seeking|looking for|challenging role|opportunity to grow)\b", sum_low)
    )
    jd_kw_hits_in_summary = sum(
        1 for k in kw_results[:20]
        if re.search(r"\b" + re.escape(k["keyword"].lower()) + r"\b", sum_low)
    )
    summary_has_metric = bool(_ATS_NUMBER_RE.search(summary_text))

    # --- Contact & links --------------------------------------------------------
    email_m = _EMAIL_RE.search(full_text)
    email_val = email_m.group(0) if email_m else ""
    bad_email = bool(email_val and _UNPROFESSIONAL_EMAIL_LOCAL.search(email_val.split("@")[0]))
    linkedin_ok = bool(re.search(r"linkedin\.com/[\w./-]+", full_text, re.I))
    github_ok = bool(re.search(r"github\.com/[\w./-]+", full_text, re.I))
    portfolio_ok = bool(re.search(r"(?:portfolio|personal site|behance\.com|dribbble\.com)", lower_text))
    city_state_ok = bool(_US_CITY_STATE_RE.search(full_text))

    sw_category = "software" if (
        "software" in cat_name.lower()
        or "engineering" in cat_name.lower()
        or any(t in jd_lower for t in ("github", "kubernetes", "typescript", "react", "api "))
    ) else "general"

    contact_validation: Dict = {
        "fullName": False,
        "email": has_email,
        "phone": has_phone,
        "cityState": city_state_ok,
        "linkedIn": linkedin_ok,
        "gitHub": github_ok,
        "portfolioHint": portfolio_ok,
        "emailLooksUnprofessional": bad_email,
    }
    for ln in full_text.splitlines():
        s = ln.strip()
        if 4 < len(s) < 60 and re.match(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,4}$", s):
            contact_validation["fullName"] = True
            break

    # --- Red flags & density ----------------------------------------------------
    red_flags: List[Dict] = []
    if bad_email:
        red_flags.append({"id": "email_unprofessional", "severity": "high", "detail": "Email local-part looks informal — use a simple professional address."})
    long_lines = [ln for ln in full_text.splitlines() if len(ln.split()) > 48]
    if len(long_lines) >= 2:
        red_flags.append({"id": "dense_blocks", "severity": "medium", "detail": "Very long lines may scan as dense blocks — break into bullets."})
    if sw_category == "software" and jd_stripped and not github_ok:
        red_flags.append({"id": "github_missing", "severity": "low", "detail": "GitHub link not detected — add it if you have public code relevant to this role."})
    if jd_stripped and not linkedin_ok:
        red_flags.append({"id": "linkedin_missing", "severity": "low", "detail": "LinkedIn URL not detected — recruiters often expect it."})

    red_penalty = sum(
        {"high": 8, "medium": 4, "low": 2}.get(r.get("severity", "low"), 2)
        for r in red_flags
    )
    red_penalty = min(15, red_penalty)

    bullets_per_job_hint = ""
    if n_bul > 18:
        bullets_per_job_hint = f"{n_bul} accomplishment lines detected — consider trimming older roles if any section feels long."

    # --- Employer problem fit (lightweight) ------------------------------------
    top_evidence: List[str] = []
    for b in bullets[:12]:
        if any(re.search(r"\b" + re.escape(t) + r"\b", b.lower()) for t in list(jd_term_set)[:12] if len(t) > 3):
            top_evidence.append(b[:160])
    missing_evidence = missing_req[:6]

    # --- Recruiter 6-second scan ------------------------------------------------
    scan_name = ""
    for ln in full_text.splitlines():
        s = ln.strip()
        if 4 < len(s) < 56 and re.match(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,4}$", s):
            scan_name = s
            break
    skills_line = ""
    m_sk = re.search(r"(?i)skills[^\n]*\n([^\n]{10,240})", full_text)
    if m_sk:
        cand = m_sk.group(1).strip()[:200]
        if "," in cand or "|" in cand or cand.count(" ") >= 2 or "•" in cand or " / " in cand:
            skills_line = cand
    edu_line = ""
    m_edu = re.search(r"(?i)\b(B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|Ph\.?D\.?)[^\n]{0,120}", full_text)
    if m_edu:
        edu_line = m_edu.group(0).strip()[:160]
    strongest_metric = _pick_strongest_metric_snippet(bullets)

    recruiter_scan = {
        "name": scan_name or "(not detected from PDF text)",
        "targetRole": (target_role or title_guess or "").strip() or "—",
        "topSkillsLine": skills_line or "(surface skills near a Skills heading if present)",
        "education": edu_line or "—",
        "strongestMetric": strongest_metric or "—",
        "signals": [
            {"label": "Target role obvious", "ok": bool((target_role or title_guess) and title_ratio >= 0.15)},
            {"label": "Current title relevant", "ok": title_match_label != "Weak"},
            {"label": "Top skills visible", "ok": bool(skills_line)},
            {"label": "Metrics visible", "ok": metrics_n >= max(1, n_bul // 5)},
            {"label": "Education easy to find", "ok": bool(edu_line)},
        ],
    }

    # --- Weak JD keywords (low resume density vs JD) ----------------------------
    weak_kw: List[str] = []
    for k in kw_results:
        if k["status"] == "found" and k.get("jd_count", 0) >= 3:
            if k.get("count", 0) * 3 < k["jd_count"]:
                weak_kw.append(k["keyword"])
    matched_kw_display = [k["keyword"] for k in kw_results if k["status"] == "found"][:18]

    jd_match_score = round(
        100 * (0.52 * jd_kw_ratio + 0.24 * req_ratio + 0.12 * min(1.0, title_ratio * 1.4) + 0.12 * min(1.0, cat_strength * 2.2))
    ) if jd_stripped else 0

    # --- Score breakdown (max 95 before penalty) --------------------------------
    fmt_ids = {"text_extractable", "single_column", "required_sections", "word_count", "page_count"}
    fmt_checks = [c for c in checks if c["id"] in fmt_ids]
    fmt_pts = _ATS_SCORE_WEIGHTS["formattingAndParseability"] * (
        sum(1 for c in fmt_checks if c["pass"]) / max(1, len(fmt_checks))
    )

    ct_pts = 0.0
    if has_email:
        ct_pts += 2.0
    if has_phone:
        ct_pts += 1.5
    if has_url or linkedin_ok:
        ct_pts += 1.0
    if city_state_ok:
        ct_pts += 0.5
    ct_pts = min(float(_ATS_SCORE_WEIGHTS["contactAndLinks"]), ct_pts)

    if jd_stripped:
        jd_kw_pts = _ATS_SCORE_WEIGHTS["jdKeywordMatch"] * jd_kw_ratio
        req_pts = _ATS_SCORE_WEIGHTS["requiredSkillMatch"] * req_ratio
        cat_title_pts = _ATS_SCORE_WEIGHTS["categoryAndTitleMatch"] * (
            0.55 * min(1.0, cat_strength * 2.5) + 0.45 * min(1.0, title_ratio * 1.8)
        )
    else:
        jd_kw_pts = _ATS_SCORE_WEIGHTS["jdKeywordMatch"] * 0.55
        req_pts = _ATS_SCORE_WEIGHTS["requiredSkillMatch"] * 0.55
        cat_title_pts = _ATS_SCORE_WEIGHTS["categoryAndTitleMatch"] * 0.55

    bullet_pts = _ATS_SCORE_WEIGHTS["experienceBulletQuality"] * bullet_quality

    raw_total = jd_kw_pts + req_pts + cat_title_pts + bullet_pts + fmt_pts + ct_pts
    scale = 100.0 / 95.0
    score = max(0, min(100, int(round(raw_total * scale - red_penalty))))

    score_breakdown = {
        "jdKeywordMatch": round(jd_kw_pts, 1),
        "requiredSkillMatch": round(req_pts, 1),
        "categoryAndTitleMatch": round(cat_title_pts, 1),
        "experienceBulletQuality": round(bullet_pts, 1),
        "formattingAndParseability": round(fmt_pts, 1),
        "contactAndLinks": round(ct_pts, 1),
        "redFlagPenalty": red_penalty,
        "keywordTypeWeights": dict(_KEYWORD_TYPE_WEIGHTS),
    }

    export_checklist = [
        {"id": "jd_custom", "label": "Résumé tailored to this job description", "pass": bool(jd_stripped and jd_kw_ratio >= 0.35)},
        {"id": "title_cat", "label": "Job title / category reflected in story", "pass": title_match_label != "Weak" and category_match_label != "Weak"},
        {"id": "req_skills", "label": "Required skills addressed where truthful", "pass": req_ratio >= 0.45 or not req_skills},
        {"id": "certs", "label": "Certifications from JD surfaced if you hold them", "pass": not jd_signals.get("certifications") or any(c.lower() in resume_lower for c in jd_signals["certifications"])},
        {"id": "contact", "label": "Contact block complete (email, phone, location)", "pass": has_email and has_phone and city_state_ok},
        {"id": "no_objective", "label": "No generic objective statement", "pass": not has_objective},
        {"id": "verbs", "label": "Strong action verbs on accomplishments", "pass": n_bul == 0 or (action_n / n_bul) >= 0.35},
        {"id": "metrics", "label": "Quantified impact on most bullets", "pass": n_bul == 0 or quant_ratio >= 0.35},
    ]

    disclaimer = (
        "Resunova scores how well your résumé text aligns with this job description and common ATS parsing patterns. "
        "It does not guarantee passage of any specific applicant tracking system."
    )

    return {
        "score": score,
        "checks": checks,
        "keywords": kw_results,
        "stats": {
            "page_count": page_count,
            "word_count": word_count,
            "char_count": char_count,
        },
        "disclaimer": disclaimer,
        "scoreBreakdown": score_breakdown,
        "jdAnalysis": jd_signals,
        "jdMatch": {
            "matchScore": jd_match_score if jd_stripped else None,
            "missingRequiredSkills": missing_req[:20],
            "weakKeywords": weak_kw[:20],
            "matchedKeywords": matched_kw_display,
            "categoryMatch": category_match_label,
            "titleMatch": title_match_label,
        },
        "summarySignals": {
            "hasObjectivePattern": has_objective,
            "summaryLooksGeneric": generic_summary or (len(summary_text) < 40),
            "jdKeywordsInSummary": jd_kw_hits_in_summary,
            "summaryHasMetric": summary_has_metric,
            "suggestions": [
                *(["Replace an objective block with a 2–3 line summary tied to this role."] if has_objective else []),
                *(["Add role category + top tools + one measurable outcome to your summary."] if generic_summary or len(summary_text) < 40 else []),
                *(["Weave 2–3 truthful JD phrases into the summary where they match your experience."] if jd_stripped and jd_kw_hits_in_summary < 2 else []),
                *(["Add one quantified win to the summary (%, $, time, scale)."] if jd_stripped and not summary_has_metric else []),
            ],
        },
        "bulletStrength": {
            "bulletCount": n_bul,
            "samples": bullet_rows[:12],
            "quantifiedCount": metrics_n,
            "weakOpenersCount": len(set(weak_starts)),
            "weakOpenersSample": weak_starts[:4],
            "uxHint": (
                f"{metrics_n} of {n_bul} lines include measurable impact — aim to add numbers to more accomplishment lines."
                if n_bul else "Fewer bullet-like lines detected in the PDF — confirm experience uses clear accomplishment bullets."
            ),
        },
        "quantification": {
            "withMetric": metrics_n,
            "total": n_bul,
            "ratio": round(quant_ratio, 2) if n_bul else None,
        },
        "actionVerbs": {
            "strongVerbRatio": round(action_ratio, 2) if n_bul else None,
            "weakStartsFound": weak_starts[:6],
            "tip": "Prefer verbs like Built, Delivered, Reduced, Launched, Automated — especially for technical roles.",
        },
        "skillSuggestions": _skill_suggestion_rows(jd_lower, resume_lower, req_skills, list(jd_signals.get("preferredSkills") or [])),
        "redFlags": red_flags,
        "contactValidation": contact_validation,
        "lengthDensity": {
            "suggestedPages": "1–2 for most candidates; up to 3 for very senior histories",
            "longLines": len(long_lines),
            "bulletsPerJobHint": bullets_per_job_hint,
        },
        "employerProblemFit": {
            "employerProblem": jd_signals.get("employerProblemHint") or "",
            "candidateEvidence": top_evidence[:5],
            "missingEvidence": missing_evidence,
            "rewriteHint": (
                "Tie one more bullet to the outcomes this posting emphasizes — mirror their language where it matches your real work."
                if jd_stripped else ""
            ),
        },
        "recruiterScan": recruiter_scan,
        "exportChecklist": export_checklist,
    }


# ============================================================================
# RESUME DOCTOR — bullet-level writing-quality analyzer (pure regex)
# ============================================================================
#
# Runs against the parsed bullets — NOT the PDF. Surfaces issues inline in the
# editor as chips so the user can fix them without leaving the UI. Zero LLM
# cost, zero latency. Pure rule-based linting for the most common resume sins.

_WEAK_VERBS = {
    "worked", "helped", "assisted", "responsible", "involved", "participated",
    "contributed", "supported", "handled", "did", "made", "got", "had",
    "tried", "attempted", "managed to", "able to",
}
_BUZZWORDS = {
    "synergy", "synergies", "results-driven", "passionate", "self-starter",
    "go-getter", "rockstar", "ninja", "guru", "thought leader", "team player",
    "detail-oriented", "out of the box", "hit the ground running",
    "best of breed", "world-class", "best-in-class", "next-generation",
    "cutting-edge", "value-add", "value-added", "leverage", "leveraged",
    "utilize", "utilized",
}
_PASSIVE_AUX = {"was", "were", "been", "being", "is", "are", "am"}
# Past participles ending in -ed/-en that often signal passive when after _AUX.
_PAST_PARTICIPLE_RE = re.compile(r"\b\w+(ed|en)\b", re.I)
_NUMBER_RE = re.compile(r"\b\d+([.,]\d+)?[%KkMmBb]?\+?\b|\$\d|\b\d+x\b", re.I)


def doctor_check_bullet(text: str) -> List[Dict]:
    """Lint a single bullet. Returns a list of issue dicts:
        {"id": str, "severity": "warn"|"info", "msg": str}
    Empty list = clean bullet. Cheap enough to run on every keystroke if needed.
    """
    issues: List[Dict] = []
    if not text or not text.strip():
        return issues
    lower = text.lower()
    words = re.findall(r"[A-Za-z']+", text)
    if not words:
        return issues
    first = words[0].lower()

    # 1. Weak opening verb / weak duty-style phrases
    if any(lower.startswith(p) for p in (
        "responsible for ", "worked on ", "helped with ", "involved in ", "assisted with ",
    )):
        issues.append({
            "id":       "weak_verb",
            "severity": "warn",
            "msg":      "Weak duty-style opening — lead with a strong action verb (Built, Delivered, Reduced, …)",
        })
    elif first in _WEAK_VERBS or any(lower.startswith(p + " ") for p in _WEAK_VERBS):
        issues.append({
            "id":       "weak_verb",
            "severity": "warn",
            "msg":      f'Weak opener "{first}" — try a stronger action verb (Architected, Drove, Shipped, etc.)',
        })

    # 2. Passive voice (was/were + past participle)
    for i, w in enumerate(words[:-1]):
        if w.lower() in _PASSIVE_AUX and _PAST_PARTICIPLE_RE.match(words[i + 1] or ""):
            issues.append({
                "id":       "passive_voice",
                "severity": "warn",
                "msg":      f'Passive voice ("{w} {words[i+1]}") — flip to active for stronger impact',
            })
            break

    # 3. Buzzword overload
    hits = [b for b in _BUZZWORDS if b in lower]
    if hits:
        issues.append({
            "id":       "buzzwords",
            "severity": "info",
            "msg":      f"Buzzword{'s' if len(hits)>1 else ''}: {', '.join(hits[:3])} — replace with concrete outcomes",
        })

    # 4. Missing metric (no number, %, $ or x-multiplier)
    if not _NUMBER_RE.search(text) and len(words) > 6:
        issues.append({
            "id":       "no_metric",
            "severity": "info",
            "msg":      "No metric — add a number, %, $, or x-multiplier to quantify impact",
        })

    # 5. First-person pronouns (resumes typically drop them)
    if re.search(r"\b(I|me|my|we|our)\b", text):
        issues.append({
            "id":       "first_person",
            "severity": "info",
            "msg":      "First-person pronoun — resumes usually drop I/me/we/our",
        })

    # 6. Bullet too long (over ~30 words = wall of text)
    if len(words) > 32:
        issues.append({
            "id":       "too_long",
            "severity": "warn",
            "msg":      f"Long bullet ({len(words)} words) — aim for under 25 for scanability",
        })

    return issues


def doctor_check_resume(parsed: Dict) -> Dict:
    """Run doctor_check_bullet across every bullet in a parsed tree.

    Returns {bullet_id: [issues...]} keyed by `id` so the frontend can show
    chips next to each row without index gymnastics.
    """
    out: Dict[str, List[Dict]] = {}
    for sec in parsed.get("sections") or []:
        if not sec.get("editable"):
            continue
        for entry in sec.get("entries") or []:
            for b in entry.get("bullets") or []:
                bid = b.get("id")
                if not bid:
                    continue
                issues = doctor_check_bullet(b.get("text") or "")
                if issues:
                    out[bid] = issues
    return out


# ============================================================================
# RATE — quick Gemini call to score the resume against the JD
# ============================================================================

def _find_company_reference(company: str) -> Optional[str]:
    """Find the best existing resume to use as style reference for a given company."""
    company_clean = re.sub(r"[^\w]", "", company).lower()
    best = None
    for r in list_resumes():
        folder_lower = r["folder"].lower()
        if folder_lower.startswith(company_clean):
            # Prefer folders that also have a PDF (fully compiled)
            if r["has_pdf"]:
                return r["folder"]
            best = r["folder"]
    return best


def _rate_resume(client, model: str, latex_body: str, jd_snippet: str) -> Optional[Dict]:
    prompt = (
        "You are a coach giving the candidate an honest, direct read on their fit for a job. Write the assessment in "
        "SECOND-PERSON voice — address the candidate directly with 'you', 'your', 'you have', 'you built'. Never refer to "
        "'this candidate' or 'the candidate', and never use first-person 'I'/'my'. Speak TO the candidate, not about them. "
        "Be specific, direct, and reference actual companies, projects, and metrics from the resume.\n\n"
        "ABSOLUTE NO-HALLUCINATION RULE — violating this makes your output useless:\n"
        "• You may ONLY cite employers, companies, institutions, metrics, numbers, technologies, and projects that appear VERBATIM in the RESUME BODY below.\n"
        "• Do NOT invent, infer, or borrow facts from your training data, from the job description, or from typical candidates for this role.\n"
        "• Before writing each bullet or note: quote the exact phrase from the resume you are relying on (mentally). If you cannot find it verbatim, DO NOT write that bullet.\n"
        "• Never mention employers like 'Booz Allen', 'Google', 'Meta', etc. unless they appear in the resume. Never invent metrics like '1TB', '100M records', '5-person team' unless present.\n"
        "• If the resume lacks evidence for a JD requirement, say so honestly — do not fabricate evidence to fill the gap.\n\n"
        "Return ONLY valid JSON (no markdown, no fences, no explanation):\n"
        "{\n"
        '  "match_score": <overall fit 0-100>,\n'
        '  "criteria": [\n'
        '    {\n'
        '      "name": "<specific skill or requirement from JD>",\n'
        '      "weight": "<High if the JD lists it as required/core/must-have OR the company primary domain depends on it; Medium if clearly preferred but not blocking; Low only if explicitly optional or nice-to-have>",\n'
        '      "score": <1-10>,\n'
        '      "notes": "<honest note in SECOND PERSON, e.g. \'You built X at Y\' — quoting actual experience from the resume>"\n'
        '    }\n'
        "  ],\n"
        '  "whats_working": ["<second-person strength: \'You have...\', \'You built...\', \'Your experience with...\'>"],\n'
        '  "gaps": ["<second-person gap + how to address it: \'You lack X, but you can discuss Y to bridge this\'>"],\n'
        '  "verdict": "<2-3 sentence honest bottom line in second person: \'You have a strong foundation in X. While you lack Y, your experience with Z should make this a worthwhile pursuit.\'>"\n'
        "}\n\n"
        "Rules:\n"
        "- 6-10 criteria covering the most important JD requirements (mix of required and nice-to-have)\n"
        "- Weight rule: if your notes say 'core', 'primary', 'critical', 'required', or 'must' the weight MUST be High — never Low\n"
        "- Notes must name actual companies, projects, or metrics from the RESUME BODY — never generic, never invented\n"
        "- gaps must include a concrete second-person plan (e.g. 'You haven't used LangGraph, but your dual-LLM pipeline at VibeIMG shows you can quickly pick up agentic frameworks')\n"
        "- match_score must be honest — do not inflate it\n"
        "- whats_working: 3-5 bullets, gaps: 2-4 bullets\n"
        "- EVERY string in whats_working, gaps, and verdict must use second-person 'you'/'your' — no first-person 'I'/'my', no third-person 'this candidate' or 'the candidate' anywhere\n\n"
        f"JOB DESCRIPTION:\n{jd_snippet}\n\n"
        f"RESUME BODY (LaTeX — ignore formatting commands, read only the content. This is the ONLY source of truth about the candidate's experience):\n{latex_body[:6000]}"
    )
    # Use reasoning models for ratings: pro → flash → grok-4 (reasoning) → grok fast
    reasoning_chain: list[str] = [_REASONING_MODEL_GEMINI, primary_gemini_flash_model()]
    if os.environ.get("XAI_API_KEY"):
        reasoning_chain += [_REASONING_MODEL_GROK, "grok-4-1-fast-non-reasoning"]

    for i, m in enumerate(reasoning_chain):
        if i > 0:
            time.sleep(2)
        try:
            if _is_grok(m):
                result = _json_grok(m, prompt, temperature=1)
                if not result:
                    continue
            else:
                # Enable thinking for Gemini 2.5 models
                thinking_cfg = (
                    types.ThinkingConfig(thinking_budget=8000)
                    if "2.5" in m else None
                )
                gen_cfg = types.GenerateContentConfig(
                    temperature=1,  # required when thinking is on
                    **({"thinking_config": thinking_cfg} if thinking_cfg else {}),
                )
                r = client.models.generate_content(
                    model=m, contents=prompt, config=gen_cfg,
                )
                text = (r.text or "").strip()
                text = re.sub(r"^```[a-z]*\n?", "", text)
                text = re.sub(r"\n?```$", "", text)
                result = json.loads(text)
            logger.info(f"Ratings used model: {m}")
            return result
        except Exception as exc:
            logger.warning(f"Rating call failed on {m}: {exc}")
            _backoff_if_rate_limited(exc)
    return None


def _prose_signature(s: str) -> str:
    """Normalize prose for comparing LLM-reported before/after (no-op detection)."""
    if not s or not isinstance(s, str):
        return ""
    return re.sub(r"\s+", " ", s.strip())


def _sanitize_change_rationales(raw: Optional[List[Dict]]) -> List[Dict]:
    """Drop invalid entries and rewrote rows where plain before/after are identical."""
    out: List[Dict] = []
    for c in raw or []:
        if not isinstance(c, dict):
            continue
        t = c.get("type")
        if t not in ("added", "removed", "rewrote"):
            continue
        why = (c.get("why") or "").strip()
        if t == "added":
            txt = (c.get("text") or "").strip()
            if not txt:
                continue
            out.append({"type": "added", "text": txt, "why": why or "Added for JD alignment."})
        elif t == "removed":
            txt = (c.get("text") or "").strip()
            if not txt:
                continue
            out.append({"type": "removed", "text": txt, "why": why or "Trimmed for focus."})
        else:
            prev = (c.get("previous") or "").strip()
            txt = (c.get("text") or "").strip()
            if not prev or not txt:
                continue
            if _prose_signature(prev) == _prose_signature(txt):
                continue
            out.append({"type": "rewrote", "previous": prev, "text": txt, "why": why or "Reworded for clarity or JD fit."})
    return out


def _explain_changes(client, model: str, old_body: str, new_body: str, jd_snippet: str) -> Optional[List[Dict]]:
    """
    Ask the LLM to diff two resume bodies and produce a human-readable change list
    with a short rationale per change.

    Returns a list of dicts:
        [{"type": "added"|"removed"|"rewrote", "text": "...", "previous": "...", "why": "..."}]
    """
    prompt = (
        "You compare two versions of a candidate's resume (OLD vs NEW) that were tailored for a specific job description.\n"
        "Produce a plain-English change log so the candidate understands WHY each edit was made.\n\n"
        "STRICT RULES:\n"
        "• Only report MEANINGFUL content changes — ignore whitespace, LaTeX commands, punctuation, and formatting-only edits.\n"
        "• Strip all LaTeX commands from the text you output (no \\resumeItem{}, \\textbf{}, etc). Return clean prose.\n"
        "• Every bullet must trace to actual content in OLD or NEW — do not invent.\n"
        "• For type \"rewrote\": NEVER emit an entry if the old and new plain prose are the same — omit it entirely.\n"
        "• Rationale ('why') must be ONE concise sentence (max 20 words) tied to the JOB DESCRIPTION — "
        "e.g. 'JD emphasizes distributed systems, so the bullet now leads with gRPC + Kubernetes experience.'\n"
        "• Skip pure reordering with no wording change.\n\n"
        "Return ONLY valid JSON (no markdown, no fences):\n"
        "{\n"
        '  "changes": [\n'
        '    {"type": "added",   "text": "<new bullet in plain prose>",  "why": "<why it was added>"},\n'
        '    {"type": "removed", "text": "<old bullet in plain prose>",  "why": "<why it was dropped>"},\n'
        '    {"type": "rewrote", "text": "<new version>", "previous": "<old version>", "why": "<why it was rewritten>"}\n'
        "  ]\n"
        "}\n\n"
        "Rules: up to 15 changes total, most important first. If there are no meaningful changes return {\"changes\": []}.\n\n"
        f"JOB DESCRIPTION:\n{jd_snippet}\n\n"
        f"OLD RESUME (LaTeX):\n{old_body[:4500]}\n\n"
        f"NEW RESUME (LaTeX):\n{new_body[:4500]}"
    )
    analysis_chain: list[str] = [_REASONING_MODEL_GEMINI, primary_gemini_flash_model()]
    if os.environ.get("XAI_API_KEY"):
        analysis_chain += [_REASONING_MODEL_GROK, "grok-4-1-fast-non-reasoning"]
    for i, m in enumerate(analysis_chain):
        if i > 0:
            time.sleep(1)
        try:
            if _is_grok(m):
                data = _json_grok(m, prompt, temperature=1)
                if not data:
                    continue
            else:
                thinking_cfg = (
                    types.ThinkingConfig(thinking_budget=5000)
                    if "2.5" in m else None
                )
                gen_cfg = types.GenerateContentConfig(
                    temperature=1,
                    **({"thinking_config": thinking_cfg} if thinking_cfg else {}),
                )
                r = client.models.generate_content(
                    model=m, contents=prompt, config=gen_cfg,
                )
                text = (r.text or "").strip()
                text = re.sub(r"^```[a-z]*\n?", "", text)
                text = re.sub(r"\n?```$", "", text)
                data = json.loads(text)
            changes = data.get("changes") if isinstance(data, dict) else None
            if isinstance(changes, list):
                cleaned = _sanitize_change_rationales(changes)
                if m != model:
                    logger.info(f"Change explanations used fallback model: {m}")
                return cleaned
        except Exception as exc:
            logger.warning(f"Change explanation failed on {m}: {exc}")
            _backoff_if_rate_limited(exc)
    return None


# ============================================================================
# GENERATE — create a new tailored .tex resume
# ============================================================================

def _make_folder_name(company: str, role: str) -> str:
    role_slug = re.sub(r"[^\w]", "", role.title())
    company_slug = re.sub(r"[^\w]", "", company)
    return f"{company_slug}_{role_slug}"


def _get_candidate_profile_block() -> str:
    """Return the candidate profile text for LLM prompts.

    Priority order:
    1. CANDIDATE_PROFILE env var — set to a multiline profile string.
    2. Minimal contact block built from DEFAULT_CONTACT env vars.

    The full profile (experience, education, skills) must be provided via the
    CANDIDATE_PROFILE env var. No personal data is hardcoded here.
    """
    from_env = os.environ.get("CANDIDATE_PROFILE", "").strip()
    if from_env:
        return from_env + "\n\n"

    # Minimal fallback — contact header only
    c = DEFAULT_CONTACT
    return (
        f"Name: {c['name']}\n"
        f"Location: {c['location']}\n"
        f"Email: {c['email']} | Phone: {c['phone']}\n"
        f"Website: {c['website']} | LinkedIn: {c['linkedin_url']}\n\n"
        "(Set CANDIDATE_PROFILE env var with full experience/education/skills for better results.)\n\n"
    )


def generate_latex_resume(
    company: str,
    role: str,
    job_description: str,
    reference_folder: Optional[str] = None,
    compile_pdf: bool = True,
    model: Optional[str] = None,
    base_folder: Optional[str] = None,
    candidate_profile: Optional[str] = None,
) -> Dict:
    """
    Generate a tailored LaTeX resume for a specific job and save it to the library.

    Args:
        company:          Target company name
        role:             Target role title
        job_description:  Full JD text
        reference_folder: LaTeX style reference folder under LIBRARY_ROOT (wins over base_folder for macros/layout)
        compile_pdf:      Whether to run pdflatex
        model:            Gemini model ID
        base_folder:        Existing resume folder — content body to tailor; style comes from reference_folder when set
        candidate_profile: Multiline profile from the app (name, contact, experience); used for PDF header + LLM facts
    """
    model = primary_llm_model_for_resume_workloads(model)
    t_start = time.time()
    logger.info("=" * 60)
    logger.info(f"START  |  {role} @ {company}")
    logger.info(f"Model  |  {model}")

    # Style reference: explicit template first, then reuse base resume's .tex, then company heuristic, then default
    ref_folder = reference_folder or base_folder or _find_company_reference(company) or "Adobe_FullStack"
    logger.info(f"Style reference  |  {ref_folder}")
    reference_tex = get_resume_tex(ref_folder) or ""

    # Load base body for diff (only if explicitly selected by user)
    base_body = ""
    if base_folder:
        base_tex = get_resume_tex(base_folder) or ""
        base_body = _extract_body(base_tex)
        logger.info(f"Base resume loaded  |  {base_folder}  ({len(base_body)} chars)")

    client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])

    cp_prompt = (candidate_profile or "").strip() or None
    system_prompt, user_prompt = _build_prompts(
        company,
        role,
        job_description,
        base_body,
        reference_tex,
        candidate_profile=cp_prompt,
        accepted_suggestions=None,
        reference_folder=ref_folder,
    )

    logger.info(f"Calling {model} for resume generation (Google Search grounding enabled)...")
    t1 = time.time()
    response = client.models.generate_content(
        model=model,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.2,
            tools=[types.Tool(google_search=types.GoogleSearch())],
        ),
    )
    logger.info(f"LLM response  |  {time.time() - t1:.1f}s")

    latex_body = (response.text or "").strip()
    if latex_body.startswith("```"):
        latex_body = re.sub(r"^```[a-z]*\n?", "", latex_body)
        latex_body = re.sub(r"\n?```$", "", latex_body)
    latex_body, _ = _markdown_to_latex_bold(latex_body)
    latex_body = _strip_llm_markdown_citations(latex_body)
    logger.info(f"LaTeX body  |  {len(latex_body)} chars")

    # ── Diff ──────────────────────────────────────────────────────────────────
    diff_lines = []
    if base_body:
        logger.info("Computing diff...")
        old_lines = base_body.splitlines()
        new_lines = latex_body.splitlines()
        raw_diff = list(difflib.unified_diff(old_lines, new_lines, lineterm="", n=2))
        adds = removes = 0
        for line in raw_diff[2:]:  # skip --- and +++ header lines
            if line.startswith("+"):
                diff_lines.append({"type": "add", "text": line[1:]})
                adds += 1
            elif line.startswith("-"):
                diff_lines.append({"type": "remove", "text": line[1:]})
                removes += 1
            elif line.startswith("@@"):
                diff_lines.append({"type": "hunk", "text": line})
            else:
                diff_lines.append({"type": "context", "text": line[1:] if line.startswith(" ") else line})
        logger.info(f"Diff  |  +{adds} additions  -{removes} removals")

    # ── Ratings ───────────────────────────────────────────────────────────────
    logger.info("Calling Gemini for ratings...")
    t2 = time.time()
    ratings = _rate_resume(client, model, latex_body, job_description[:1500])
    logger.info(f"Ratings  |  {time.time() - t2:.1f}s  |  {ratings}")

    # ── Assemble + save ───────────────────────────────────────────────────────
    contact_hints = _contact_from_candidate_profile(candidate_profile) if candidate_profile else {}
    preamble = _build_export_preamble(reference_tex, role, company, contact_hints)
    full_tex = preamble + "\n" + latex_body + _LATEX_FOOTER

    folder_name = _make_folder_name(company, role)
    folder_path = os.path.join(LIBRARY_ROOT, folder_name)
    os.makedirs(folder_path, exist_ok=True)

    safe_company = re.sub(r"[^\w]", "", company)
    safe_role = re.sub(r"[^\w]", "", role.replace(" ", "_"))
    merged_owner = {**DEFAULT_CONTACT, **contact_hints}
    _safe_owner = re.sub(r"[^\w]", "_", (merged_owner.get("name") or "Resume").strip()) or "Resume"
    filename = f"{_safe_owner}_{safe_company}_{safe_role}_Resume"
    tex_path = os.path.join(folder_path, filename + ".tex")

    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(full_tex)
    logger.info(f"Saved .tex  |  {tex_path}")

    result = {
        "success": True,
        "folder": folder_name,
        "folder_path": folder_path,
        "tex_path": tex_path,
        "pdf_path": None,
        "latex_content": full_tex,
        "diff": diff_lines,
        "ratings": ratings,
    }

    # ── Compile PDF ───────────────────────────────────────────────────────────
    if compile_pdf and os.path.exists(PDFLATEX):
        logger.info("Compiling PDF with pdflatex...")
        t3 = time.time()
        try:
            proc = subprocess.run(
                [PDFLATEX, "-interaction=nonstopmode", "-output-directory", folder_path, tex_path],
                capture_output=True, text=True, timeout=60,
            )
            pdf_path = os.path.join(folder_path, filename + ".pdf")
            if os.path.exists(pdf_path):
                result["pdf_path"] = pdf_path
                result["compiled"] = True
                logger.info(f"PDF compiled  |  {time.time() - t3:.1f}s")
            else:
                result["compiled"] = False
                result["compile_error"] = proc.stdout[-500:] if proc.stdout else proc.stderr[-500:]
                logger.warning(f"PDF compile failed  |  {result['compile_error'][:200]}")
        except Exception as exc:
            result["compiled"] = False
            result["compile_error"] = str(exc)
            logger.warning(f"PDF compile exception  |  {exc}")
    else:
        result["compiled"] = False
        result["compile_note"] = "pdflatex not found or compile_pdf=False."
        logger.info("Skipping PDF compile")

    logger.info(f"DONE  |  total {time.time() - t_start:.1f}s")
    logger.info("=" * 60)
    return result


# ============================================================================
# STREAM — same pipeline but yields SSE-friendly event dicts in real-time
# ============================================================================

def _latex_tailor_system_instruction() -> str:
    """System instruction for LaTeX body generation (Gemini + Google Search)."""
    return (
        "You are an expert LaTeX resume writer specializing in ATS-optimized resumes "
        "for professional roles (engineering, analytics, business, operations, etc.). "
        "You will generate a LaTeX resume body tailored for a specific job.\n\n"
        "GOOGLE SEARCH — REQUIRED EARLY: You have Google Search enabled. You MUST issue at least "
        "2 `google_search` tool calls early in the run before producing the LaTeX body. "
        "Use queries to learn how the target company describes products/engineering, public careers "
        "or engineering pages, common stack names for the role, and decode dense JD acronyms/product names. "
        "Use findings for **wording, bullet order, section emphasis, and honest keyword overlap** with skills and "
        "domains already evidenced in the CANDIDATE PROFILE (or current résumé body). "
        "**Hard boundary:** employers, job titles, employment dates, schools, degrees, projects, certifications, and "
        "**all numbers and metrics** about the applicant must still come **only** from the CANDIDATE PROFILE and any "
        "CURRENT RESUME BODY supplied — never invented or \"borrowed\" from the web.\n\n"
        "CANDIDATE BIOGRAPHY — NON-NEGOTIABLE (fraudulent if violated):\n"
        "1. EMPLOYER NAMES: The ONLY employers, companies, and institutions that may appear are those explicitly named "
        "in the CANDIDATE PROFILE (or in the supplied current résumé body when that line is clearly sourced there). "
        "Do NOT add, infer, rename, or substitute any other employer or company name.\n"
        "2. METRICS & NUMBERS: The ONLY numbers, percentages, user counts, revenue figures, or statistics that may appear "
        "are those explicitly stated in the CANDIDATE PROFILE (or supplied résumé body). Do NOT round up, extrapolate, "
        "or invent new figures.\n"
        "3. EXPERIENCE & ACHIEVEMENT SUBSTANCE: Rephrase bullets for ATS/JD fit **within** each role or section. "
        "Do **not** add new roles, clients, tools used in a role, or responsibilities that are not supported by the profile or pasted résumé. "
        "Keep **section order and entry grouping** per STRUCTURE rules below — do not reorder whole sections into a different archetype. "
        "You **may** align phrasing with the JD when it clearly matches work already described (e.g. say "
        "\"distributed systems\" if the profile describes equivalent work without that exact phrase).\n"
        "4. BIOGRAPHICAL CHECK: Before each experience, education, or project bullet, confirm the substance is backed "
        "by the profile or current résumé body. If not, omit it.\n"
        "5. Use the exact LaTeX macro vocabulary from the REFERENCE only. Examples: "
        "\\resumeSubheading, \\resumeProjectHeading, \\resumeItem, \\resumeSubHeadingListStart, \\resumeItemListStart "
        "OR (other templates) \\resumeQuadHeading, \\resumeTrioHeading — use whichever commands actually appear in the "
        "reference snippet. Never mix incompatible macro sets.\n"
        "6. Output ONLY the LaTeX body — no preamble, no \\documentclass, no \\begin{document} or \\end{document}\n"
        "7. To bold the most relevant skills and technologies for this job, use the LaTeX command \\textbf{...} ONLY. "
        "Never use Markdown bold syntax like **word** — pdflatex prints those asterisks literally instead of rendering bold text.\n"
        "8. EDUCATION SECTION LOCK: Reproduce the EDUCATION section EXACTLY as it appears in the CANDIDATE PROFILE. "
        "Do NOT rephrase, reorder, abbreviate, change degree names, university names, dates, or locations. "
        "Same institutions, same degree names, same dates, same order — verbatim copy.\n"
        "GPA in education: include only if explicitly stated in the CANDIDATE PROFILE and the profile is consistent "
        "with UMBC guidance (typically list GPA when 3.00 or above).\n"
        "9. RESUME STRUCTURE LOCK (this overrides generic career-center templates): The CANDIDATE PROFILE (and any "
        "CURRENT RESUME BODY) reflects how **this applicant** already organized their résumé. You MUST preserve: "
        "(a) the same **major section headings** (use \\section{...} titles that match or closely match the profile); "
        "(b) the same **top-to-bottom order** of sections; (c) the same **grouping** of employers, schools, and projects "
        "under those headings. Use the REFERENCE snippet **only** for LaTeX macro syntax (e.g. \\resumeSubheading, "
        "\\resumeItem) — **not** to impose a different document shape. Do **not** convert the CV into a software-default "
        "or UMBC-style outline. Do **not** add Objective, Summary, or multi-tier Skills sections that are **absent** "
        "from the profile. If the profile is linear text from a PDF, keep that narrative flow. Tailoring = stronger "
        "wording and honest JD keywords **inside** existing lines; not a new layout.\n"
        "10. PLACEMENT: After the contact/header block, follow the profile's section order — do not force Objective or "
        "Summary before experience if the profile leads with Experience or another section.\n"
        "11. LENGTH: Prefer one page when the profile fits; tighten wording before dropping real sections or employers.\n"
        "12. Do not invent high school entries unless they appear in the CANDIDATE PROFILE.\n"
        "13. CITATIONS: Never output Markdown footnotes, bracketed citation markers, or raw URLs used for web "
        "grounding (for example `[[1]](https://...)` or `[[2]]`). The résumé must read as a clean PDF — "
        "search is for your reasoning only, not for visible references in the LaTeX."
    )


def _latex_tailor_system_instruction_no_live_search() -> str:
    """Same tailor rules as the grounded path, but no live Google Search / tool calls in this request."""
    return (
        "You are an expert LaTeX resume writer specializing in ATS-optimized resumes "
        "for professional roles (engineering, analytics, business, operations, etc.). "
        "You will generate a LaTeX resume body tailored for a specific job.\n\n"
        "RESEARCH CONTEXT (no live search in this step): The user message includes a **JOB & MARKET CONTEXT** block "
        "from live web research that already ran **before** PDF generation (the same pass as résumé suggestions). "
        "Use that block plus the job description for **wording, acronym decoding, bullet order, section emphasis, and "
        "honest keyword overlap** with skills and domains already evidenced in the CANDIDATE PROFILE (or current résumé body). "
        "**Hard boundary:** employers, job titles, employment dates, schools, degrees, projects, certifications, and "
        "**all numbers and metrics** about the applicant must still come **only** from the CANDIDATE PROFILE and any "
        "CURRENT RESUME BODY supplied — never invented or inferred from the digest alone.\n\n"
        "CANDIDATE BIOGRAPHY — NON-NEGOTIABLE (fraudulent if violated):\n"
        "1. EMPLOYER NAMES: The ONLY employers, companies, and institutions that may appear are those explicitly named "
        "in the CANDIDATE PROFILE (or in the supplied current résumé body when that line is clearly sourced there). "
        "Do NOT add, infer, rename, or substitute any other employer or company name.\n"
        "2. METRICS & NUMBERS: The ONLY numbers, percentages, user counts, revenue figures, or statistics that may appear "
        "are those explicitly stated in the CANDIDATE PROFILE (or supplied résumé body). Do NOT round up, extrapolate, "
        "or invent new figures.\n"
        "3. EXPERIENCE & ACHIEVEMENT SUBSTANCE: Rephrase bullets for ATS/JD fit **within** each role or section. "
        "Do **not** add new roles, clients, tools used in a role, or responsibilities that are not supported by the profile or pasted résumé. "
        "Keep **section order and entry grouping** per STRUCTURE rules below — do not reorder whole sections into a different archetype. "
        "You **may** align phrasing with the JD when it clearly matches work already described (e.g. say "
        "\"distributed systems\" if the profile describes equivalent work without that exact phrase).\n"
        "4. BIOGRAPHICAL CHECK: Before each experience, education, or project bullet, confirm the substance is backed "
        "by the profile or current résumé body. If not, omit it.\n"
        "5. Use the exact LaTeX macro vocabulary from the REFERENCE only. Examples: "
        "\\resumeSubheading, \\resumeProjectHeading, \\resumeItem, \\resumeSubHeadingListStart, \\resumeItemListStart "
        "OR (other templates) \\resumeQuadHeading, \\resumeTrioHeading — use whichever commands actually appear in the "
        "reference snippet. Never mix incompatible macro sets.\n"
        "6. Output ONLY the LaTeX body — no preamble, no \\documentclass, no \\begin{document} or \\end{document}\n"
        "7. To bold the most relevant skills and technologies for this job, use the LaTeX command \\textbf{...} ONLY. "
        "Never use Markdown bold syntax like **word** — pdflatex prints those asterisks literally instead of rendering bold text.\n"
        "8. EDUCATION SECTION LOCK: Reproduce the EDUCATION section EXACTLY as it appears in the CANDIDATE PROFILE. "
        "Do NOT rephrase, reorder, abbreviate, change degree names, university names, dates, or locations. "
        "Same institutions, same degree names, same dates, same order — verbatim copy.\n"
        "GPA in education: include only if explicitly stated in the CANDIDATE PROFILE and the profile is consistent "
        "with UMBC guidance (typically list GPA when 3.00 or above).\n"
        "9. RESUME STRUCTURE LOCK (this overrides generic career-center templates): The CANDIDATE PROFILE (and any "
        "CURRENT RESUME BODY) reflects how **this applicant** already organized their résumé. You MUST preserve: "
        "(a) the same **major section headings** (use \\section{...} titles that match or closely match the profile); "
        "(b) the same **top-to-bottom order** of sections; (c) the same **grouping** of employers, schools, and projects "
        "under those headings. Use the REFERENCE snippet **only** for LaTeX macro syntax (e.g. \\resumeSubheading, "
        "\\resumeItem) — **not** to impose a different document shape. Do **not** convert the CV into a software-default "
        "or UMBC-style outline. Do **not** add Objective, Summary, or multi-tier Skills sections that are **absent** "
        "from the profile. If the profile is linear text from a PDF, keep that narrative flow. Tailoring = stronger "
        "wording and honest JD keywords **inside** existing lines; not a new layout.\n"
        "10. PLACEMENT: After the contact/header block, follow the profile's section order — do not force Objective or "
        "Summary before experience if the profile leads with Experience or another section.\n"
        "11. LENGTH: Prefer one page when the profile fits; tighten wording before dropping real sections or employers.\n"
        "12. Do not invent high school entries unless they appear in the CANDIDATE PROFILE.\n"
        "13. CITATIONS: Never output Markdown footnotes, bracketed citation markers, or raw URLs in the LaTeX. "
        "The résumé must read as a clean PDF."
    )


def _user_prompt_research_tail(company: str, role: str) -> str:
    """Encourage Google Search for company/JD context (not for inventing candidate facts)."""
    c = (company or "").strip() or "the target company"
    r = (role or "").strip() or "the role"
    return (
        f"---\nWEB RESEARCH (run unless the JD + profile already answer everything): Issue a few **specific** Google "
        f"searches early (e.g. {c!r} engineering blog, {c!r} careers {r!r}, {c!r} product engineering, or look up "
        "opaque acronyms from the JD). Briefly use what you learn for terminology, emphasis, and honest keyword fit "
        "with the candidate's stated skills — **not** to add employers, schools, dates, projects, or metrics for the applicant.\n\n"
    )


def _user_prompt_tail_pre_researched() -> str:
    """User-message tail when web research was already run before suggestions (no second search this step)."""
    return (
        "---\nWEB RESEARCH: A live search pass **already ran** before suggestions; the JOB & MARKET CONTEXT block above "
        "is that digest. Do **not** assume you can run additional web searches in this step — rely on that block, the JD, "
        "and the profile only.\n\n"
    )


def _profile_section_for_tailor_prompt(candidate_profile: Optional[str]) -> str:
    if candidate_profile and str(candidate_profile).strip():
        return str(candidate_profile).strip()[:12000] + "\n\n"
    return _get_candidate_profile_block()


def _sanitize_accepted_suggestions(raw: Optional[List]) -> List[Dict]:
    """Normalize client `accepted_suggestions` JSON for tailor prompts (structured layer before LaTeX)."""
    out: List[Dict] = []
    if not raw or not isinstance(raw, list):
        return out
    for item in raw[:24]:
        if not isinstance(item, dict):
            continue
        sid = str(item.get("id") or "").strip()[:64]
        sec = str(item.get("section") or "").strip()[:120]
        orig = str(item.get("original") or "").strip()[:2000]
        sugg = str(item.get("suggested") or "").strip()[:2000]
        why = str(item.get("reason") or "").strip()[:500]
        if not orig:
            continue
        remove = _is_removal_suggestion(sugg)
        if not remove and not sugg:
            continue
        out.append(
            {
                "id": sid or f"e{len(out)}",
                "section": sec or "—",
                "original": orig,
                "suggested": sugg,
                "reason": why,
                "remove": remove,
            }
        )
    return out


def _accepted_suggestions_prompt_block(items: List[Dict]) -> str:
    lines = [
        "\n---\nUSER-APPROVED STRUCTURED EDITS (the candidate explicitly accepted these in the app — implement every one):\n",
    ]
    for i, it in enumerate(items, 1):
        if it.get("remove"):
            lines.append(
                f"{i}. Section: {it['section']}\n"
                f"   DELETE ENTIRELY (remove the matching bullet or line — no replacement, no empty bullet, no placeholder):\n"
                f"   TARGET TEXT (verbatim or closest matching line in the resume body): {it['original']}\n"
                f"   Rationale: {it['reason']}\n"
            )
        else:
            lines.append(
                f"{i}. Section: {it['section']}\n"
                f"   FIND (verbatim or closest matching line in the resume body): {it['original']}\n"
                f"   REPLACE WITH: {it['suggested']}\n"
                f"   Rationale: {it['reason']}\n"
            )
    lines.append(
        "Rules for the block above:\n"
        "- DELETE: remove the full \\resumeItem{...} (or equivalent bullet macro) for that line — do not leave URLs, "
        "footnotes, or blank bullets.\n"
        "- REPLACE: apply each edit in LaTeX using the same \\resumeItem / heading style as the reference; "
        "do not skip any numbered item.\n"
        "- Preserve facts, employers, dates, and metrics unless the replacement text explicitly changes them.\n"
        "- Do not invent additional bullet rewrites beyond these approvals and light JD alignment elsewhere.\n"
    )
    return "\n".join(lines)


def _reference_folder_layout_hint(reference_folder: Optional[str]) -> str:
    """Extra LaTeX rules when the client selected a known gallery reference folder."""
    f = (reference_folder or "").strip()
    if f == "Harshibar_Template1":
        return (
            "\n---\nLAYOUT — HARSHIBAR (this run uses the Harshibar reference folder): Follow the REFERENCE’s "
            "\\resumeSubheading / \\resumeProjectHeading / \\resumeItem / list macros (sans tgheros stack). "
            "For SKILLS, use \\resumeItemListStart … \\resumeItem{…} … \\resumeItemListEnd. Put each skill category in its own "
            "\\resumeItem, e.g. \\resumeItem{\\textbf{Programming \\& query languages:} SQL, Python, R} — never glue a word "
            "directly to \\textbf (bad: `Languages\\textbf{{SQL}}`; good: `Languages: \\textbf{{SQL}}, …` or separate \\resumeItem rows). "
            "Separate tokens with commas, middle dots (·), or ` | `. Do not output Markdown asterisk-bold; use LaTeX \\textbf{{}} only. "
            "On \\resumeSubheading lines, keep a visible space between the employer name and the month/date "
            "(e.g. `Morgan Stanley` then `Dec 2023`, not `Morgan StanleyDec 2023`).\n"
        )
    if f == "MaltaCV_Modern":
        return (
            "\n---\nLAYOUT — MALTA MODERN (this run uses MaltaCV_Modern): Follow the REFERENCE’s \\cvsection, "
            "\\cvexperience, \\cvuniversity, \\cvlistitem, and any multi-column / skills macros exactly as shown. "
            "Section titles use the reference’s accent styling — do not substitute a different section-macro family. "
            "Do not output Markdown `**`; use \\textbf{{}} or the reference’s emphasis pattern. "
            "Keep skills readable (columns or list items per the reference), not a single run-on paragraph.\n"
        )
    return ""


def _build_prompts(
    company,
    role,
    job_description,
    base_body,
    reference_tex,
    candidate_profile=None,
    accepted_suggestions: Optional[List] = None,
    pre_research_digest: Optional[str] = None,
    system_instruction: Optional[str] = None,
    reference_folder: Optional[str] = None,
):
    """Shared prompt builder used by both stream and non-stream paths."""
    system_prompt = (
        system_instruction
        if system_instruction is not None
        else _latex_tailor_system_instruction()
    )
    digest_d = (pre_research_digest or "").strip()
    digest_block = ""
    if digest_d:
        digest_block = (
            "\n---\nJOB & MARKET CONTEXT (from live web search before PDF generation — same research pass as "
            "suggestions; use for terminology, JD vocabulary, and honest keyword overlap only; do NOT add employers, "
            "degrees, dates, or metrics not already in the résumé or JD):\n"
            f"{digest_d[:4500]}\n\n"
        )
    research_tail = (
        _user_prompt_tail_pre_researched()
        if digest_d
        else _user_prompt_research_tail(company, role)
    )
    base_section = ""
    if base_body:
        base_section = (
            f"\n---\nCURRENT RESUME BODY (LaTeX body from a prior save — preserve its section skeleton when tailoring for {role} at {company}):\n"
            f"{base_body[:5500]}\n"
        )

    profile_section = _profile_section_for_tailor_prompt(candidate_profile)
    structure_block = (
        "---\nSTRUCTURE — the CANDIDATE PROFILE text is the source-of-truth outline:\n"
        "- Keep the **same major sections, same vertical order, and same employer/school/project grouping** as in that text.\n"
        "- The REFERENCE LaTeX block teaches **macro syntax only**; do not treat it as a document to imitate section-by-section.\n"
        "- Do not replace the applicant's layout with a generic career-center or engineer-default template.\n\n"
    )
    approved = _sanitize_accepted_suggestions(accepted_suggestions)
    approved_block = _accepted_suggestions_prompt_block(approved) if approved else ""

    closing = (
        f"---\nGenerate ONLY the LaTeX body content (no preamble, no \\begin{{document}}, no \\end{{document}})."
    )
    if approved:
        closing += (
            " Honor USER-APPROVED STRUCTURED EDITS first — including every DELETE (omit that bullet entirely from LaTeX) — "
            "then align other bullets with the JD where it does not conflict."
            " Keep the same section layout as the CANDIDATE PROFILE unless an approved edit explicitly changes it."
        )
    else:
        closing += (
            f" Tailor bullet points to emphasize what matters most for {role} at {company}, "
            "without changing the profile's section order or inventing new sections."
        )

    ref_hint = _reference_folder_layout_hint(reference_folder)

    user_prompt = (
        f"Generate a tailored LaTeX resume body for this application:\n\n"
        f"TARGET ROLE: {role}\nTARGET COMPANY: {company}\n\n"
        f"JOB DESCRIPTION:\n{job_description[:3000]}\n\n"
        f"---\nCANDIDATE PROFILE (biographical facts for this applicant — do not contradict or extend with the web):\n\n"
        f"{profile_section}"
        f"{structure_block}"
        f"{base_section}"
        f"{digest_block}"
        f"{approved_block}"
        f"---\nREFERENCE LaTeX SYNTAX (typeset the profile's sections using these commands only — do not copy this file's section order or content as your outline):\n{reference_tex[:6500]}\n\n"
        f"{ref_hint}"
        f"{research_tail}"
        f"{closing}"
    )
    return system_prompt, user_prompt


def _extract_sources(candidates) -> list:
    """Pull grounding web sources from Gemini response candidates."""
    sources = []
    seen = set()
    for cand in (candidates or []):
        gm = getattr(cand, "grounding_metadata", None)
        if not gm:
            continue
        for chunk in getattr(gm, "grounding_chunks", []) or []:
            web = getattr(chunk, "web", None)
            if web and getattr(web, "uri", None):
                url = web.uri
                if url not in seen:
                    seen.add(url)
                    sources.append({"title": getattr(web, "title", url), "url": url})
    return sources


def _extract_grounding_live(candidates) -> Tuple[List[str], List[Dict]]:
    """
    Pull (queries, sources) from a streaming chunk's candidates.

    Gemini populates grounding_metadata incrementally as the model issues
    Google Search calls during generation. Returns the queries Gemini sent
    to Google (e.g. 'Bloomberg AI Assistant team requirements 2025') and the
    pages it ended up citing.

    Caller is responsible for de-duping across chunks.
    """
    queries: List[str] = []
    sources: List[Dict] = []
    for cand in (candidates or []):
        gm = getattr(cand, "grounding_metadata", None)
        if not gm:
            continue
        for q in (getattr(gm, "web_search_queries", None) or []):
            qs = q.strip() if isinstance(q, str) else str(q).strip()
            if qs:
                queries.append(qs)
        for chunk in (getattr(gm, "grounding_chunks", None) or []):
            web = getattr(chunk, "web", None)
            if web and getattr(web, "uri", None):
                sources.append({"title": getattr(web, "title", web.uri), "url": web.uri})
    return queries, sources


def _grounding_signal_score(candidates) -> int:
    """How much Google Search grounding is attached to this candidate list (pick richest chunk in stream)."""
    n = 0
    for cand in candidates or []:
        gm = getattr(cand, "grounding_metadata", None)
        if not gm:
            continue
        n += len(getattr(gm, "web_search_queries", None) or [])
        n += len(getattr(gm, "grounding_chunks", None) or [])
    return n


def _compute_diff(base_body: str, new_body: str) -> tuple:
    """Return (diff_lines list, adds int, removes int)."""
    old_lines = base_body.splitlines()
    new_lines = new_body.splitlines()
    raw = list(difflib.unified_diff(old_lines, new_lines, lineterm="", n=2))
    diff_lines, adds, removes = [], 0, 0
    for line in raw[2:]:
        if line.startswith("+"):
            diff_lines.append({"type": "add",     "text": line[1:]}); adds += 1
        elif line.startswith("-"):
            diff_lines.append({"type": "remove",  "text": line[1:]}); removes += 1
        elif line.startswith("@@"):
            diff_lines.append({"type": "hunk",    "text": line})
        else:
            diff_lines.append({"type": "context", "text": line[1:] if line.startswith(" ") else line})
    return diff_lines, adds, removes


def _save_and_compile(
    company,
    role,
    latex_body,
    compile_pdf=True,
    reference_tex: Optional[str] = None,
    candidate_profile: Optional[str] = None,
):
    """Assemble full .tex, save to library, optionally compile PDF. Returns result dict."""
    contact_hints = _contact_from_candidate_profile(candidate_profile) if candidate_profile else {}
    preamble = _build_export_preamble(reference_tex, role, company, contact_hints)
    full_tex  = preamble + "\n" + latex_body + _LATEX_FOOTER

    folder_name = _make_folder_name(company, role)
    folder_path = os.path.join(LIBRARY_ROOT, folder_name)
    os.makedirs(folder_path, exist_ok=True)

    safe_company = re.sub(r"[^\w]", "", company)
    safe_role    = re.sub(r"[^\w]", "", role.replace(" ", "_"))
    merged_owner = {**DEFAULT_CONTACT, **contact_hints}
    _safe_owner  = re.sub(r"[^\w]", "_", (merged_owner.get("name") or "Resume").strip()) or "Resume"
    filename     = f"{_safe_owner}_{safe_company}_{safe_role}_Resume"
    tex_path     = os.path.join(folder_path, filename + ".tex")

    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(full_tex)
    logger.info(f"Saved .tex  |  {tex_path}")

    result = {"folder": folder_name, "folder_path": folder_path, "tex_path": tex_path, "pdf_path": None}

    if compile_pdf and os.path.exists(PDFLATEX):
        logger.info("Compiling PDF...")
        t = time.time()
        try:
            proc = subprocess.run(
                [PDFLATEX, "-interaction=nonstopmode", "-output-directory", folder_path, tex_path],
                capture_output=True, text=True, timeout=60,
            )
            pdf_path = os.path.join(folder_path, filename + ".pdf")
            if os.path.exists(pdf_path):
                result["pdf_path"] = pdf_path
                result["compiled"] = True
                logger.info(f"PDF compiled  |  {time.time()-t:.1f}s")
            else:
                # Surface the failure — previously this was silently swallowed
                # into result["compile_error"], which broke the Supabase upload
                # chain because the "pdf" event never fired. Log the tail so
                # missing LaTeX packages etc. are debuggable from Railway logs.
                tail = (proc.stdout[-800:] if proc.stdout else "") or (proc.stderr[-800:] if proc.stderr else "")
                result["compiled"]      = False
                result["compile_error"] = tail or f"exit={proc.returncode}"
                logger.warning(
                    f"PDF compile FAILED  |  exit={proc.returncode}  |  tex={tex_path}\n"
                    f"pdflatex tail:\n{tail}"
                )
        except Exception as exc:
            result["compiled"]      = False
            result["compile_error"] = str(exc)
            logger.warning(f"PDF compile EXCEPTION  |  {exc}")
    else:
        result["compiled"]      = False
        result["compile_note"]  = "pdflatex not found or disabled."
        logger.warning(
            f"pdflatex not found  |  PDFLATEX={PDFLATEX}  |  exists={os.path.exists(PDFLATEX) if PDFLATEX else False}"
        )
    return result


def stream_latex_resume(
    company: str,
    role: str,
    job_description: str,
    reference_folder: Optional[str] = None,
    compile_pdf: bool = True,
    model: Optional[str] = None,
    base_folder: Optional[str] = None,
    candidate_profile: Optional[str] = None,
    user_id: Optional[str] = None,
    layout_compile: bool = False,
    accepted_suggestions: Optional[List] = None,
    pre_research_digest: Optional[str] = None,
):
    """
    Generator that yields SSE-style event dicts while generating the resume.

    Events:
      {"event": "status",  "msg": "..."}
      {"event": "chunk",   "text": "..."}      # streamed LaTeX
      {"event": "sources", "urls": [...]}       # sites from web research during generation
      {"event": "diff",    "data": [...], "adds": N, "removes": N}
      {"event": "ratings", "data": {...}}
      {"event": "saved",   "folder": "...", "tex_path": "..."}
      {"event": "pdf",     "url": "..."}
      {"event": "done"}
      {"event": "error",   "msg": "..."}

    Optional ``accepted_suggestions`` is a list of dicts from the client
    ``{id, section, original, suggested, reason}`` — user-approved bullet edits applied in the prompt before LaTeX is generated.

    Optional ``pre_research_digest`` is plain text from the suggest-changes web-research pass. When non-empty
    (and this is not ``layout_compile``), live Google Search / Grok web_search is **skipped** for PDF generation
    and the digest is injected into the user prompt instead — one research pass for both suggestions and PDF.
    """
    try:
        model = primary_llm_model_for_resume_workloads(model)
        t_start = time.time()
        logger.info("=" * 60)
        logger.info(f"STREAM  |  {role} @ {company}  |  model={model}")

        ref_folder = reference_folder or base_folder or _find_company_reference(company) or "Adobe_FullStack"
        yield {"event": "status", "msg": f"Loading style reference ({ref_folder})…"}
        reference_tex = get_resume_tex(ref_folder) or ""

        base_body = ""
        if base_folder:
            base_tex  = _get_resume_tex_for_user(base_folder, user_id) or ""
            base_body = _extract_body(base_tex)
            logger.info(f"Base resume  |  {base_folder}  ({len(base_body)} chars)")
            yield {"event": "base", "folder": base_folder, "loaded": bool(base_body), "chars": len(base_body)}

        client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
        n_approved = len(_sanitize_accepted_suggestions(accepted_suggestions))
        if n_approved:
            logger.info(f"Structured user-approved edits  |  {n_approved} item(s)")
        digest_for_prompt = ((pre_research_digest or "").strip() if not layout_compile else "")
        skip_live_web = bool(digest_for_prompt)
        if skip_live_web:
            logger.info(
                "PDF stream: reusing pre-suggestion web digest — disabling live Google Search / Grok web_search "
                f"({len(digest_for_prompt)} chars)"
            )
        system_inst = _latex_tailor_system_instruction_no_live_search() if skip_live_web else None
        system_prompt, user_prompt = _build_prompts(
            company,
            role,
            job_description,
            base_body,
            reference_tex,
            candidate_profile=candidate_profile,
            accepted_suggestions=accepted_suggestions,
            pre_research_digest=digest_for_prompt or None,
            system_instruction=system_inst,
            reference_folder=ref_folder,
        )

        _fallback_models = _model_chain(model)

        latex_body      = ""
        last_candidates = []

        # Sources collected from whichever provider wins the fallback race.
        grok_sources: List[Dict] = []
        # De-dup state for live grounding events so we don't re-yield the same
        # search query / source URL across multiple stream chunks.
        seen_queries: set = set()
        seen_source_urls: set = set()

        for idx, _m in enumerate(_fallback_models):
            provider = "Grok" if _is_grok(_m) else "Gemini"
            yield {"event": "status", "msg": "Generating with AI…"}
            logger.info(f"Starting stream  |  {_m}  |  provider={provider}")
            t1 = time.time()
            try:
                best_grounding_candidates = None
                best_grounding_score = -1
                if _is_grok(_m):
                    # xAI Responses API path with web_search tool. _stream_grok
                    # yields typed event dicts: text deltas, search queries, and
                    # citation sources — fire each onto the same SSE stream the
                    # frontend already handles for Gemini grounding.
                    for ev in _stream_grok(_m, system_prompt, user_prompt, 0.2, web_search=not layout_compile and not skip_live_web):
                        et = ev.get("type")
                        if et == "text":
                            delta = ev.get("delta") or ""
                            if delta:
                                latex_body += delta
                                yield {"event": "chunk", "text": delta}
                        elif et == "query":
                            q = ev.get("query") or ""
                            if q and q not in seen_queries:
                                seen_queries.add(q)
                                logger.info(f"🔍 Grok web_search  |  {q}")
                                yield {"event": "search_query", "query": q}
                        elif et == "source":
                            u = ev.get("url")
                            if u and u not in seen_source_urls:
                                seen_source_urls.add(u)
                                grok_sources.append({"title": ev.get("title"), "url": u})
                                yield {"event": "search_source", "title": ev.get("title"), "url": u}
                else:
                    # Gemini path — Google Search grounding (retry same model on
                    # transient 503 UNAVAILABLE / "high demand" before fallback chain).
                    _gemini_stream_attempts = 3
                    for _gem_attempt in range(_gemini_stream_attempts):
                        best_grounding_candidates = None
                        best_grounding_score = -1
                        try:
                            if layout_compile or skip_live_web:
                                _gem_cfg = types.GenerateContentConfig(
                                    system_instruction=system_prompt,
                                    temperature=0.2,
                                )
                            else:
                                _gem_cfg = types.GenerateContentConfig(
                                    system_instruction=system_prompt,
                                    temperature=0.2,
                                    tools=[types.Tool(google_search=types.GoogleSearch())],
                                )
                            stream = client.models.generate_content_stream(
                                model=_m,
                                contents=user_prompt,
                                config=_gem_cfg,
                            )
                            for chunk in stream:
                                if getattr(chunk, "candidates", None):
                                    last_candidates = chunk.candidates
                                    sc = _grounding_signal_score(chunk.candidates)
                                    if sc > best_grounding_score:
                                        best_grounding_score = sc
                                        best_grounding_candidates = chunk.candidates
                                    # Surface Google Search activity live as Gemini
                                    # issues queries / discovers sources mid-generation.
                                    new_q, new_s = _extract_grounding_live(chunk.candidates)
                                    for q in new_q:
                                        if q not in seen_queries:
                                            seen_queries.add(q)
                                            logger.info(f"🔍 Google search  |  {q}")
                                            yield {"event": "search_query", "query": q}
                                    for s in new_s:
                                        u = s.get("url")
                                        if u and u not in seen_source_urls:
                                            seen_source_urls.add(u)
                                            yield {"event": "search_source", "title": s.get("title"), "url": u}
                                text = getattr(chunk, "text", None)
                                if text:
                                    latex_body += text
                                    yield {"event": "chunk", "text": text}

                            # Gemini often attaches the richest grounding_metadata only on
                            # a late chunk; earlier chunks may have empty metadata. Flush
                            # from the chunk we saw with the most queries + citation URLs
                            # so the UI still gets search_query / search_source SSE events.
                            _flush_cands = (
                                best_grounding_candidates
                                if best_grounding_score > 0
                                else (last_candidates if last_candidates else None)
                            )
                            if _flush_cands:
                                fq, fs = _extract_grounding_live(_flush_cands)
                                for q in fq:
                                    if q not in seen_queries:
                                        seen_queries.add(q)
                                        logger.info(f"🔍 Google search (post-stream)  |  {q}")
                                        yield {"event": "search_query", "query": q}
                                for s in fs:
                                    u = s.get("url")
                                    if u and u not in seen_source_urls:
                                        seen_source_urls.add(u)
                                        yield {"event": "search_source", "title": s.get("title"), "url": u}
                            break
                        except Exception as _gem_e:
                            if (
                                _gem_attempt + 1 < _gemini_stream_attempts
                                and _transient_provider_error(_gem_e)
                            ):
                                logger.warning(
                                    f"Gemini stream attempt {_gem_attempt + 1}/{_gemini_stream_attempts} "
                                    f"failed (transient): {_gem_e}"
                                )
                                yield {"event": "status", "msg": "AI is busy — retrying shortly…"}
                                latex_body = ""
                                last_candidates = []
                                _backoff_if_rate_limited(_gem_e)
                                continue
                            raise

                if latex_body:
                    break  # got real content — exit fallback loop
                else:
                    logger.warning(f"Model {_m} returned empty body — trying next fallback")
                    yield {"event": "status", "msg": "AI returned an empty response — trying again…"}
                    last_candidates = []
            except Exception as _e:
                logger.warning(f"Model {_m} failed: {_e} — trying next fallback")
                yield {"event": "status", "msg": "AI temporarily unavailable — trying again…"}
                latex_body = ""
                last_candidates = []
                grok_sources = []
                _backoff_if_rate_limited(_e)
            if idx + 1 < len(_fallback_models) and not latex_body:
                time.sleep(2)

        logger.info(f"Stream complete  |  {time.time()-t1:.1f}s  |  {len(latex_body)} chars")

        # Strip accidental fences
        latex_body = latex_body.strip()
        if latex_body.startswith("```"):
            latex_body = re.sub(r"^```[a-z]*\n?", "", latex_body)
            latex_body = re.sub(r"\n?```$", "", latex_body)

        # Defensive: convert Markdown bold (**word**) → \textbf{word}.
        # The prompt forbids this, but Grok in particular tends to default to
        # Markdown formatting; without this rewrite pdflatex prints the literal
        # asterisks (rule 7 violation surfaced as "**word**" in the rendered PDF).
        latex_body, n_md_bold = _markdown_to_latex_bold(latex_body)
        if n_md_bold:
            logger.info(f"Markdown→LaTeX bold rewrites  |  {n_md_bold}")
        latex_body = _strip_llm_markdown_citations(latex_body)

        # Sources — from whichever provider actually ran
        sources = _extract_sources(last_candidates) or grok_sources
        if sources:
            logger.info(f"Sources  |  {len(sources)} sites")
            yield {"event": "sources", "urls": sources}

        if not latex_body:
            yield {"event": "error", "msg": "AI could not produce content. Please retry."}
            return

        # Diff + JD ratings — skipped for template/layout-only compiles (no JD tailoring UX).
        if not layout_compile and base_body:
            yield {"event": "status", "msg": "Computing changes…"}
            diff_lines, adds, removes = _compute_diff(base_body, latex_body)
            logger.info(f"Diff  |  +{adds}  -{removes}")
            yield {"event": "diff", "data": diff_lines, "adds": adds, "removes": removes}

            # Human-readable change explanations (why each edit was made vs the JD)
            yield {"event": "status", "msg": "Explaining changes…"}
            try:
                explanations = _explain_changes(client, model, base_body, latex_body, job_description[:1500])
                if explanations:
                    logger.info(f"Change rationales  |  {len(explanations)} items")
                    yield {"event": "rationales", "data": explanations}
            except Exception as exc:
                logger.warning(f"Rationale generation failed: {exc}")

        if not layout_compile:
            yield {"event": "status", "msg": "Rating resume against JD…"}
            ratings = _rate_resume(client, model, latex_body, job_description[:1500])
            if ratings:
                logger.info(f"Ratings  |  {ratings}")
                yield {"event": "ratings", "data": ratings}

        # Save + compile
        yield {"event": "status", "msg": "Saving .tex and compiling PDF…"}
        saved = _save_and_compile(
            company,
            role,
            latex_body,
            compile_pdf,
            reference_tex=reference_tex,
            candidate_profile=candidate_profile,
        )
        yield {"event": "saved", "folder": saved["folder"], "tex_path": saved["tex_path"]}

        if saved.get("pdf_path"):
            folder   = saved["folder"]
            filename = os.path.basename(saved["pdf_path"])
            yield {"event": "pdf", "url": f"/pdf/{folder}/{filename}"}

        logger.info(f"DONE  |  total {time.time()-t_start:.1f}s")
        logger.info("=" * 60)
        yield {"event": "done"}

    except Exception as exc:
        logger.error(f"Stream error  |  {exc}", exc_info=True)
        yield {"event": "error", "msg": _sse_friendly_error(exc)}


# ============================================================================
# EXTRACT JD FROM URL — fetch a job posting URL and extract structured JD
# ============================================================================

_JD_FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _normalize_job_url(url: str) -> str:
    """
    Rewrite common job-board feed URLs to their canonical single-posting form.
    Users often paste the URL from their browser address bar, which on many
    boards is a feed/list page with the selected job as a query param rather
    than the public canonical posting URL.
    """
    try:
        p = urlparse(url)
    except Exception:
        return url

    host  = (p.hostname or "").lower()
    qs    = parse_qs(p.query)

    # LinkedIn: /jobs/collections/... /jobs/search/... /jobs/... ?currentJobId=ID
    #          → https://www.linkedin.com/jobs/view/{ID}
    if host.endswith("linkedin.com"):
        job_id = (qs.get("currentJobId") or qs.get("jobId") or qs.get("selectedJobId") or [None])[0]
        if job_id and job_id.isdigit():
            canonical = f"https://www.linkedin.com/jobs/view/{job_id}"
            logger.info(f"Normalized LinkedIn URL  |  {url}  →  {canonical}")
            return canonical

    # Indeed: /viewjob?jk=XXXX is already canonical; nothing to do.
    # Greenhouse / Lever / Ashby: already canonical in their public form.
    return url


def _extract_text_from_html(html: str) -> str:
    """Parse an HTML document and return the most JD-like visible text block."""
    soup = BeautifulSoup(html, "lxml")

    # Strip junk
    for tag in soup(["script", "style", "noscript", "header", "footer", "nav", "aside", "form", "iframe", "svg"]):
        tag.decompose()

    # Try common JD containers first (Greenhouse, Lever, Ashby, generic)
    candidates = []
    selectors = [
        "main",
        "article",
        "[class*='job-description']",
        "[class*='jobDescription']",
        "[class*='posting-requirements']",
        "[class*='posting-page']",
        "[id*='job-description']",
        "[id*='content']",
        "[data-qa='job-description']",
    ]
    for sel in selectors:
        for el in soup.select(sel):
            text = el.get_text(separator="\n", strip=True)
            if len(text) > 300:
                candidates.append(text)

    best = max(candidates, key=len) if candidates else soup.get_text(separator="\n", strip=True)

    # Collapse whitespace
    best = re.sub(r"[ \t]+", " ", best)
    best = re.sub(r"\n{3,}", "\n\n", best).strip()
    return best[:12000]  # cap to keep prompt cost bounded


def _fetch_and_clean_html(url: str, timeout: int = 15) -> str:
    """Fast path: plain HTTP GET + server-rendered HTML. Great for Greenhouse/Lever/LinkedIn."""
    resp = requests.get(url, headers=_JD_FETCH_HEADERS, timeout=timeout, allow_redirects=True)
    resp.raise_for_status()
    return _extract_text_from_html(resp.text)


# Domains whose pages we know are JS-rendered SPAs — skip the HTTP fetch and go
# straight to the headless browser to save a round trip.
_SPA_HOSTS = (
    "jobs.ashbyhq.com",
    "google.com",           # www.google.com/about/careers/applications/...
    "myworkdayjobs.com",    # Workday postings
    "wd1.myworkdaysite.com",
    "wd3.myworkdaysite.com",
    "wd5.myworkdaysite.com",
)


def _is_spa_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return any(host == h or host.endswith("." + h) or host.endswith(h) for h in _SPA_HOSTS)


def _fetch_via_browser(url: str, timeout: int = 25) -> str:
    """
    Slow path: launch headless Chromium, wait for client-side rendering, then
    extract text. Used as a fallback when the HTTP fetcher can't find enough
    content (e.g. Ashby, Google Careers, Workday).
    """
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except ImportError:
        logger.warning("playwright not installed — cannot fall back to headless browser")
        return ""

    t0 = time.time()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                context = browser.new_context(
                    user_agent=_JD_FETCH_HEADERS["User-Agent"],
                    locale="en-US",
                    viewport={"width": 1280, "height": 1800},
                )
                page = context.new_page()
                page.goto(url, timeout=timeout * 1000, wait_until="domcontentloaded")
                # Give the SPA a moment to hydrate content into the DOM.
                try:
                    page.wait_for_load_state("networkidle", timeout=8000)
                except Exception:
                    pass
                # Try to wait for substantive text to appear.
                try:
                    page.wait_for_function(
                        "() => (document.body && document.body.innerText && document.body.innerText.length > 400)",
                        timeout=6000,
                    )
                except Exception:
                    pass
                html = page.content()
            finally:
                browser.close()
    except Exception as exc:
        logger.warning(f"Headless fetch failed for {url}: {exc}")
        return ""

    text = _extract_text_from_html(html)
    logger.info(f"Headless fetch  |  {url}  |  {time.time()-t0:.1f}s  |  {len(text)} chars")
    return text


def _structure_jd_with_llm(client, model: str, url: str, raw_text: str) -> Optional[Dict]:
    """Use Gemini to pull out company / role / cleaned JD from the scraped page text."""
    prompt = (
        "You are given the raw visible text of a job posting page. Extract the job posting fields.\n\n"
        "Return ONLY valid JSON (no markdown, no fences):\n"
        "{\n"
        '  "company": "<company name as shown on the posting>",\n'
        '  "role":    "<exact job title>",\n'
        '  "location": "<location if shown, else empty string>",\n'
        '  "job_description": "<the full JD text: responsibilities, qualifications, requirements. Preserve bullet structure. Strip nav, footer, legal boilerplate.>"\n'
        "}\n\n"
        "Rules:\n"
        "- If the page does not look like a job posting, return {\"error\": \"not a job posting\"}.\n"
        "- Do NOT invent fields. If company or role is missing, use empty string.\n"
        "- The job_description field must contain real posting content, not navigation or cookie banners.\n\n"
        f"SOURCE URL: {url}\n\n"
        f"PAGE TEXT:\n{raw_text}"
    )
    fallback_models = _model_chain(model)
    for i, m in enumerate(fallback_models):
        if i > 0:
            time.sleep(1)
        try:
            if _is_grok(m):
                data = _json_grok(m, prompt, temperature=0.1)
                if data and isinstance(data, dict):
                    return data
                continue
            r = client.models.generate_content(
                model=m,
                contents=prompt,
                config=types.GenerateContentConfig(temperature=0.1),
            )
            text = (r.text or "").strip()
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
            data = json.loads(text)
            if isinstance(data, dict):
                return data
        except Exception as exc:
            logger.warning(f"JD structuring failed on {m}: {exc}")
            _backoff_if_rate_limited(exc)
    return None


def extract_jd_from_url(url: str, model: Optional[str] = None) -> Dict:
    """
    Public entry point used by the /api/extract-jd route.
    Returns: {"company": str, "role": str, "location": str, "job_description": str}
    Raises on fetch errors; raises ValueError if the page isn't a job posting.
    """
    url = url.strip()
    if not re.match(r"^https?://", url):
        raise ValueError("URL must start with http:// or https://")

    url = _normalize_job_url(url)

    model = primary_llm_model_for_resume_workloads(model)

    t0 = time.time()
    raw_text = ""
    used_browser = False

    # JS-heavy boards: skip straight to Playwright (HTTP body is usually an empty shell).
    if _is_spa_url(url):
        logger.info(f"SPA host — headless browser: {url}")
        raw_text = _fetch_via_browser(url)
        used_browser = True

    if len(raw_text) < 200:
        try:
            http_text = _fetch_and_clean_html(url)
            if len(http_text) >= len(raw_text):
                raw_text = http_text
        except Exception as exc:
            logger.warning(f"HTTP fetch failed for {url}: {exc}")

    if len(raw_text) < 200 and not used_browser:
        logger.info(f"Thin HTTP content ({len(raw_text)} chars) — headless browser fallback: {url}")
        raw_text = _fetch_via_browser(url)

    if len(raw_text) < 200:
        raise ValueError("Could not extract readable content from the page. It may be JS-rendered or auth-gated.")

    client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
    data = _structure_jd_with_llm(client, model, url, raw_text)
    if not data or data.get("error"):
        raise ValueError(data.get("error") if data else "Failed to parse job posting")

    logger.info(f"Extracted JD from {url}  |  {time.time()-t0:.1f}s  |  {data.get('company')} / {data.get('role')}")
    return {
        "company":         data.get("company", "") or "",
        "role":            data.get("role", "") or "",
        "location":        data.get("location", "") or "",
        "job_description": data.get("job_description", "") or "",
    }
