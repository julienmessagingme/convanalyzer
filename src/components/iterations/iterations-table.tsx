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
  avgUrgency: number | null;
  urgencyDistribution: Record<number, number>;
  urgencyTotal: number;
}

interface IterationsTableProps {
  buckets: BucketRow[];
  maxPct: number;
  workspaceId: string;
  type: string;
  dateFrom: string;
  dateTo: string;
}

function sentimentBarColor(score: number): { solid: string; light: string } {
  // Map -5..+5 to a hue from red (0) to green (130)
  const hue = ((score + 5) / 10) * 130;
  return {
    solid: `hsl(${hue}, 70%, 48%)`,
    light: `hsl(${hue}, 75%, 88%)`,
  };
}

function urgencyBarColor(score: number): { solid: string; light: string } {
  // Map 0..5 to a hue from green (130) to red (0)
  // 0 = informationnel (vert), 5 = critique (rouge)
  const hue = 130 - (score / 5) * 130;
  return {
    solid: `hsl(${hue}, 70%, 48%)`,
    light: `hsl(${hue}, 75%, 88%)`,
  };
}

interface HistogramConfig {
  title: string;
  subtitle: string;
  avg: number | null;
  avgLabel: string;
  avgFormatter: (v: number) => string;
  colorFor: (score: number) => { solid: string; light: string };
  scores: number[];
  distribution: Record<number, number>;
  scoreLabel: (score: number) => string;
  leftLabel: string;
  midLabel: string;
  rightLabel: string;
}

function Histogram({ config }: { config: HistogramConfig }) {
  const maxCount = Math.max(...Object.values(config.distribution), 1);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {config.title}
          </h3>
          <p className="text-xs text-gray-500 mt-1">{config.subtitle}</p>
        </div>
        {config.avg !== null && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
              {config.avgLabel}
            </p>
            <p
              className="text-3xl font-bold leading-none mt-1"
              style={{ color: config.colorFor(config.avg).solid }}
            >
              {config.avgFormatter(config.avg)}
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
          {config.scores.map((score) => {
            const count = config.distribution[score] ?? 0;
            const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const { solid, light } = config.colorFor(score);

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
                <div className="text-xs font-medium mt-2 tabular-nums text-gray-600">
                  {config.scoreLabel(score)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Axis labels */}
        <div className="flex items-center justify-between mt-2 px-1 text-[10px] uppercase tracking-wider text-gray-400 font-medium">
          <span>{config.leftLabel}</span>
          <span>{config.midLabel}</span>
          <span>{config.rightLabel}</span>
        </div>
      </div>
    </div>
  );
}

function DistributionPanel({ data }: { data: SentimentData }) {
  const sentimentConfig: HistogramConfig = {
    title: "Distribution du sentiment",
    subtitle: `${data.total} conversation${data.total > 1 ? "s" : ""} scoree${data.total > 1 ? "s" : ""}`,
    avg: data.avgSentiment,
    avgLabel: "Moyenne",
    avgFormatter: (v) => `${v > 0 ? "+" : ""}${v}`,
    colorFor: sentimentBarColor,
    scores: Array.from({ length: 11 }, (_, i) => i - 5),
    distribution: data.distribution,
    scoreLabel: (s) => (s > 0 ? `+${s}` : String(s)),
    leftLabel: "Frustre",
    midLabel: "Neutre",
    rightLabel: "Satisfait",
  };

  const urgencyConfig: HistogramConfig = {
    title: "Distribution de l'urgence",
    subtitle: `${data.urgencyTotal} conversation${data.urgencyTotal > 1 ? "s" : ""} scoree${data.urgencyTotal > 1 ? "s" : ""}`,
    avg: data.avgUrgency,
    avgLabel: "Moyenne",
    avgFormatter: (v) => String(v),
    colorFor: urgencyBarColor,
    scores: [0, 1, 2, 3, 4, 5],
    distribution: data.urgencyDistribution,
    scoreLabel: (s) => String(s),
    leftLabel: "Informationnel",
    midLabel: "Modere",
    rightLabel: "Critique",
  };

  return (
    <div className="px-8 py-6 bg-gradient-to-b from-gray-50/80 to-white border-t border-gray-200">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Histogram config={sentimentConfig} />
        <Histogram config={urgencyConfig} />
      </div>
    </div>
  );
}

export function IterationsTable({
  buckets,
  maxPct,
  workspaceId,
  type,
  dateFrom,
  dateTo,
}: IterationsTableProps) {
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);
  const [sentimentData, setSentimentData] = useState<Record<string, SentimentData>>({});
  const [loading, setLoading] = useState<string | null>(null);

  // Reset cache when period or tab changes so histograms reflect the new window
  const cacheKey = `${type}|${dateFrom}|${dateTo}`;
  const [currentCacheKey, setCurrentCacheKey] = useState(cacheKey);
  if (currentCacheKey !== cacheKey) {
    setCurrentCacheKey(cacheKey);
    setSentimentData({});
    setExpandedBucket(null);
  }

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
        const params = new URLSearchParams({
          workspace_id: workspaceId,
          min: String(bucket.min),
          max: maxParam,
          type,
          date_from: dateFrom,
          date_to: dateTo,
        });
        const res = await fetch(
          `${basePath}/api/iterations/sentiment?${params.toString()}`
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
                    <DistributionPanel data={sentimentData[bucket.label]} />
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
