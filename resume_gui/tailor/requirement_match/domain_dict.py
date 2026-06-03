"""Optional category-specific alias supplements (Layer 3)."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Set

from resume_gui.tailor.requirement_match.normalize import normalize_text

logger = logging.getLogger("resume_gui")

_DICT_DIR = Path(__file__).resolve().parent.parent / "domain_dictionaries"
_cache: Dict[str, List[dict]] = {}


def _load_family_entries(role_family: str) -> List[dict]:
    if role_family in _cache:
        return _cache[role_family]
    path = _DICT_DIR / f"{role_family}.json"
    entries: List[dict] = []
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            entries = list(raw.get("entries") or [])
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("domain dictionary load failed %s: %s", path, exc)
    _cache[role_family] = entries
    return entries


def domain_aliases_for_canonical(canonical: str, role_family: str) -> Set[str]:
    """Return extra aliases from domain JSON when canonical matches an entry."""
    norm_canon = normalize_text(canonical)
    if not norm_canon:
        return set()
    out: Set[str] = set()
    for entry in _load_family_entries(role_family):
        entry_canon = normalize_text(str(entry.get("canonical") or ""))
        if not entry_canon:
            continue
        if entry_canon == norm_canon or entry_canon in norm_canon or norm_canon in entry_canon:
            for alias in entry.get("aliases") or []:
                a = str(alias).strip()
                if a:
                    out.add(a)
    return out
