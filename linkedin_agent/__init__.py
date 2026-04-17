"""
LinkedIn Job Agent Package

An intelligent agentic AI system for LinkedIn job search and application.
Built with LangGraph and LangChain.
"""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

__version__ = "0.1.0"
__author__ = "Feroz Ahmmed"

__all__ = ["create_linkedin_agent", "graph"]


def __getattr__(name: str):
    """Lazy import so `python -m linkedin_agent.agent` does not preload agent before __main__."""
    if name == "create_linkedin_agent":
        from linkedin_agent.agent import create_linkedin_agent as _fn

        return _fn
    if name == "graph":
        from linkedin_agent.agent import graph as _graph

        return _graph
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")