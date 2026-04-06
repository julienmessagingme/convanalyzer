import { Bot, User } from "lucide-react";
import type { SearchGroup } from "@/lib/supabase/search";

interface SearchGroupStatsProps {
  label: string;
  type: "bot" | "agent";
  group: SearchGroup;
}

function formatAvg(value: number | null): string {
  if (value === null) return "--";
  return value.toFixed(1);
}

function sentimentColor(value: number | null): string {
  if (value === null) return "text-gray-400";
  if (value >= 2) return "text-green-600";
  if (value >= 0) return "text-gray-600";
  if (value >= -2) return "text-orange-600";
  return "text-red-600";
}

function urgencyColor(value: number | null): string {
  if (value === null) return "text-gray-400";
  if (value >= 3) return "text-red-600";
  if (value >= 2) return "text-orange-600";
  return "text-green-600";
}

export function SearchGroupStats({ label, type, group }: SearchGroupStatsProps) {
  const Icon = type === "bot" ? Bot : User;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-5 w-5 text-gray-500" />
        <h3 className="text-sm font-medium text-gray-900">{label}</h3>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-2xl font-bold text-gray-900">{group.count}</p>
          <p className="text-xs text-gray-500">conversations</p>
        </div>
        <div>
          <p className={`text-2xl font-bold ${sentimentColor(group.avgSentiment)}`}>
            {formatAvg(group.avgSentiment)}
          </p>
          <p className="text-xs text-gray-500">sentiment moy.</p>
        </div>
        <div>
          <p className={`text-2xl font-bold ${urgencyColor(group.avgUrgency)}`}>
            {formatAvg(group.avgUrgency)}
          </p>
          <p className="text-xs text-gray-500">urgence moy.</p>
        </div>
      </div>
    </div>
  );
}
