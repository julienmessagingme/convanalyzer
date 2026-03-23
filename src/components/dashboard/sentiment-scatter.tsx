"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceArea,
  ReferenceLine,
  Label,
} from "recharts";
import { format, parseISO } from "date-fns";

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

interface TagOption {
  id: string;
  label: string;
}

interface SentimentScatterProps {
  conversations: ScatterConversation[];
  workspaceId: string;
  tags?: TagOption[];
}

const QUADRANTS = {
  danger: { color: "#dc2626", bg: "#fef2f2", label: "Danger", emoji: "🔴" },
  opportunite: { color: "#16a34a", bg: "#f0fdf4", label: "Opportunite", emoji: "🟢" },
  bruit: { color: "#d97706", bg: "#fffbeb", label: "Bruit de fond", emoji: "🟡" },
  routine: { color: "#64748b", bg: "#f8fafc", label: "Routine", emoji: "⚪" },
} as const;

function getQuadrant(conv: ScatterConversation) {
  const urgency = conv.urgency_score ?? 0;
  const sentiment = conv.sentiment_score ?? 0;
  if (sentiment < 0 && urgency >= 3) return QUADRANTS.danger;
  if (sentiment >= 0 && urgency >= 3) return QUADRANTS.opportunite;
  if (sentiment < 0 && urgency < 3) return QUADRANTS.bruit;
  return QUADRANTS.routine;
}

// Point size based on message count (more messages = bigger dot)
function getDotSize(messageCount: number): number {
  if (messageCount >= 20) return 10;
  if (messageCount >= 10) return 8;
  if (messageCount >= 5) return 6;
  return 5;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ScatterConversation }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  const dateStr = data.started_at || data.created_at;
  const quadrant = getQuadrant(data);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg text-sm max-w-xs">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ backgroundColor: quadrant.color }}
        />
        <span className="font-semibold text-gray-900">{quadrant.label}</span>
      </div>
      <p className="text-gray-400 text-xs mb-2">
        {format(parseISO(dateStr), "dd MMM yyyy HH:mm")}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
        <span className="text-gray-500 text-xs">Sentiment</span>
        <span className="text-gray-900 text-xs font-medium text-right">
          {data.sentiment_score > 0 ? "+" : ""}{data.sentiment_score}
        </span>
        <span className="text-gray-500 text-xs">Urgence</span>
        <span className="text-gray-900 text-xs font-medium text-right">
          {data.urgency_score ?? 0}/5
        </span>
        <span className="text-gray-500 text-xs">Messages</span>
        <span className="text-gray-900 text-xs font-medium text-right">
          {data.message_count}
        </span>
      </div>
      {data.tags && data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {data.tags.map((t) => (
            <span key={t.id} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
              {t.label}
            </span>
          ))}
        </div>
      )}
      <p className="text-gray-400 text-xs border-t border-gray-100 pt-1 mt-1">
        {data.type === "agent" ? "Transfere humain" : "Bot"} — Cliquer pour voir
      </p>
    </div>
  );
}

export function SentimentScatter({
  conversations,
  workspaceId,
  tags = [],
}: SentimentScatterProps) {
  const router = useRouter();
  const [selectedTag, setSelectedTag] = useState<string>("all");

  const handleClick = useCallback(
    (data: ScatterConversation) => {
      router.push(`/${workspaceId}/conversations/${data.id}`);
    },
    [router, workspaceId]
  );

  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500">
        Aucune conversation avec score de sentiment disponible.
      </div>
    );
  }

  // Filter by tag
  const filtered = selectedTag === "all"
    ? conversations
    : conversations.filter((c) =>
        c.tags?.some((t) => t.id === selectedTag)
      );

  const scatterData = filtered.map((c) => ({
    ...c,
    urgency_score: c.urgency_score ?? 0,
  }));

  // Count per quadrant
  const counts = { danger: 0, opportunite: 0, bruit: 0, routine: 0 };
  for (const c of scatterData) {
    const u = c.urgency_score ?? 0;
    const s = c.sentiment_score ?? 0;
    if (s < 0 && u >= 3) counts.danger++;
    else if (s >= 0 && u >= 3) counts.opportunite++;
    else if (s < 0 && u < 3) counts.bruit++;
    else counts.routine++;
  }

  return (
    <div>
      {/* Tag filter */}
      {tags.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Filtrer :</span>
          <button
            onClick={() => setSelectedTag("all")}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              selectedTag === "all"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Tous ({conversations.length})
          </button>
          {tags.map((tag) => {
            const count = conversations.filter((c) =>
              c.tags?.some((t) => t.id === tag.id)
            ).length;
            if (count === 0) return null;
            return (
              <button
                key={tag.id}
                onClick={() => setSelectedTag(tag.id)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  selectedTag === tag.id
                    ? "bg-blue-600 text-white"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
              >
                {tag.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Quadrant counters */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {(Object.keys(QUADRANTS) as Array<keyof typeof QUADRANTS>).map((key) => (
          <div
            key={key}
            className="rounded-lg px-3 py-2 text-center"
            style={{ backgroundColor: QUADRANTS[key].bg }}
          >
            <div className="text-lg font-bold" style={{ color: QUADRANTS[key].color }}>
              {counts[key]}
            </div>
            <div className="text-xs text-gray-500">{QUADRANTS[key].label}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 25, left: 15 }}>
            {/* Quadrant backgrounds */}
            <ReferenceArea x1={0} x2={2.99} y1={0.01} y2={5} fill="#16a34a" fillOpacity={0.05} />
            <ReferenceArea x1={3} x2={5} y1={0.01} y2={5} fill="#16a34a" fillOpacity={0.1} />
            <ReferenceArea x1={0} x2={2.99} y1={-5} y2={-0.01} fill="#d97706" fillOpacity={0.07} />
            <ReferenceArea x1={3} x2={5} y1={-5} y2={-0.01} fill="#dc2626" fillOpacity={0.1} />

            {/* Quadrant labels */}
            <ReferenceArea x1={0.1} x2={1.5} y1={3.5} y2={4.8} fill="transparent">
              <Label value="Routine" position="center" style={{ fill: "#94a3b8", fontSize: 11, fontWeight: 500 }} />
            </ReferenceArea>
            <ReferenceArea x1={3.5} x2={4.9} y1={3.5} y2={4.8} fill="transparent">
              <Label value="Opportunite" position="center" style={{ fill: "#16a34a", fontSize: 11, fontWeight: 600 }} />
            </ReferenceArea>
            <ReferenceArea x1={0.1} x2={1.5} y1={-4.8} y2={-3.5} fill="transparent">
              <Label value="Bruit de fond" position="center" style={{ fill: "#d97706", fontSize: 11, fontWeight: 500 }} />
            </ReferenceArea>
            <ReferenceArea x1={3.5} x2={4.9} y1={-4.8} y2={-3.5} fill="transparent">
              <Label value="DANGER" position="center" style={{ fill: "#dc2626", fontSize: 12, fontWeight: 700 }} />
            </ReferenceArea>

            {/* Dividers */}
            <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="6 4" />
            <ReferenceLine x={3} stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="6 4" />

            <XAxis
              type="number"
              dataKey="urgency_score"
              domain={[0, 5]}
              ticks={[0, 1, 2, 3, 4, 5]}
              fontSize={11}
              tick={{ fill: "#9ca3af" }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
              label={{
                value: "Informationnel  \u2192  Critique",
                position: "insideBottom",
                offset: -15,
                style: { fill: "#9ca3af", fontSize: 10 },
              }}
            />
            <YAxis
              type="number"
              dataKey="sentiment_score"
              domain={[-5, 5]}
              ticks={[-5, -3, -1, 0, 1, 3, 5]}
              fontSize={11}
              tick={{ fill: "#9ca3af" }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
              label={{
                value: "Frustre  \u2192  Satisfait",
                angle: -90,
                position: "insideLeft",
                offset: 5,
                style: { fill: "#9ca3af", fontSize: 10 },
              }}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} isAnimationActive={false} />
            <Scatter
              data={scatterData}
              onClick={(entry) =>
                handleClick(entry as unknown as ScatterConversation)
              }
              cursor="pointer"
            >
              {scatterData.map((conv) => {
                const q = getQuadrant(conv);
                const size = getDotSize(conv.message_count);
                return (
                  <Cell
                    key={conv.id}
                    fill={q.color}
                    fillOpacity={0.8}
                    stroke="white"
                    strokeWidth={1.5}
                    r={size}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
