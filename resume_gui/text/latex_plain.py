"""LaTeX resume.tex → plain text."""
from __future__ import annotations

import re

def _latex_to_plain(tex: str) -> str:
    """Strip common LaTeX markup to produce readable plain text for analysis."""
    # Remove comments
    tex = re.sub(r"%.*", "", tex)
    # Extract text from common resume macros
    tex = re.sub(r"\\resumeQuadHeading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}", r"\1 \2 \3 \4", tex)
    tex = re.sub(r"\\resumeTrioHeading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}", r"\1 \2 \3", tex)
    tex = re.sub(r"\\resumeItem\{([^}]*)\}", r"• \1", tex)
    tex = re.sub(r"\\resumeItem\s*\{([^}]*)\}", r"• \1", tex)
    tex = re.sub(r"\\textbf\{([^}]*)\}", r"\1", tex)
    tex = re.sub(r"\\textit\{([^}]*)\}", r"\1", tex)
    tex = re.sub(r"\\emph\{([^}]*)\}", r"\1", tex)
    tex = re.sub(r"\\href\{[^}]*\}\{([^}]*)\}", r"\1", tex)
    tex = re.sub(r"\\section\*?\{([^}]*)\}", r"\n\1\n", tex)
    # Remove remaining commands
    tex = re.sub(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})*", "", tex)
    # Clean up
    tex = re.sub(r"[{}]", "", tex)
    tex = re.sub(r"\n{3,}", "\n\n", tex)
    return tex.strip()


# ── Comprehensive AI-powered resume analysis ──────────────────────────────────
