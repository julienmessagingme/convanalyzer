"use client";

import { useState } from "react";
import { getScoreLevel, scoreColors, formatScore } from "@/lib/utils/scores";

interface FailureBadgeProps {
  score: number | null;
  reason: string | null;
}

export function FailureBadge({ score, reason }: FailureBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (score === null) return null;

  const level = getScoreLevel(score);
  const colors = scoreColors[level];

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
      >
        <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
        {formatScore(score)}
      </span>

      {showTooltip && reason && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
          {reason}
        </div>
      )}
    </div>
  );
}
