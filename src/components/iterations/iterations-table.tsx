"use client";

import { useState } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

interface BucketRow {
  label: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

interface SentimentData {
  total: number;
  avgSentiment: number | null;
  distribution: Record<number, number>;
}

interface IterationsTableProps {
  buckets: BucketRow[];
  maxPct: number;
  workspaceId: string;
  type: string;
}

function sentimentBarColor(score: number): { solid: string; light: string } {
  // Map -5..+5 to a hue from red (0) to green (130)
  const hue = ((score + 5) / 10) * 130;
  return {
    solid: `hsl(${hue}, 70%, 48%)`,
    light: `hsl(${hue}, 75%, 88%)`,
  };
}

function SentimentPanel({ data }: { data: SentimentData }) {
  const maxCount = Math.max(...Object.values(data.distribution), 1);

  return (
    <div className="px-8 py-6 bg-gradient-to-b from-gray-50/80 to-white border-t border-gray-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Distribution du sentiment
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {data.total} conversation{data.total > 1 ? "s" : ""} scoree
            {data.total > 1 ? "s" : ""}
          </p>
        </div>
        {data.avgSentiment !== null && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
              Moyenne
            </p>
            <p
              className="text-3xl font-bold leading-none mt-1"
              style={{ color: sentimentBarColor(data.avgSentiment).solid }}
            >
              {data.avgSentiment > 0 ? "+" : ""}
              {data.avgSentiment}
            </p>
          </div>
        )}
      </div>

      {/* Histogram */}
      <div className="relative">
        {/* Horizontal gridlines */}
        <div className="absolute inset-0 flex flex-col justify-between pb-8 pointer-events-none">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="border-t border-dashed border-gray-200/70"
            />
          ))}
        </div>

        {/* Bars */}
        <div className="relative flex items-end gap-2 h-56">
          {Array.from({ length: 11 }, (_, i) => i - 5).map((score) => {
            const count = data.distribution[score] ?? 0;
            const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const { solid, light } = sentimentBarColor(score);

            return (
              <div
                key={score}
                className="group flex-1 flex flex-col items-center justify-end h-full"
              >
                {/* Count label */}
                <div className="text-xs font-semibold text-gray-800 mb-1.5 tabular-nums min-h-[16px]">
                  {count > 0 ? count : ""}
                </div>

                {/* Bar */}
                <div
                  className="w-full rounded-t-md transition-all duration-300 group-hover:brightness-110 group-hover:-translate-y-0.5 shadow-sm"
                  style={{
                    height: `${count > 0 ? Math.max(heightPct, 3) : 0}%`,
                    background: `linear-gradient(to top, ${solid} 0%, ${solid} 70%, ${light} 100%)`,
                  }}
                />

                {/* Score label (below bar) */}
                <div
                  className={`text-xs font-medium mt-2 tabular-nums ${
                    score === 0 ? "text-gray-500" : "text-gray-600"
                  }`}
                >
                  {score > 0 ? `+${score}` : score}
                </div>
              </div>
            );
          })}
        </div>

        {/* Axis labels */}
        <div className="flex items-center justify-between mt-2 px-1 text-[10px] uppercase tracking-wider text-gray-400 font-medium">
          <span>Frustre</span>
          <span>Neutre</span>
          <span>Satisfait</span>
        </div>
      </div>
    </div>
  );
}

export function IterationsTable({
  buckets,
  maxPct,
  workspaceId,
  type,
}: IterationsTableProps) {
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);
  const [sentimentData, setSentimentData] = useState<Record<string, SentimentData>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const handleRowClick = async (bucket: BucketRow) => {
    if (expandedBucket === bucket.label) {
      setExpandedBucket(null);
      return;
    }

    setExpandedBucket(bucket.label);

    // Fetch sentiment data if not cached
    if (!sentimentData[bucket.label]) {
      setLoading(bucket.label);
      try {
        const maxParam = bucket.max === Infinity ? "9999" : String(bucket.max);
        const res = await fetch(
          `${basePath}/api/iterations/sentiment?workspace_id=${workspaceId}&min=${bucket.min}&max=${maxParam}&type=${type}`
        );
        if (res.ok) {
          const data = await res.json();
          setSentimentData((prev) => ({ ...prev, [bucket.label]: data }));
        }
      } finally {
        setLoading(null);
      }
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Iterations
            </th>
            <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Conversations
            </th>
            <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              %
            </th>
            <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
              Repartition
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {buckets.map((bucket) => (
            <tr key={bucket.label}>
              <td colSpan={4} className="p-0">
                <div
                  className={`grid grid-cols-[auto_auto_auto_1fr] items-center cursor-pointer hover:bg-gray-50 transition-colors ${
                    expandedBucket === bucket.label ? "bg-blue-50/30" : ""
                  }`}
                  onClick={() => handleRowClick(bucket)}
                >
                  <span className="px-6 py-4 text-sm font-medium text-gray-900">
                    {bucket.label}
                  </span>
                  <span className="px-6 py-4 text-sm text-gray-700 text-right">
                    {bucket.count}
                  </span>
                  <span className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                    {bucket.percentage}%
                  </span>
                  <span className="px-6 py-4">
                    <div className="w-full bg-gray-100 rounded-full h-4">
                      <div
                        className="bg-blue-500 h-4 rounded-full transition-all"
                        style={{
                          width: `${(bucket.percentage / maxPct) * 100}%`,
                        }}
                      />
                    </div>
                  </span>
                </div>

                {/* Expanded sentiment panel */}
                {expandedBucket === bucket.label && (
                  loading === bucket.label ? (
                    <div className="px-6 py-4 text-sm text-gray-400 text-center border-t border-gray-100">
                      Chargement...
                    </div>
                  ) : sentimentData[bucket.label] ? (
                    <SentimentPanel data={sentimentData[bucket.label]} />
                  ) : null
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
