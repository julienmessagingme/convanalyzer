"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface TrendDataPoint {
  date: string;
  conversations: number;
  failures: number;
  tauxEchec: number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
}

export function TrendChart({ data }: TrendChartProps) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            fontSize={12}
            tick={{ fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
          />
          <YAxis
            fontSize={12}
            tick={{ fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "13px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="line"
            wrapperStyle={{ fontSize: "13px" }}
          />
          <Line
            type="monotone"
            dataKey="conversations"
            name="Conversations"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="failures"
            name="Echecs"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
