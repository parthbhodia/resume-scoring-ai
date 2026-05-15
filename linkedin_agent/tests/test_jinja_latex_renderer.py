from pathlib import Path

from resume_gui.renderers.latex_renderer import (
    ExperienceItem,
    JinjaLatexRenderer,
    ResumeDocModel,
)


def test_classic_template_renders_single_backslash_commands() -> None:
    renderer = JinjaLatexRenderer(
        templates_dir=Path(__file__).resolve().parents[2] / "resume_gui" / "templates" / "latex",
    )
    doc = ResumeDocModel(
        full_name="Parth Bhodia",
        headline="Senior Frontend Engineer",
        location="Jersey City, NJ",
        email="parth@example.com",
        phone="+1 444 555 7777",
        summary="Built scalable systems with measurable outcomes.",
        skills=[("Core Frontend", ["React", "TypeScript"])],
        experience=[
            ExperienceItem(
                company="Eccalon LLC",
                role="Full-Stack Software Engineer",
                dates="May 2022 - Present",
                location="Remote",
                bullets=["Cut analyst review time by 50% with a React interface."],
            )
        ],
    )

    tex = renderer.render(doc)

    first_line = tex.splitlines()[0]
    assert first_line.startswith("\\documentclass")
    assert not first_line.startswith("\\\\documentclass")
    assert "\\begin{document}" in tex
    assert "Parth Bhodia" in tex
    assert "\\item Cut analyst review time by" in tex
