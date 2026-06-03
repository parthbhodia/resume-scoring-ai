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
                    "original",
                    "suggested",
                    "reason",
                    "category",
                    "priority",
                ],
                "properties": {
                    "id": {"type": "string"},
                    "section": {"type": "string"},
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
                },
            },
        },
    },
}
