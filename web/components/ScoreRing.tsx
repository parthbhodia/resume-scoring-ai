"use client";
import { useEffect, useRef } from "react";
import { scoreColor } from "@/lib/utils";

interface Props { score: number; size?: number; }

export default function ScoreRing({ score, size = 120 }: Props) {
  const arcRef  = useRef<SVGCircleElement>(null);
  const valRef  = useRef<HTMLSpanElement>(null);
  const r       = (size / 2) - 8;
  const circ    = 2 * Math.PI * r;
  const color   = scoreColor(score);

  useEffect(() => {
    const arc = arcRef.current;
    const val = valRef.current;
    if (!arc || !val) return;

    // Kick off after 1 frame so CSS transition fires
    const id = requestAnimationFrame(() => {
      arc.style.strokeDashoffset = String(circ - (score / 100) * circ);
    });

    // Count-up animation
    let cur = 0;
    const step = () => {
      cur += 1;
      if (val) val.textContent = String(Math.min(cur, score));
      if (cur < score) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    return () => cancelAnimationFrame(id);
  }, [score, circ]);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--surface2)" strokeWidth={8}
        />
        <circle
          ref={arcRef}
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)", textAlign: "center",
      }}>
        <div style={{ lineHeight: 1 }}>
          <span ref={valRef} style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1.5, color }}>0</span>
          <span style={{ fontSize: 13, color: "var(--dim)", fontWeight: 400 }}>/100</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: -0.1, marginTop: 3 }}>
          Match score
        </div>
      </div>
    </div>
  );
}
