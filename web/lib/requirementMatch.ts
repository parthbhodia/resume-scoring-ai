/**
 * JD-driven requirement matching types (mirrors resume_gui/tailor/requirement_match).
 * LLM extracts concepts; deterministic code verifies phrase evidence.
 */

export type RequirementImportance = "required" | "preferred" | "nice_to_have";

export type RequirementType =
  | "technical_skill"
  | "tool"
  | "certification"
  | "license"
  | "degree"
  | "domain_knowledge"
  | "soft_skill"
  | "experience"
  | "responsibility";

export type MatchMethod =
  | "exact"
  | "alias"
  | "abbreviation"
  | "semantic"
  | "not_found";

export interface RequirementConcept {
  id: string;
  canonical: string;
  aliases: string[];
  type: RequirementType;
  importance: RequirementImportance;
  roleFamily: string;
  sourceText: string;
  confidence: number;
}

export interface RequirementMatch {
  requirementId: string;
  canonical: string;
  matched: boolean;
  method: MatchMethod;
  matchedText?: string;
  evidence?: string;
  confidence: number;
}
