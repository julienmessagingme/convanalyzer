"use client";

import { useState } from "react";
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

interface TagWithScores {
  id: string;
  label: string;
  avgSentiment: number;
  avgUrgency: number;
  conversationCount: number;
}

interface TagMatrixProps {
  tags: TagWithScores[];
}

function getTagColor(sentiment: number, urgency: number): string {
  if (sentiment < 0 && urgency >= 3) return "#dc2626"; // danger
  if (sentiment >= 0 && urgency >= 3) return "#16a34a"; // opportunite
  if (sentiment < 0 && urgency < 3) return "#d97706"; // bruit
  return "#64748b"; // routine
}

function getBubbleSize(count: number): number {
  if (count >= 50) return 18;
  if (count >= 20) return 14;
  if (count >= 10) return 11;
  if (count >= 5) return 9;
  return 7;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TagWithScores }>;
}

function TagTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg text-sm max-w-xs">
      <p className="font-semibold text-gray-900 mb-2">{data.label}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-gray-500 text-xs">Conversations</span>
        <span className="text-gray-900 text-xs font-medium text-right">{data.conversationCount}</span>
        <span className="text-gray-500 text-xs">Sentiment moyen</span>
        <span className="text-gray-900 text-xs font-medium text-right">
          {data.avgSentiment > 0 ? "+" : ""}{data.avgSentiment.toFixed(1)}
        </span>
        <span className="text-gray-500 text-xs">Urgence moyenne</span>
        <span className="text-gray-900 text-xs font-medium text-right">{data.avgUrgency.toFixed(1)}/5</span>
      </div>
    </div>
  );
}

export function TagMatrix({ tags }: TagMatrixProps) {
  const [selectedTags, setSelectedTags] = useState<Set<string>>(
    new Set(tags.map((t) => t.id))
  );

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedTags(new Set(tags.map((t) => t.id)));
  const selectNone = () => setSelectedTags(new Set());

  const visibleTags = tags.filter((t) => selectedTags.has(t.id));

  if (tags.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-500">
        Creez des tags et lancez le pipeline pour voir la matrice par theme.
      </div>
    );
  }

  return (
    <div>
      {/* Tag selector */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Tags :</span>
        <button
          onClick={selectAll}
          className="text-xs px-2 py-0.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
        >
          Tous
        </button>
        <button
          onClick={selectNone}
          className="text-xs px-2 py-0.5 rounded text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Aucun
        </button>
        <span className="text-xs text-gray-300">|</span>
        {tags.map((tag) => (
          <button
            key={tag.id}
            onClick={() => toggleTag(tag.id)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              selectedTags.has(tag.id)
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {tag.label} ({tag.conversationCount})
          </button>
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

            {/* Labels */}
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

            <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="6 4" />
            <ReferenceLine x={3} stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="6 4" />

            <XAxis
              type="number"
              dataKey="avgUrgency"
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
              dataKey="avgSentiment"
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
            <Tooltip content={<TagTooltip />} cursor={false} isAnimationActive={false} />
            <Scatter data={visibleTags} cursor="pointer">
              {visibleTags.map((tag) => (
                <Cell
                  key={tag.id}
                  fill={getTagColor(tag.avgSentiment, tag.avgUrgency)}
                  fillOpacity={0.85}
                  stroke="white"
                  strokeWidth={2}
                  r={getBubbleSize(tag.conversationCount)}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
