export type ScoreLevel = "critical" | "warning" | "good";

/**
 * Returns the severity level for a failure score.
 * - critical: score > 7 (major failures)
 * - warning: score >= 4 (moderate issues)
 * - good: score < 4 (acceptable)
 */
export function getScoreLevel(score: number): ScoreLevel {
  if (score > 7) return "critical";
  if (score >= 4) return "warning";
  return "good";
}

/** Tailwind class mappings for each score level */
export const scoreColors: Record<
  ScoreLevel,
  { bg: string; text: string; dot: string }
> = {
  critical: {
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
  warning: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-500",
  },
  good: {
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
  },
};

/** French labels for each score level */
export const scoreLabelsFr: Record<ScoreLevel, string> = {
  critical: "Critique",
  warning: "Attention",
  good: "Bon",
};

/** Format a score for display. Returns '--' for null values. */
export function formatScore(score: number | null): string {
  if (score === null) return "--";
  return score.toFixed(1);
}
