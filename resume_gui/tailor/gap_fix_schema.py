"""JSON schema for /api/suggest-gap-fix structured LLM output."""
from __future__ import annotations

SUGGEST_GAP_FIX_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["suggestions"],
    "properties": {
        "suggestions": {
            "type": "array",
            "minItems": 0,
            "maxItems": 3,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "id",
                    "section",
                    "employer",
                    "original",
                    "suggested",
                    "reason",
                    "category",
                    "priority",
                    "action_type",
                    "risk_level",
                ],
                "properties": {
                    "id": {"type": "string"},
                    "section": {"type": "string"},
                    # Company / project / institution name from the eligible bullet's context field.
                    "employer": {"type": "string"},
                    "original": {"type": "string"},
                    "suggested": {"type": "string"},
                    "reason": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": [
                            "add_keywords",
                            "relevance",
                            "quantification",
                            "readability",
                            "action_verbs",
                            "languageQuality",
                            "remove_filler",
                        ],
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                    },
                    # "rewrite" = modifies an existing bullet; "append" = adds a new bullet
                    "action_type": {
                        "type": "string",
                        "enum": ["rewrite", "append"],
                    },
                    # low = rephrasing / keyword addition; medium = adds a claim; high = new factual assertion
                    "risk_level": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                    },
                },
            },
        },
    },
}
