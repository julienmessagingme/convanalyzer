"use client";

import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Legend,
} from "recharts";

export interface AnalyticsDataPoint {
  date: string;
  count: number;
  avg_sentiment?: number;
  avg_urgency?: number;
}

interface AnalyticsChartProps {
  data: AnalyticsDataPoint[];
  showSentiment: boolean;
  showUrgency: boolean;
}

const SERIES_LABELS: Record<string, string> = {
  count: "Conversations",
  avg_sentiment: "Sentiment moy.",
  avg_urgency: "Urgence moy.",
};

function formatDate(d: string) {
  const parts = d.split("-");
  return `${parts[2]}/${parts[1]}`;
}

export default function AnalyticsChart({
  data,
  showSentiment,
  showUrgency,
}: AnalyticsChartProps) {
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 12, fill: "#6b7280" }}
          />
          <YAxis
            yAxisId="count"
            tick={{ fontSize: 12, fill: "#6b7280" }}
            label={{
              value: "Conversations",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "#9ca3af" },
            }}
          />
          {(showSentiment || showUrgency) && (
            <YAxis
              yAxisId="score"
              orientation="right"
              domain={[-5, 5]}
              tick={{ fontSize: 12, fill: "#6b7280" }}
              label={{
                value: "Score",
                angle: 90,
                position: "insideRight",
                style: { fontSize: 11, fill: "#9ca3af" },
              }}
            />
          )}
          <Tooltip
            isAnimationActive={false}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              fontSize: 13,
            }}
            formatter={(value: unknown, name: unknown) => [
              String(value),
              SERIES_LABELS[String(name)] ?? String(name),
            ]}
            labelFormatter={(label: unknown) => formatDate(String(label))}
          />
          <Legend
            formatter={(value: string) => SERIES_LABELS[value] ?? value}
          />
          <Bar
            yAxisId="count"
            dataKey="count"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
            barSize={30}
          />
          {showSentiment && (
            <Line
              yAxisId="score"
              type="monotone"
              dataKey="avg_sentiment"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 4, fill: "#10b981" }}
              isAnimationActive={false}
            />
          )}
          {showUrgency && (
            <Line
              yAxisId="score"
              type="monotone"
              dataKey="avg_urgency"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 4, fill: "#ef4444" }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
