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

/**
 * Linear RGB interpolation between hex color stops.
 * t is clamped to [0, 1].
 */
function interpolateStops(stops: string[], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  if (stops.length < 2) return stops[0] ?? "#000000";
  const scaled = clamped * (stops.length - 1);
  const lowIdx = Math.floor(scaled);
  const highIdx = Math.min(stops.length - 1, lowIdx + 1);
  const localT = scaled - lowIdx;
  const a = hexToRgb(stops[lowIdx]);
  const b = hexToRgb(stops[highIdx]);
  const r = Math.round(a[0] + (b[0] - a[0]) * localT);
  const g = Math.round(a[1] + (b[1] - a[1]) * localT);
  const bl = Math.round(a[2] + (b[2] - a[2]) * localT);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Heatmap gradient: white -> pale yellow -> orange -> red -> dark red.
 * Input t is expected in [0, 1] (e.g. normalized log density).
 */
export function getHeatColor(t: number): string {
  return interpolateStops(
    ["#ffffff", "#fff7bc", "#fdae6b", "#e6550d", "#7f2704"],
    t
  );
}

/**
 * Tag health gradient: green -> yellow -> orange -> red.
 * Combines sentiment and urgency into a single health score where
 * low = healthy (sentiment high, urgency low) and high = critical.
 */
export function getTagHealthColor(sentiment: number, urgency: number): string {
  // sentiment in [-5, 5] -> (5 - sentiment) / 10 in [0, 1]
  // urgency in [0, 5] -> urgency / 5 in [0, 1]
  const health =
    0.6 * ((5 - sentiment) / 10) + 0.4 * (urgency / 5);
  return interpolateStops(
    ["#16a34a", "#eab308", "#f97316", "#dc2626"],
    health
  );
}

/** Sentiment -5..+5 -> HSL hue 0 (rouge) a 130 (vert). */
export function sentimentLevelColor(score: number): string {
  const hue = ((score + 5) / 10) * 130;
  return `hsl(${hue}, 70%, 48%)`;
}

/** Urgence 0..5 -> HSL hue 210 (bleu) a 0 (rouge). */
export function urgencyLevelColor(score: number): string {
  const hue = 210 - (score / 5) * 210;
  return `hsl(${hue}, 70%, 48%)`;
}
