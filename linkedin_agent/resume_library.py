"""
Resume Library Integration

Reads and writes to Parth's resume library at:
  C:/Users/parth/OneDrive/Documents/resume/

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
from typing import Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, parse_qs
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# Extra models to try when the primary hits quota errors (free tier is per-model).
# gemini-1.5-* are retired on the v1beta endpoint; including them just adds 404 noise.
_GEMINI_FALLBACK_MODELS = (
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


def _backoff_if_rate_limited(exc: BaseException, default_wait: float = 5.0) -> None:
    """
    If Gemini returned 429, wait briefly before trying the *next* model in the
    chain. We deliberately don't honor the full retry-in window: the suggested
    delay is for retrying the SAME model, but we're moving on to a different
    one which has its own quota bucket. Capped to keep total fail-fast latency
    under ~15s across the whole chain.
    """
    msg = str(exc)
    if "429" not in msg and "RESOURCE_EXHAUSTED" not in msg:
        return
    wait = min(max(default_wait, 1.0), 8.0)
    logger.info(f"Gemini rate limited — pausing {wait:.1f}s before next fallback model")
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


def _stream_grok(model: str, system_prompt: str, user_prompt: str, temperature: float = 0.2):
    """
    Stream a Grok generation via the xAI Responses API with the web_search tool.

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
    stream = client.responses.create(
        model=model,
        instructions=system_prompt,
        input=user_prompt,
        temperature=temperature,
        tools=[{"type": "web_search"}],
        stream=True,
    )

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


LIBRARY_ROOT = os.environ.get("LIBRARY_ROOT", "C:/Users/parth/OneDrive/Documents/resume")

# Prefer the system pdflatex (cross-platform); fall back to the Windows MiKTeX path for
# backwards-compat when running on the original Windows dev machine.
import shutil as _shutil
PDFLATEX = (
    _shutil.which("pdflatex")
    or "C:/Users/parth/AppData/Local/Programs/MiKTeX/miktex/bin/x64/pdflatex.exe"
)

# LaTeX preamble — identical across all of Parth's resumes
_LATEX_PREAMBLE = r"""%-------------------------
% Resume - {role} - {company}
% Parth Bhodia
% Based on: Rezume template by Nanu Panchamurthy
%-------------------------

\documentclass[a4paper,11pt]{article}

\usepackage{verbatim}
\usepackage{titlesec}
\usepackage{color}
\usepackage{enumitem}
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

\begin{document}
"""

_LATEX_FOOTER = r"""
\end{document}
"""


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

# Sections we never let the editor touch (per user request: Education stays
# verbatim — don't risk LLM-related mutations).
_LOCKED_SECTIONS  = {"education"}


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

    return {"rawTex": full_tex, "sections": sections}


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
            if uses_macros:
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


def recompile_resume_from_tex(folder: str, full_tex: str) -> Dict:
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

    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(full_tex)
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
    for model in _model_chain("gemini-2.5-flash"):
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
        "You are helping the candidate honestly self-assess their fit for a job. Write the assessment in the candidate's "
        "FIRST-PERSON voice (use 'I', 'my', 'I have', 'I built'). Never refer to 'this candidate' or 'the candidate' — "
        "speak AS the candidate, not ABOUT them. Be specific, direct, and reference actual companies, projects, and metrics from the resume.\n\n"
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
        '      "weight": "<High|Medium|Low based on how critical it is in the JD>",\n'
        '      "score": <1-10>,\n'
        '      "notes": "<honest note in FIRST PERSON, e.g. \'I built X at Y\' — quoting actual experience from the resume>"\n'
        '    }\n'
        "  ],\n"
        '  "whats_working": ["<first-person strength: \'I have...\', \'I built...\', \'My experience with...\'>"],\n'
        '  "gaps": ["<first-person gap + how I can address it: \'I lack X, but I can discuss Y to bridge this\'>"],\n'
        '  "verdict": "<2-3 sentence honest bottom line in first person: \'I have a strong foundation in X. While I lack Y, my experience with Z should make this a worthwhile pursuit.\'>"\n'
        "}\n\n"
        "Rules:\n"
        "- 6-10 criteria covering the most important JD requirements (mix of required and nice-to-have)\n"
        "- Notes must name actual companies, projects, or metrics from the RESUME BODY — never generic, never invented\n"
        "- gaps must include a concrete first-person plan (e.g. 'I haven't used LangGraph, but my dual-LLM pipeline at VibeIMG shows I can quickly pick up agentic frameworks')\n"
        "- match_score must be honest — do not inflate it\n"
        "- whats_working: 3-5 bullets, gaps: 2-4 bullets\n"
        "- EVERY string in whats_working, gaps, and verdict must use first-person 'I'/'my' — no third-person 'this candidate' or 'the candidate' anywhere\n\n"
        f"JOB DESCRIPTION:\n{jd_snippet}\n\n"
        f"RESUME BODY (LaTeX — ignore formatting commands, read only the content. This is the ONLY source of truth about my experience):\n{latex_body[:6000]}"
    )
    fallback_models = _model_chain(model)
    for i, m in enumerate(fallback_models):
        if i > 0:
            time.sleep(2)  # brief pause between retries
        try:
            if _is_grok(m):
                result = _json_grok(m, prompt, temperature=0.2)
                if not result:
                    continue
            else:
                r = client.models.generate_content(
                    model=m,
                    contents=prompt,
                    config=types.GenerateContentConfig(temperature=0.2),
                )
                text = (r.text or "").strip()
                text = re.sub(r"^```[a-z]*\n?", "", text)
                text = re.sub(r"\n?```$", "", text)
                result = json.loads(text)
            if m != model:
                logger.info(f"Ratings used fallback model: {m}")
            return result
        except Exception as exc:
            logger.warning(f"Rating call failed on {m}: {exc}")
            _backoff_if_rate_limited(exc)
    return None


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
    fallback_models = _model_chain(model, _GEMINI_FALLBACK_MODELS)
    for i, m in enumerate(fallback_models):
        if i > 0:
            time.sleep(1)
        try:
            if _is_grok(m):
                data = _json_grok(m, prompt, temperature=0.2)
                if not data:
                    continue
            else:
                r = client.models.generate_content(
                    model=m,
                    contents=prompt,
                    config=types.GenerateContentConfig(temperature=0.2),
                )
                text = (r.text or "").strip()
                text = re.sub(r"^```[a-z]*\n?", "", text)
                text = re.sub(r"\n?```$", "", text)
                data = json.loads(text)
            changes = data.get("changes") if isinstance(data, dict) else None
            if isinstance(changes, list):
                if m != model:
                    logger.info(f"Change explanations used fallback model: {m}")
                return changes
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


def generate_latex_resume(
    company: str,
    role: str,
    job_description: str,
    reference_folder: Optional[str] = None,
    compile_pdf: bool = True,
    model: str = "gemini-2.5-flash",
    base_folder: Optional[str] = None,
) -> Dict:
    """
    Generate a tailored LaTeX resume for a specific job and save it to the library.

    Args:
        company:          Target company name
        role:             Target role title
        job_description:  Full JD text
        reference_folder: Style reference folder (overridden by base_folder if set)
        compile_pdf:      Whether to run pdflatex
        model:            Gemini model ID
        base_folder:      Existing resume folder to diff against and use as content base
    """
    t_start = time.time()
    logger.info("=" * 60)
    logger.info(f"START  |  {role} @ {company}")
    logger.info(f"Model  |  {model}")

    # Style reference: prefer base_folder, then explicit reference_folder, then auto-match by company, then fallback
    ref_folder = base_folder or reference_folder or _find_company_reference(company) or "Adobe_FullStack"
    logger.info(f"Style reference  |  {ref_folder}")
    reference_tex = get_resume_tex(ref_folder) or ""

    # Load base body for diff (only if explicitly selected by user)
    base_body = ""
    if base_folder:
        base_tex = get_resume_tex(base_folder) or ""
        base_body = _extract_body(base_tex)
        logger.info(f"Base resume loaded  |  {base_folder}  ({len(base_body)} chars)")

    client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])

    system_prompt = (
        "You are an expert LaTeX resume writer specializing in ATS-optimized resumes "
        "for software engineers. You will generate a complete LaTeX resume body tailored for a specific job.\n\n"
        "STRICT NO-HALLUCINATION RULES — any violation makes the resume fraudulent and unusable:\n"
        "1. EMPLOYER NAMES: The ONLY employers, companies, and institutions that may appear are those explicitly named in the CANDIDATE PROFILE. "
        "Do NOT add, infer, rename, or substitute any other employer or company name under any circumstances.\n"
        "2. METRICS & NUMBERS: The ONLY numbers, percentages, user counts, revenue figures, or statistics that may appear are those explicitly stated in the CANDIDATE PROFILE. "
        "Do NOT round up, extrapolate, or invent new figures.\n"
        "3. FACTS ONLY: You may rephrase and reorder existing bullet points to match job keywords, but every single claim must trace back to an explicit fact in the CANDIDATE PROFILE. "
        "Do not add achievements, tools, or responsibilities that are not in the profile.\n"
        "4. VERIFICATION: Before writing each bullet point, ask yourself: 'Is this employer name / metric / claim verbatim in the CANDIDATE PROFILE?' If no, omit it.\n"
        "5. Use the exact same LaTeX commands as the reference: \\resumeQuadHeading, \\resumeTrioHeading,\n"
        "   \\resumeItemListStart, \\resumeItem, \\resumeHeadingListStart, etc.\n"
        "6. Output ONLY the LaTeX body — no preamble, no \\documentclass, no \\begin{document} or \\end{document}\n"
        "7. To bold the most relevant skills and technologies for this job, use the LaTeX command \\textbf{...} ONLY. "
        "Never use Markdown bold syntax like **word** — pdflatex prints those asterisks literally instead of rendering bold text.\n"
        "8. EDUCATION SECTION LOCK: Reproduce the EDUCATION section EXACTLY as it appears in the CANDIDATE PROFILE. "
        "Do NOT rephrase, reorder, abbreviate, change degree names, university names, dates, or locations. "
        "Same institutions, same degree names, same dates, same order — verbatim copy.\n"
        "9. PROFESSIONAL SUMMARY: Begin the body with a \\section{Summary} containing a tailored 2-3 sentence "
        "professional summary that pitches the candidate for THIS specific role. Write it in resume voice "
        "(no 'I' pronouns — start with 'Full-stack engineer with…' or '6+ years building…' style). "
        "Highlight the strongest credentials from the CANDIDATE PROFILE that map to the JD's top requirements. "
        "Place this BEFORE the EXPERIENCE section.\n"
        "10. Keep to 1 page — summary + all experience entries + 2 most relevant projects + education + skills"
    )

    base_section = ""
    if base_body:
        base_section = (
            f"\n---\nCURRENT RESUME BODY (use as your starting point, tailor it for {role} at {company}):\n"
            f"{base_body[:2500]}\n"
        )

    user_prompt = (
        f"Generate a tailored LaTeX resume body for this application:\n\n"
        f"TARGET ROLE: {role}\nTARGET COMPANY: {company}\n\n"
        f"JOB DESCRIPTION:\n{job_description[:3000]}\n\n"
        f"---\nCANDIDATE PROFILE (USE ONLY THESE FACTS):\n\n"
        f"Name: Parth Bhodia\n"
        f"Location: Jersey City, NJ (NYC metro)\n"
        f"Email: parthbhodia08@gmail.com | Phone: +1 (443) 929-4371\n"
        f"Website: parthbhodia.com | LinkedIn: linkedin.com/in/parthbhodia\n\n"
        f"EXPERIENCE:\n"
        f"1. Full-Stack Software Engineer, Eccalon LLC (May 2022 – Present, Remote)\n"
        f"   - React + Node.js end-to-end features for federal/enterprise platforms, 100,000+ users\n"
        f"   - PostgreSQL schema for high-traffic multi-tenant CMS\n"
        f"   - gRPC streaming pipelines for real-time audio/text, mission-critical\n"
        f"   - AWS Bedrock LLM contract analytics tool — 50% efficiency gain\n"
        f"   - AWS Cognito + Lambda + API Gateway — secure auth\n"
        f"   - WCAG 2.1 compliance (ARIA) for CMMC vendor certification platform\n"
        f"   - BERT + XGBoost + TensorFlow — Code Compliant tool, SBOM reports, foreign code detection for US govt\n"
        f"   - Page hydration + API batching (Chrome 6-connection limit) — frontend perf\n"
        f"   - Tech: React, Redux, Node.js, Python, PostgreSQL, REST APIs, gRPC, AWS, TypeScript, Docker, Git\n\n"
        f"2. Research Software Engineer, UMBC (Jan 2022 – Dec 2022, Halethorpe MD)\n"
        f"   - Java Spring Boot + RabbitMQ + gRPC distributed backend, real-time geospatial sync\n"
        f"   - GIS anomaly detection — Elasticsearch + Kibana\n"
        f"   - Kubernetes deployment — minikube/lab\n"
        f"   - Tech: Java, Spring Boot, RabbitMQ, gRPC, Elasticsearch, Kibana, Kubernetes\n\n"
        f"3. Software Engineer, Tata Communications Ltd. (July 2018 – May 2021, Mumbai)\n"
        f"   - Analytics dashboard (React + Django/Python) — 10,000+ users, 36% APAC revenue increase\n"
        f"   - Python route optimization tool with REST API\n"
        f"   - Jenkins CI/CD, mentored junior engineers\n"
        f"   - Tech: React, JavaScript, Django, Python, MySQL, REST APIs, Jenkins, Git\n\n"
        f"PROJECTS:\n"
        f"- VibeIMG (2024): AI image gen SaaS — React+Redux, FastAPI, Stripe, Replicate Flux; "
        f"dual LLM pipeline (xAI primary, Groq fallback); 60% latency improvement (25s->10s); profitable\n"
        f"- Real-Time Tweet Sentiment Pipeline (Jan-Mar 2026): GCP: Twitter/X API -> Pub/Sub -> Dataflow -> "
        f"Spanner (Change Streams) -> Cloud Functions -> NL API; ~2-5s latency\n"
        f"- Nutri AI Scan (Oct 2022 - Feb 2023): Vue.js + OpenCV + MongoDB; 2nd place CBIC UMBC (25+ teams)\n\n"
        f"EDUCATION:\n"
        f"- MS Computer Science, UMBC (Aug 2021 - May 2023), Baltimore, MD\n"
        f"- BE Information Technology, University of Mumbai (Aug 2014 - May 2018), Mumbai, IN\n\n"
        f"SKILLS:\n"
        f"Frontend: React, Redux, Vue.js, JavaScript/TypeScript (ES6+), HTML5, CSS3, WCAG 2.1/ARIA\n"
        f"Backend & APIs: Node.js, REST APIs, GraphQL, Django, Spring Boot, gRPC, FastAPI\n"
        f"AI/GenAI: AWS Bedrock, TensorFlow, BERT, XGBoost, OpenCV, xAI, Groq, Replicate Flux\n"
        f"Data & Infra: PostgreSQL, MySQL, MongoDB, Elasticsearch, RabbitMQ, Docker\n"
        f"Cloud: AWS (Bedrock, Lambda, Cognito, API Gateway), GCP (Pub/Sub, Dataflow, Spanner, Cloud Functions, NL API)\n"
        f"DevOps & Testing: Jenkins, Git, CI/CD, Unit Testing, Integration Testing\n"
        f"Languages: Python, JavaScript/TypeScript, Java, SQL\n"
        f"{base_section}"
        f"---\nREFERENCE LaTeX STYLE (follow this exact command style):\n{reference_tex[:2500]}\n\n"
        f"---\nGenerate ONLY the LaTeX body content (no preamble, no \\begin{{document}}, no \\end{{document}})."
        f" Tailor bullet points to emphasize what matters most for {role} at {company}."
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
    preamble = _LATEX_PREAMBLE.replace("{role}", role).replace("{company}", company)
    full_tex = preamble + "\n" + latex_body + _LATEX_FOOTER

    folder_name = _make_folder_name(company, role)
    folder_path = os.path.join(LIBRARY_ROOT, folder_name)
    os.makedirs(folder_path, exist_ok=True)

    safe_company = re.sub(r"[^\w]", "", company)
    safe_role = re.sub(r"[^\w]", "", role.replace(" ", "_"))
    filename = f"Parth_Bhodia_{safe_company}_{safe_role}_Resume"
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

def _build_prompts(company, role, job_description, base_body, reference_tex, candidate_profile=None):
    """Shared prompt builder used by both stream and non-stream paths."""
    system_prompt = (
        "You are an expert LaTeX resume writer specializing in ATS-optimized resumes "
        "for software engineers. You will generate a complete LaTeX resume body tailored for a specific job.\n\n"
        "STRICT NO-HALLUCINATION RULES — any violation makes the resume fraudulent and unusable:\n"
        "1. EMPLOYER NAMES: The ONLY employers, companies, and institutions that may appear are those explicitly named in the CANDIDATE PROFILE. "
        "Do NOT add, infer, rename, or substitute any other employer or company name under any circumstances.\n"
        "2. METRICS & NUMBERS: The ONLY numbers, percentages, user counts, revenue figures, or statistics that may appear are those explicitly stated in the CANDIDATE PROFILE. "
        "Do NOT round up, extrapolate, or invent new figures.\n"
        "3. FACTS ONLY: You may rephrase and reorder existing bullet points to match job keywords, but every single claim must trace back to an explicit fact in the CANDIDATE PROFILE. "
        "Do not add achievements, tools, or responsibilities that are not in the profile.\n"
        "4. VERIFICATION: Before writing each bullet point, ask yourself: 'Is this employer name / metric / claim verbatim in the CANDIDATE PROFILE?' If no, omit it.\n"
        "5. Use the exact same LaTeX commands as the reference: \\resumeQuadHeading, \\resumeTrioHeading,\n"
        "   \\resumeItemListStart, \\resumeItem, \\resumeHeadingListStart, etc.\n"
        "6. Output ONLY the LaTeX body — no preamble, no \\documentclass, no \\begin{document} or \\end{document}\n"
        "7. To bold the most relevant skills and technologies for this job, use the LaTeX command \\textbf{...} ONLY. "
        "Never use Markdown bold syntax like **word** — pdflatex prints those asterisks literally instead of rendering bold text.\n"
        "8. EDUCATION SECTION LOCK: Reproduce the EDUCATION section EXACTLY as it appears in the CANDIDATE PROFILE. "
        "Do NOT rephrase, reorder, abbreviate, change degree names, university names, dates, or locations. "
        "Same institutions, same degree names, same dates, same order — verbatim copy.\n"
        "9. PROFESSIONAL SUMMARY: Begin the body with a \\section{Summary} containing a tailored 2-3 sentence "
        "professional summary that pitches the candidate for THIS specific role. Write it in resume voice "
        "(no 'I' pronouns — start with 'Full-stack engineer with…' or '6+ years building…' style). "
        "Highlight the strongest credentials from the CANDIDATE PROFILE that map to the JD's top requirements. "
        "Place this BEFORE the EXPERIENCE section.\n"
        "10. Keep to 1 page — summary + all experience entries + 2 most relevant projects + education + skills"
    )
    base_section = ""
    if base_body:
        base_section = (
            f"\n---\nCURRENT RESUME BODY (use as starting point, tailor for {role} at {company}):\n"
            f"{base_body[:2500]}\n"
        )

    if candidate_profile:
        profile_section = candidate_profile[:4000]
    else:
        profile_section = (
            "Name: Parth Bhodia\n"
            "Location: Jersey City, NJ (NYC metro)\n"
            "Email: parthbhodia08@gmail.com | Phone: +1 (443) 929-4371\n"
            "Website: parthbhodia.com | LinkedIn: linkedin.com/in/parthbhodia\n\n"
            "EXPERIENCE:\n"
            "1. Full-Stack Software Engineer, Eccalon LLC (May 2022 – Present, Remote)\n"
            "   - React + Node.js end-to-end features for federal/enterprise platforms, 100,000+ users\n"
            "   - PostgreSQL schema for high-traffic multi-tenant CMS\n"
            "   - gRPC streaming pipelines for real-time audio/text, mission-critical\n"
            "   - AWS Bedrock LLM contract analytics tool — 50% efficiency gain\n"
            "   - AWS Cognito + Lambda + API Gateway — secure auth\n"
            "   - WCAG 2.1 compliance (ARIA) for CMMC vendor certification platform\n"
            "   - BERT + XGBoost + TensorFlow — Code Compliant tool, SBOM reports, foreign code detection for US govt\n"
            "   - Page hydration + API batching (Chrome 6-connection limit) — frontend perf\n"
            "   - Tech: React, Redux, Node.js, Python, PostgreSQL, REST APIs, gRPC, AWS, TypeScript, Docker, Git\n\n"
            "2. Research Software Engineer, UMBC (Jan 2022 – Dec 2022, Halethorpe MD)\n"
            "   - Java Spring Boot + RabbitMQ + gRPC distributed backend, real-time geospatial sync\n"
            "   - GIS anomaly detection — Elasticsearch + Kibana\n"
            "   - Kubernetes deployment — minikube/lab\n"
            "   - Tech: Java, Spring Boot, RabbitMQ, gRPC, Elasticsearch, Kibana, Kubernetes\n\n"
            "3. Software Engineer, Tata Communications Ltd. (July 2018 – May 2021, Mumbai)\n"
            "   - Analytics dashboard (React + Django/Python) — 10,000+ users, 36% APAC revenue increase\n"
            "   - Python route optimization tool with REST API\n"
            "   - Jenkins CI/CD, mentored junior engineers\n"
            "   - Tech: React, JavaScript, Django, Python, MySQL, REST APIs, Jenkins, Git\n\n"
            "PROJECTS:\n"
            "- VibeIMG (2024): AI image gen SaaS — React+Redux, FastAPI, Stripe, Replicate Flux; "
            "dual LLM pipeline (xAI primary, Groq fallback); 60% latency improvement (25s->10s); profitable\n"
            "- Real-Time Tweet Sentiment Pipeline (Jan-Mar 2026): GCP: Twitter/X API -> Pub/Sub -> Dataflow -> "
            "Spanner (Change Streams) -> Cloud Functions -> NL API; ~2-5s latency\n"
            "- Nutri AI Scan (Oct 2022 - Feb 2023): Vue.js + OpenCV + MongoDB; 2nd place CBIC UMBC (25+ teams)\n\n"
            "EDUCATION:\n"
            "- MS Computer Science, UMBC (Aug 2021 - May 2023), Baltimore, MD\n"
            "- BE Information Technology, University of Mumbai (Aug 2014 - May 2018), Mumbai, IN\n\n"
            "SKILLS:\n"
            "Frontend: React, Redux, Vue.js, JavaScript/TypeScript (ES6+), HTML5, CSS3, WCAG 2.1/ARIA\n"
            "Backend & APIs: Node.js, REST APIs, GraphQL, Django, Spring Boot, gRPC, FastAPI\n"
            "AI/GenAI: AWS Bedrock, TensorFlow, BERT, XGBoost, OpenCV, xAI, Groq, Replicate Flux\n"
            "Data & Infra: PostgreSQL, MySQL, MongoDB, Elasticsearch, RabbitMQ, Docker\n"
            "Cloud: AWS (Bedrock, Lambda, Cognito, API Gateway), GCP (Pub/Sub, Dataflow, Spanner, Cloud Functions, NL API)\n"
            "DevOps & Testing: Jenkins, Git, CI/CD, Unit Testing, Integration Testing\n"
            "Languages: Python, JavaScript/TypeScript, Java, SQL\n"
        )

    user_prompt = (
        f"Generate a tailored LaTeX resume body for this application:\n\n"
        f"TARGET ROLE: {role}\nTARGET COMPANY: {company}\n\n"
        f"JOB DESCRIPTION:\n{job_description[:3000]}\n\n"
        f"---\nCANDIDATE PROFILE (USE ONLY THESE FACTS):\n\n"
        f"{profile_section}"
        f"{base_section}"
        f"---\nREFERENCE LaTeX STYLE (follow this exact command style):\n{reference_tex[:2500]}\n\n"
        f"---\nGenerate ONLY the LaTeX body content (no preamble, no \\begin{{document}}, no \\end{{document}})."
        f" Tailor bullet points to emphasize what matters most for {role} at {company}."
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
            if isinstance(q, str) and q.strip():
                queries.append(q.strip())
        for chunk in (getattr(gm, "grounding_chunks", None) or []):
            web = getattr(chunk, "web", None)
            if web and getattr(web, "uri", None):
                sources.append({"title": getattr(web, "title", web.uri), "url": web.uri})
    return queries, sources


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


def _save_and_compile(company, role, latex_body, compile_pdf=True):
    """Assemble full .tex, save to library, optionally compile PDF. Returns result dict."""
    preamble = _LATEX_PREAMBLE.replace("{role}", role).replace("{company}", company)
    full_tex  = preamble + "\n" + latex_body + _LATEX_FOOTER

    folder_name = _make_folder_name(company, role)
    folder_path = os.path.join(LIBRARY_ROOT, folder_name)
    os.makedirs(folder_path, exist_ok=True)

    safe_company = re.sub(r"[^\w]", "", company)
    safe_role    = re.sub(r"[^\w]", "", role.replace(" ", "_"))
    filename     = f"Parth_Bhodia_{safe_company}_{safe_role}_Resume"
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
    model: str = "gemini-2.5-flash",
    base_folder: Optional[str] = None,
    candidate_profile: Optional[str] = None,
):
    """
    Generator that yields SSE-style event dicts while generating the resume.

    Events:
      {"event": "status",  "msg": "..."}
      {"event": "chunk",   "text": "..."}      # streamed LaTeX
      {"event": "sources", "urls": [...]}       # sites Gemini searched
      {"event": "diff",    "data": [...], "adds": N, "removes": N}
      {"event": "ratings", "data": {...}}
      {"event": "saved",   "folder": "...", "tex_path": "..."}
      {"event": "pdf",     "url": "..."}
      {"event": "done"}
      {"event": "error",   "msg": "..."}
    """
    try:
        t_start = time.time()
        logger.info("=" * 60)
        logger.info(f"STREAM  |  {role} @ {company}  |  model={model}")

        ref_folder = base_folder or reference_folder or _find_company_reference(company) or "Adobe_FullStack"
        yield {"event": "status", "msg": f"Loading style reference ({ref_folder})…"}
        reference_tex = get_resume_tex(ref_folder) or ""

        base_body = ""
        if base_folder:
            base_tex  = get_resume_tex(base_folder) or ""
            base_body = _extract_body(base_tex)
            logger.info(f"Base resume  |  {base_folder}  ({len(base_body)} chars)")

        client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
        system_prompt, user_prompt = _build_prompts(company, role, job_description, base_body, reference_tex, candidate_profile=candidate_profile)

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
            yield {"event": "status", "msg": f"Generating with {_m} ({provider})…"}
            logger.info(f"Starting stream  |  {_m}  |  provider={provider}")
            t1 = time.time()
            try:
                if _is_grok(_m):
                    # xAI Responses API path with web_search tool. _stream_grok
                    # yields typed event dicts: text deltas, search queries, and
                    # citation sources — fire each onto the same SSE stream the
                    # frontend already handles for Gemini grounding.
                    for ev in _stream_grok(_m, system_prompt, user_prompt, 0.2):
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
                    # Gemini path — Google Search grounding
                    stream = client.models.generate_content_stream(
                        model=_m,
                        contents=user_prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_prompt,
                            temperature=0.2,
                            tools=[types.Tool(google_search=types.GoogleSearch())],
                        ),
                    )
                    for chunk in stream:
                        if getattr(chunk, "candidates", None):
                            last_candidates = chunk.candidates
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

                if latex_body:
                    break  # got real content — exit fallback loop
                else:
                    logger.warning(f"Model {_m} returned empty body — trying next fallback")
                    yield {"event": "status", "msg": f"{_m} returned empty response, trying next model…"}
                    last_candidates = []
            except Exception as _e:
                logger.warning(f"Model {_m} failed: {_e} — trying next fallback")
                yield {"event": "status", "msg": f"{_m} unavailable, trying next model…"}
                latex_body = ""
                last_candidates = []
                grok_sources = []
                _backoff_if_rate_limited(_e)
            if idx + 1 < len(_fallback_models) and not latex_body:
                time.sleep(1)

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

        # Sources — from whichever provider actually ran
        sources = _extract_sources(last_candidates) or grok_sources
        if sources:
            logger.info(f"Sources  |  {len(sources)} sites")
            yield {"event": "sources", "urls": sources}

        if not latex_body:
            yield {"event": "error", "msg": "All models returned empty content. Try a different model or retry."}
            return

        # Diff
        if base_body:
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

        # Ratings
        yield {"event": "status", "msg": "Rating resume against JD…"}
        ratings = _rate_resume(client, model, latex_body, job_description[:1500])
        if ratings:
            logger.info(f"Ratings  |  {ratings}")
            yield {"event": "ratings", "data": ratings}

        # Save + compile
        yield {"event": "status", "msg": "Saving .tex and compiling PDF…"}
        saved = _save_and_compile(company, role, latex_body, compile_pdf)
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
        yield {"event": "error", "msg": str(exc)}


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


def extract_jd_from_url(url: str, model: str = "gemini-2.5-flash") -> Dict:
    """
    Public entry point used by the /api/extract-jd route.
    Returns: {"company": str, "role": str, "location": str, "job_description": str}
    Raises on fetch errors; raises ValueError if the page isn't a job posting.
    """
    url = url.strip()
    if not re.match(r"^https?://", url):
        raise ValueError("URL must start with http:// or https://")

    url = _normalize_job_url(url)

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
