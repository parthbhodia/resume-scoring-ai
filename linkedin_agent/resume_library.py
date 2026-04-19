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
from typing import Dict, List, Optional

import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, parse_qs
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

LIBRARY_ROOT = "C:/Users/parth/OneDrive/Documents/resume"
PDFLATEX = "C:/Users/parth/AppData/Local/Programs/MiKTeX/miktex/bin/x64/pdflatex.exe"

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
        "You are a brutally honest senior technical recruiter reviewing a software engineer's resume against a job description.\n"
        "Be specific, direct, and actionable — reference actual companies, projects, and metrics from the resume.\n\n"
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
        '      "notes": "<specific honest note referencing actual experience from resume>"\n'
        '    }\n'
        "  ],\n"
        '  "whats_working": ["<specific strength with evidence from resume>"],\n'
        '  "gaps": ["<specific gap + actionable tip for how to address it in the interview>"],\n'
        '  "verdict": "<2-3 sentence honest bottom line — should they pursue this role?>"\n'
        "}\n\n"
        "Rules:\n"
        "- 6-10 criteria covering the most important JD requirements (mix of required and nice-to-have)\n"
        "- Notes must name actual companies, projects, or metrics from the RESUME BODY — never generic, never invented\n"
        "- gaps must include a concrete suggestion (e.g. 'Be honest: you understand X, built Y, learn fast')\n"
        "- match_score must be honest — do not inflate it\n"
        "- whats_working: 3-5 bullets, gaps: 2-4 bullets\n\n"
        f"JOB DESCRIPTION:\n{jd_snippet}\n\n"
        f"RESUME BODY (LaTeX — ignore formatting commands, read only the content. This is the ONLY source of truth about the candidate):\n{latex_body[:6000]}"
    )
    fallback_models = [
        model,
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
    ]
    seen = set()
    for i, m in enumerate(fallback_models):
        if m in seen:
            continue
        seen.add(m)
        if i > 0:
            time.sleep(2)  # brief pause between retries
        try:
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
    fallback_models = [model, "gemini-2.0-flash", "gemini-2.0-flash-lite"]
    seen = set()
    for i, m in enumerate(fallback_models):
        if m in seen:
            continue
        seen.add(m)
        if i > 0:
            time.sleep(1)
        try:
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
        "7. Bold the most relevant skills and technologies for this specific job\n"
        "8. Keep to 1 page — all experience entries + 2 most relevant projects + education + skills"
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
        "7. Bold the most relevant skills and technologies for this specific job\n"
        "8. Keep to 1 page — all experience entries + 2 most relevant projects + education + skills"
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
                result["compiled"]      = False
                result["compile_error"] = proc.stdout[-500:] if proc.stdout else proc.stderr[-500:]
        except Exception as exc:
            result["compiled"]      = False
            result["compile_error"] = str(exc)
    else:
        result["compiled"]      = False
        result["compile_note"]  = "pdflatex not found or disabled."
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

        _fallback_models = [model, "gemini-2.0-flash", "gemini-2.0-flash-lite"]
        _seen = set()
        active_model = model

        latex_body      = ""
        last_candidates = []

        for _m in _fallback_models:
            if _m in _seen:
                continue
            _seen.add(_m)
            active_model = _m
            yield {"event": "status", "msg": f"Searching Google + generating with {_m}…"}
            logger.info(f"Starting stream  |  {_m}")
            t1 = time.time()
            try:
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

        logger.info(f"Stream complete  |  {time.time()-t1:.1f}s  |  {len(latex_body)} chars")

        # Strip accidental fences
        latex_body = latex_body.strip()
        if latex_body.startswith("```"):
            latex_body = re.sub(r"^```[a-z]*\n?", "", latex_body)
            latex_body = re.sub(r"\n?```$", "", latex_body)

        # Sources
        sources = _extract_sources(last_candidates)
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


def _fetch_and_clean_html(url: str, timeout: int = 15) -> str:
    """Fetch a job URL and return the visible text from the main content area."""
    resp = requests.get(url, headers=_JD_FETCH_HEADERS, timeout=timeout, allow_redirects=True)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

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
    fallback_models = [model, "gemini-2.0-flash", "gemini-2.0-flash-lite"]
    seen = set()
    for i, m in enumerate(fallback_models):
        if m in seen:
            continue
        seen.add(m)
        if i > 0:
            time.sleep(1)
        try:
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
    raw_text = _fetch_and_clean_html(url)
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
