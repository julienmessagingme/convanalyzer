import Link from "next/link";
import { sentimentLevelColor, urgencyLevelColor } from "@/lib/utils/scores";

interface TagDistribution {
  id: string;
  label: string;
  count: number;
  percentage: number;
}

interface LevelCardProps {
  level: number;
  total: number;
  tags: TagDistribution[];
  axis: "sentiment" | "urgency";
  workspaceId: string;
}

const MAX_VISIBLE = 8;

export function LevelCard({
  level,
  total,
  tags,
  axis,
  workspaceId,
}: LevelCardProps) {
  const color =
    axis === "sentiment"
      ? sentimentLevelColor(level)
      : urgencyLevelColor(level);

  const axisLabel = axis === "sentiment" ? "Sentiment" : "Urgence";
  const levelLabel = axis === "sentiment" && level > 0 ? `+${level}` : `${level}`;
  const scoreParam = axis === "sentiment" ? "sentiment_score" : "urgency_score";

  const visible = tags.slice(0, MAX_VISIBLE);
  const remaining = tags.length - visible.length;
  const maxPctInCard = visible.length > 0 ? visible[0].percentage : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {axisLabel}
          </p>
          <p
            className="text-3xl font-bold leading-none mt-1"
            style={{ color }}
          >
            {levelLabel}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Conversations</p>
          <p className="text-lg font-semibold text-gray-900">{total}</p>
        </div>
      </div>

      {tags.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Aucun theme associe</p>
      ) : (
        <div className="space-y-2">
          {visible.map((tag) => {
            const barWidth =
              maxPctInCard > 0 ? (tag.percentage / maxPctInCard) * 100 : 0;
            const href = `/${workspaceId}/conversations?tag=${tag.id}&${scoreParam}=${level}`;
            return (
              <Link
                key={tag.id}
                href={href}
                className="block group"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm text-gray-700 truncate group-hover:text-gray-900">
                    {tag.label}
                  </span>
                  <span className="text-xs font-medium text-gray-600 flex-shrink-0">
                    {tag.percentage}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </Link>
            );
          })}
          {remaining > 0 && (
            <p className="text-xs text-gray-400 pt-1">+{remaining} autres</p>
          )}
        </div>
      )}
    </div>
  );
}
