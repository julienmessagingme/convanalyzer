"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getHeatColor } from "@/lib/utils/scores";

interface ScatterConversation {
  id: string;
  sentiment_score: number;
  urgency_score: number | null;
  message_count: number;
  failure_score: number;
  type: string;
  started_at: string | null;
  created_at: string;
  tags?: { id: string; label: string }[];
}

interface DensityHeatmapProps {
  conversations: ScatterConversation[];
  workspaceId: string;
  /**
   * When set, the click-through URL always includes `tag=forcedTagId`.
   * Used by TagHeatmap which pre-filters conversations to a single tag.
   */
  forcedTagId?: string;
}

// Grid dimensions
const SENTIMENT_MIN = -5;
const SENTIMENT_MAX = 5;
const URGENCY_MIN = 0;
const URGENCY_MAX = 5;
const SENT_STEPS = SENTIMENT_MAX - SENTIMENT_MIN + 1; // 11
const URG_STEPS = URGENCY_MAX - URGENCY_MIN + 1; // 6

// SVG layout
const SVG_WIDTH = 900;
const SVG_HEIGHT = 500;
const MARGIN_LEFT = 70;
const MARGIN_RIGHT = 30;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 60;
const PLOT_W = SVG_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const PLOT_H = SVG_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
const CELL_W = PLOT_W / URG_STEPS;
const CELL_H = PLOT_H / SENT_STEPS;

interface CellData {
  u: number; // urgency value
  s: number; // sentiment value
  count: number;
  totalMessages: number;
}

interface HoverInfo {
  u: number;
  s: number;
  count: number;
  avgMessages: number;
  x: number;
  y: number;
}

export function DensityHeatmap({
  conversations,
  workspaceId,
  forcedTagId,
}: DensityHeatmapProps) {
  const router = useRouter();
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // Aggregate counts into 11x6 grid
  const { cells, maxCount, totalCount } = useMemo(() => {
    // counts[urgency 0..5][sentIndex 0..10]
    const counts: number[][] = Array.from({ length: URG_STEPS }, () =>
      Array(SENT_STEPS).fill(0)
    );
    const msgs: number[][] = Array.from({ length: URG_STEPS }, () =>
      Array(SENT_STEPS).fill(0)
    );
    let max = 0;
    let total = 0;
    for (const c of conversations) {
      const u = c.urgency_score ?? 0;
      const s = c.sentiment_score;
      if (s < SENTIMENT_MIN || s > SENTIMENT_MAX) continue;
      if (u < URGENCY_MIN || u > URGENCY_MAX) continue;
      const uIdx = u - URGENCY_MIN;
      const sIdx = s - SENTIMENT_MIN;
      counts[uIdx][sIdx]++;
      msgs[uIdx][sIdx] += c.message_count;
      total++;
      if (counts[uIdx][sIdx] > max) max = counts[uIdx][sIdx];
    }
    const flat: CellData[] = [];
    for (let uIdx = 0; uIdx < URG_STEPS; uIdx++) {
      for (let sIdx = 0; sIdx < SENT_STEPS; sIdx++) {
        flat.push({
          u: uIdx + URGENCY_MIN,
          s: sIdx + SENTIMENT_MIN,
          count: counts[uIdx][sIdx],
          totalMessages: msgs[uIdx][sIdx],
        });
      }
    }
    return { cells: flat, maxCount: max, totalCount: total };
  }, [conversations]);

  // Log normalization: log(1+n)/log(1+max)
  const logMax = maxCount > 0 ? Math.log(1 + maxCount) : 1;

  // Convert (u, s) to SVG pixel coordinates (top-left of cell)
  const cellX = (u: number) => MARGIN_LEFT + (u - URGENCY_MIN) * CELL_W;
  // Sentiment axis: +5 at top, -5 at bottom
  const cellY = (s: number) =>
    MARGIN_TOP + (SENTIMENT_MAX - s) * CELL_H;

  const handleCellClick = (u: number, s: number, count: number) => {
    if (count === 0) return;
    const params = new URLSearchParams();
    params.set("urgency_score", String(u));
    params.set("sentiment_score", String(s));
    if (forcedTagId) params.set("tag", forcedTagId);
    router.push(`/${workspaceId}/conversations?${params.toString()}`);
  };

  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 text-sm text-gray-500">
        Aucune conversation avec score de sentiment disponible.
      </div>
    );
  }

  // Y axis ticks (sentiment)
  const sentimentTicks = [5, 3, 1, 0, -1, -3, -5];
  // X axis ticks (urgency)
  const urgencyTicks = [0, 1, 2, 3, 4, 5];

  return (
    <div>
      {/* Count summary */}
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
        <span>
          <strong className="text-gray-900">{totalCount}</strong> conversations
        </span>
        <span>
          Max cellule :{" "}
          <strong className="text-gray-900">{maxCount}</strong>
        </span>
      </div>

      {/* SVG heatmap */}
      <div className="relative" style={{ width: "100%" }}>
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-auto"
          style={{ maxHeight: 550 }}
        >
          <defs>
            <filter
              id="heat-blur"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feGaussianBlur stdDeviation="24" />
            </filter>
            <clipPath id="heat-clip">
              <rect
                x={MARGIN_LEFT}
                y={MARGIN_TOP}
                width={PLOT_W}
                height={PLOT_H}
              />
            </clipPath>
          </defs>

          {/* Blurred heatmap layer */}
          <g filter="url(#heat-blur)" clipPath="url(#heat-clip)">
            {/* White background to ensure blur has base */}
            <rect
              x={MARGIN_LEFT}
              y={MARGIN_TOP}
              width={PLOT_W}
              height={PLOT_H}
              fill="#ffffff"
            />
            {cells.map((cell) => {
              const t =
                cell.count === 0 ? 0 : Math.log(1 + cell.count) / logMax;
              const color = getHeatColor(t);
              return (
                <rect
                  key={`blur-${cell.u}-${cell.s}`}
                  x={cellX(cell.u)}
                  y={cellY(cell.s)}
                  width={CELL_W}
                  height={CELL_H}
                  fill={color}
                />
              );
            })}
          </g>

          {/* Y axis line */}
          <line
            x1={MARGIN_LEFT}
            y1={MARGIN_TOP}
            x2={MARGIN_LEFT}
            y2={MARGIN_TOP + PLOT_H}
            stroke="#e5e7eb"
            strokeWidth={1}
          />
          {/* X axis line */}
          <line
            x1={MARGIN_LEFT}
            y1={MARGIN_TOP + PLOT_H}
            x2={MARGIN_LEFT + PLOT_W}
            y2={MARGIN_TOP + PLOT_H}
            stroke="#e5e7eb"
            strokeWidth={1}
          />

          {/* Y axis ticks + labels */}
          {sentimentTicks.map((s) => {
            const y = cellY(s) + CELL_H / 2;
            return (
              <g key={`ytick-${s}`}>
                <line
                  x1={MARGIN_LEFT - 4}
                  y1={y}
                  x2={MARGIN_LEFT}
                  y2={y}
                  stroke="#9ca3af"
                  strokeWidth={1}
                />
                <text
                  x={MARGIN_LEFT - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="11"
                  fill="#9ca3af"
                >
                  {s > 0 ? `+${s}` : s}
                </text>
              </g>
            );
          })}

          {/* X axis ticks + labels */}
          {urgencyTicks.map((u) => {
            const x = cellX(u) + CELL_W / 2;
            return (
              <g key={`xtick-${u}`}>
                <line
                  x1={x}
                  y1={MARGIN_TOP + PLOT_H}
                  x2={x}
                  y2={MARGIN_TOP + PLOT_H + 4}
                  stroke="#9ca3af"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={MARGIN_TOP + PLOT_H + 18}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#9ca3af"
                >
                  {u}
                </text>
              </g>
            );
          })}

          {/* Axis titles */}
          <text
            x={MARGIN_LEFT + PLOT_W / 2}
            y={SVG_HEIGHT - 15}
            textAnchor="middle"
            fontSize="11"
            fill="#9ca3af"
          >
            Urgence : Informationnel → Critique
          </text>
          <text
            x={20}
            y={MARGIN_TOP + PLOT_H / 2}
            textAnchor="middle"
            fontSize="11"
            fill="#9ca3af"
            transform={`rotate(-90 20 ${MARGIN_TOP + PLOT_H / 2})`}
          >
            Sentiment : Frustré → Satisfait
          </text>

          {/* Divider lines: between sentiment 0 and -1 (satisfied vs frustrated),
              and between urgency 2 and 3 (low vs critical) */}
          <line
            x1={MARGIN_LEFT}
            y1={cellY(0) + CELL_H}
            x2={MARGIN_LEFT + PLOT_W}
            y2={cellY(0) + CELL_H}
            stroke="#cbd5e1"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <line
            x1={cellX(3)}
            y1={MARGIN_TOP}
            x2={cellX(3)}
            y2={MARGIN_TOP + PLOT_H}
            stroke="#cbd5e1"
            strokeWidth={1}
            strokeDasharray="4 4"
          />

          {/* Hit-test layer (invisible rects for click + hover) */}
          <g>
            {cells.map((cell) => {
              const x = cellX(cell.u);
              const y = cellY(cell.s);
              return (
                <rect
                  key={`hit-${cell.u}-${cell.s}`}
                  x={x}
                  y={y}
                  width={CELL_W}
                  height={CELL_H}
                  fill="transparent"
                  style={{
                    cursor: cell.count > 0 ? "pointer" : "default",
                  }}
                  onClick={() =>
                    handleCellClick(cell.u, cell.s, cell.count)
                  }
                  onMouseEnter={() =>
                    setHover({
                      u: cell.u,
                      s: cell.s,
                      count: cell.count,
                      avgMessages:
                        cell.count > 0
                          ? cell.totalMessages / cell.count
                          : 0,
                      x: x + CELL_W / 2,
                      y: y,
                    })
                  }
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </g>

          {/* Hover tooltip */}
          {hover && (
            <g pointerEvents="none">
              <rect
                x={Math.min(hover.x + 8, SVG_WIDTH - 180)}
                y={Math.max(hover.y - 60, 0)}
                width={170}
                height={55}
                rx={6}
                fill="white"
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text
                x={Math.min(hover.x + 16, SVG_WIDTH - 172)}
                y={Math.max(hover.y - 40, 20)}
                fontSize="11"
                fontWeight="600"
                fill="#111827"
              >
                Urgence {hover.u}, Sentiment{" "}
                {hover.s > 0 ? `+${hover.s}` : hover.s}
              </text>
              <text
                x={Math.min(hover.x + 16, SVG_WIDTH - 172)}
                y={Math.max(hover.y - 24, 36)}
                fontSize="11"
                fill="#374151"
              >
                {hover.count} conversation
                {hover.count > 1 ? "s" : ""}
              </text>
              {hover.count > 0 && (
                <text
                  x={Math.min(hover.x + 16, SVG_WIDTH - 172)}
                  y={Math.max(hover.y - 10, 50)}
                  fontSize="10"
                  fill="#9ca3af"
                >
                  ~{hover.avgMessages.toFixed(0)} messages / conv
                </text>
              )}
            </g>
          )}
        </svg>

        {/* Gradient legend */}
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <span>Faible densité</span>
          <div
            className="h-2 flex-1 max-w-xs rounded"
            style={{
              background:
                "linear-gradient(to right, #ffffff, #fff7bc, #fdae6b, #e6550d, #7f2704)",
              border: "1px solid #e5e7eb",
            }}
          />
          <span>Forte densité</span>
        </div>
      </div>
    </div>
  );
}
