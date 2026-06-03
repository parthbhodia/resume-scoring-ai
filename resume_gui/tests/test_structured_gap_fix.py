from resume_gui.tailor.structured_gap_fix import (
    eligible_gap_fix_targets,
    eligible_originals_set,
)


def test_structured_excludes_project_header_includes_bullets():
    structured = {
        "projects": [
            {
                "name": "Nutri AI Scan",
                "tech": "Vue Js, REST API, Mongo DB",
                "bullets": [
                    "Won 2nd place at the CBIC hackathon building a nutrition PWA.",
                ],
            }
        ],
        "experience": [
            {
                "company": "Eccalon LLC",
                "role": "Fullstack Developer",
                "bullets": [
                    "Built scalable frontend UIs in Vue.js for federal platforms (Project Spectrum).",
                ],
            }
        ],
    }
    targets = eligible_gap_fix_targets(structured)
    originals = eligible_originals_set(targets)
    assert "Nutri AI Scan | Vue Js, REST API, Mongo DB" not in originals
    assert any("Vue.js" in o for o in originals)
    assert any("CBIC" in o for o in originals)
