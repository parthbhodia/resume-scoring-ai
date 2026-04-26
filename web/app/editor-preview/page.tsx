"use client";

/**
 * Standalone preview harness for ResumeEditor.
 *
 * This page exists so we can iterate on the editor UI in Claude Preview without
 * needing the Python backend running. It loads a hardcoded sample resume tree
 * (mirrors what GET /api/resume/{folder} will eventually return) and stubs
 * onSave / onAIEdit with delayed promises.
 *
 * Safe to leave in production — it's a hidden /editor-preview route, no nav
 * links to it, useful as a design-system page.
 */

import { useState } from "react";
import ResumeEditor from "@/components/ResumeEditor";
import type { ParsedResume } from "@/lib/types";

const SAMPLE: ParsedResume = {
  rawTex: "% (mock — backend will provide real .tex)",
  sections: [
    {
      name: "Summary",
      editable: true,
      entries: [{
        header: "",
        bullets: [{
          id: "sum-1", texLine: 12,
          text: "I'm a senior software engineer with 8+ years building **AI-powered backend systems** at scale — most recently architecting LLM agents and vector retrieval pipelines that serve 10M+ daily queries at Bloomberg.",
        }],
      }],
    },
    {
      name: "Experience",
      editable: true,
      entries: [
        {
          header: "Bloomberg · Senior Software Engineer / Architect — AI Assistant · 2022–Present",
          bullets: [
            { id: "exp-1", texLine: 24, text: "Architected and shipped a **multi-agent RAG system** powering Bloomberg Terminal's AI Assistant, serving 350K+ professionals with sub-200ms p95 latency." },
            { id: "exp-2", texLine: 25, text: "Designed vector & semantic indexes over 50TB of financial documents using FAISS + custom hybrid retrieval; improved relevance@10 by 34% over baseline BM25." },
            { id: "exp-3", texLine: 26, text: "Led a team of 6 engineers across 3 continents to deliver the Q4 LLM upgrade two weeks ahead of schedule." },
          ],
        },
        {
          header: "Datadog · Senior Backend Engineer · 2019–2022",
          bullets: [
            { id: "exp-4", texLine: 38, text: "Built the alerting evaluation engine processing **2B+ metric points/sec** using Rust + Kafka." },
            { id: "exp-5", texLine: 39, text: "Reduced infra cost by $1.2M/yr by migrating hot-path services from EC2 to Fargate Spot." },
          ],
        },
      ],
    },
    {
      name: "Projects",
      editable: true,
      entries: [{
        header: "Open-source · langgraph-resume-agent · 2025",
        bullets: [
          { id: "proj-1", texLine: 52, text: "LangGraph-based agent that ingests JD + resume, runs multi-provider research (Gemini grounding, Grok web_search), and produces tailored LaTeX resumes — 800+ stars." },
        ],
      }],
    },
    {
      name: "Education",
      editable: false,  // locked per user request
      entries: [{
        header: "Carnegie Mellon University · M.S. Computer Science · 2017",
        bullets: [
          { id: "edu-1", texLine: 64, text: "Coursework: Distributed Systems, Advanced ML, Compilers." },
        ],
      }],
    },
    {
      name: "Skills",
      editable: true,
      entries: [{
        header: "",
        bullets: [
          { id: "skill-1", texLine: 72, text: "**Languages:** Python, TypeScript, Rust, Go, SQL" },
          { id: "skill-2", texLine: 73, text: "**AI/ML:** LangChain, LangGraph, FAISS, vLLM, transformers, Anthropic/OpenAI/Gemini APIs" },
          { id: "skill-3", texLine: 74, text: "**Infra:** Kubernetes, Terraform, Kafka, Redis, Postgres, Snowflake" },
        ],
      }],
    },
  ],
};

export default function EditorPreviewPage() {
  const [resume, setResume] = useState<ParsedResume>(SAMPLE);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const onSave = async (next: ParsedResume) => {
    setSaving(true);
    // Mock backend latency
    await new Promise(r => setTimeout(r, 1100));
    setResume(next);
    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString());
  };

  // Stub AI edit — produces a noticeably different rewrite so the inline
  // diff highlights (adds/removes) are visually meaningful in preview.
  const onAIEdit = async (b: { text: string }, instr: string) => {
    await new Promise(r => setTimeout(r, 800));
    const original = b.text;
    if (instr.toLowerCase().includes("shorten")) {
      // Drop everything after the first comma or em-dash.
      const cut = original.split(/[,—]/)[0];
      return cut.endsWith(".") ? cut : cut + ".";
    }
    if (instr.toLowerCase().includes("quantif") || instr.toLowerCase().includes("number")) {
      return original.replace(/(\d+)([KMB+]?)/g, (_m, n, suf) => `${Math.round(Number(n) * 2.4)}${suf}`)
        .replace(/^([A-Z][a-z]+)/, "Drove $1");
    }
    if (instr.toLowerCase().includes("verb") || instr.toLowerCase().includes("stronger")) {
      return original.replace(/^([A-Z][a-z]+)/, "Spearheaded");
    }
    // Default: light reword + rotate vary the wording so the diff is non-trivial.
    return original
      .replace(/^I /, "I personally ")
      .replace(/built/i, "architected and shipped")
      .replace(/improved/i, "lifted")
      + " — rewrite #" + Math.floor(Math.random() * 9000);
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, letterSpacing: -0.6 }}>
          Resume Editor — Preview Harness
        </h1>
        <p style={{ fontSize: 12, color: "var(--dim)", letterSpacing: -0.1 }}>
          Mock data, mock backend. Edit any bullet → live preview updates immediately. &quot;Save &amp; re-compile&quot; simulates a 1.1s round-trip.
          {savedAt && <span style={{ color: "var(--green)", marginLeft: 8 }}>✓ saved {savedAt}</span>}
        </p>
      </div>
      <ResumeEditor
        initial={resume}
        folder="preview-harness"
        saving={saving}
        onSave={onSave}
        onAIEdit={onAIEdit}
      />
    </div>
  );
}
