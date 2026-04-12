import { sentimentLevelColor } from "@/lib/utils/scores";

interface SentimentBadgeProps {
  score: number | null;
}

export function SentimentBadge({ score }: SentimentBadgeProps) {
  if (score === null) {
    return <span className="text-xs text-gray-400">--</span>;
  }
  const color = sentimentLevelColor(score);
  const label = score > 0 ? `+${score.toFixed(1)}` : score.toFixed(1);
  return (
    <span
      className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ backgroundColor: color.replace(/^hsl\((.+)\)$/, "hsl($1 / 0.13)"), color }}
    >
      {label}
    </span>
  );
}
