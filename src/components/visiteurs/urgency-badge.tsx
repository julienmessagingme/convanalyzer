interface UrgencyBadgeProps {
  score: number | null;
}

export function UrgencyBadge({ score }: UrgencyBadgeProps) {
  if (score === null) return <span className="text-xs text-gray-400">--</span>;

  const rounded = Math.round(score * 10) / 10;
  let colorClass = "bg-blue-50 text-blue-600";
  if (score >= 4) colorClass = "bg-red-50 text-red-600";
  else if (score >= 2) colorClass = "bg-orange-50 text-orange-600";

  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}
    >
      {rounded.toFixed(1)}
    </span>
  );
}
