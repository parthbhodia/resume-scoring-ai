import type { CSSProperties } from "react";

/** Card edges with a thicker left accent — never mix `border` + `borderLeft` (React warning). */
export function accentCardBorder(leftColor: string, edgeColor = "var(--border)"): CSSProperties {
  return {
    borderTop: `1px solid ${edgeColor}`,
    borderRight: `1px solid ${edgeColor}`,
    borderBottom: `1px solid ${edgeColor}`,
    borderLeft: `3px solid ${leftColor}`,
  };
}
