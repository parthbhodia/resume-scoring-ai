"use client";
import type { CSSProperties } from "react";
/**
 * BrandLogo — shared logo primitives used by LandingPage + AppShell.
 *
 * LogoMark  — amber square with custom R glyph (SVG, scales cleanly)
 * LogoFull  — mark + "Resunova" wordmark side-by-side
 */

interface LogoMarkProps {
  /** px size of the square mark (default 28) */
  size?: number;
  /** Brand variant (default "resunova") */
  variant?: "resunova" | "umbc";
}

export function LogoMark({ size = 28, variant = "resunova" }: LogoMarkProps) {
  const markColor = variant === "umbc" ? "#b8860b" : "#c4793a";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-label={`${variant} logo mark`}
    >
      {/* Colored rounded square */}
      <rect width="28" height="28" rx="7" fill={markColor} />

      {/* ── Custom R letterform ───────────────────────────── */}
      {/* Vertical bar */}
      <path d="M8 7v14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      {/* Bowl — right-facing arch, connects top of bar, bulges to x≈17.5 */}
      <path
        d="M8 7h5A4.5 4.5 0 0 1 13 16H8"
        stroke="white" strokeWidth="2" strokeLinecap="round"
        strokeLinejoin="round" fill="none"
      />
      {/* Diagonal leg */}
      <path d="M13 16l6 5" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface LogoFullProps {
  /** px size of the square mark (wordmark scales with it) */
  markSize?: number;
  /** Override text color (defaults to currentColor / inherit) */
  textColor?: string;
  /** Brand variant (default "resunova") */
  variant?: "resunova" | "umbc";
  className?: string;
  style?: CSSProperties;
}

export function LogoFull({
  markSize = 28,
  textColor,
  variant = "resunova",
  className,
  style,
}: LogoFullProps) {
  const fontSize = Math.round(markSize * 0.64);
  const brandText = variant === "umbc" ? "UMBC" : "Resunova";
  return (
    <div
      className={className}
      style={{
        display: "flex", alignItems: "center",
        gap: Math.round(markSize * 0.32),
        ...style,
      }}
    >
      <LogoMark size={markSize} variant={variant} />
      <span style={{
        fontSize,
        fontWeight: 700,
        letterSpacing: -0.5,
        lineHeight: 1,
        color: textColor ?? "inherit",
        fontFamily: "'DM Sans', -apple-system, sans-serif",
        userSelect: "none",
      }}>
        {brandText}
      </span>
    </div>
  );
}
