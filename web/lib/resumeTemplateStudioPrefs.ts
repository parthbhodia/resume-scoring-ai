/** Session keys — Template Studio → Résumé Builder handoff (spacing/margins for future LaTeX tuning). */
export const RN_LINE_SPACING_KEY = "rn_resume_line_spacing";
export const RN_MARGIN_IN_KEY = "rn_resume_margin_in";
/** When set, builder keeps template-studio mode until user explicitly opens job tailoring (`intent=job`). */
export const RN_BUILDER_LAYOUT_ONLY_KEY = "rn_builder_layout_only";

export type LineSpacingChoice = "1" | "1.15" | "1.5";
export type MarginInchesChoice = "0.5" | "0.75" | "1";

export function readLineSpacing(): LineSpacingChoice {
  try {
    const v = sessionStorage.getItem(RN_LINE_SPACING_KEY);
    if (v === "1" || v === "1.15" || v === "1.5") return v;
  } catch { /* ignore */ }
  return "1.15";
}

export function readMarginInches(): MarginInchesChoice {
  try {
    const v = sessionStorage.getItem(RN_MARGIN_IN_KEY);
    if (v === "0.5" || v === "0.75" || v === "1") return v;
  } catch { /* ignore */ }
  return "0.75";
}
