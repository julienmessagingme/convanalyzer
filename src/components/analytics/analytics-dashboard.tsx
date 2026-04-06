"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
import type { Tag } from "@/types/database";

interface AnalyticsDashboardProps {
  workspaceId: string;
  tags: Tag[];
}

interface DataPoint {
  date: string;
  count: number;
  avg_sentiment?: number;
  avg_urgency?: number;
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function AnalyticsDashboard({
  workspaceId,
  tags,
}: AnalyticsDashboardProps) {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showSentiment, setShowSentiment] = useState(false);
  const [showUrgency, setShowUrgency] = useState(false);
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragOverDrop, setDragOverDrop] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Available tags = all tags minus already selected
  const availableTags = tags.filter((t) => !selectedTagIds.includes(t.id));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("workspace_id", workspaceId);
      if (selectedTagIds.length > 0) {
        params.set("tag_ids", selectedTagIds.join(","));
      }
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (showSentiment) params.set("show_sentiment", "1");
      if (showUrgency) params.set("show_urgency", "1");

      const res = await fetch(`${basePath}/api/analytics?${params.toString()}`);
      const json = await res.json();
      setData(json.data ?? []);
    } catch (err) {
      console.error("Analytics fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, selectedTagIds, dateFrom, dateTo, showSentiment, showUrgency]);

  // Auto-fetch on any filter change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, tagId: string) => {
      e.dataTransfer.setData("text/plain", tagId);
      e.dataTransfer.effectAllowed = "copy";
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverDrop(false);
      const tagId = e.dataTransfer.getData("text/plain");
      if (tagId && !selectedTagIds.includes(tagId)) {
        setSelectedTagIds((prev) => [...prev, tagId]);
      }
    },
    [selectedTagIds]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOverDrop(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDrop(false);
  }, []);

  const removeTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) => prev.filter((id) => id !== tagId));
  }, []);

  const tagLabel = (id: string) =>
    tags.find((t) => t.id === id)?.label ?? id;

  // Format date for display
  const formatDate = (d: string) => {
    const parts = d.split("-");
    return `${parts[2]}/${parts[1]}`;
  };

  const totalConversations = data.reduce((s, d) => s + d.count, 0);
  const avgPerDay =
    data.length > 0
      ? Math.round((totalConversations / data.length) * 10) / 10
      : 0;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Au</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-4 ml-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showSentiment}
                onChange={(e) => setShowSentiment(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Sentiment moyen
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showUrgency}
                onChange={(e) => setShowUrgency(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Urgence moyenne
            </label>
          </div>
        </div>
      </div>

      {/* Tags: available (drag source) + drop zone */}
      <div className="grid grid-cols-2 gap-4">
        {/* Available tags */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Tags disponibles
          </h3>
          <div className="flex flex-wrap gap-2 min-h-[40px]">
            {availableTags.length === 0 && (
              <p className="text-sm text-gray-400">Aucun tag disponible</p>
            )}
            {availableTags.map((tag) => (
              <span
                key={tag.id}
                draggable
                onDragStart={(e) => handleDragStart(e, tag.id)}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm cursor-grab active:cursor-grabbing hover:bg-gray-200 transition-colors select-none"
              >
                {tag.label}
              </span>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`bg-white rounded-lg border-2 border-dashed p-4 transition-colors ${
            dragOverDrop
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300"
          }`}
        >
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Filtrer par tags (condition ET)
          </h3>
          <div className="flex flex-wrap gap-2 min-h-[40px]">
            {selectedTagIds.length === 0 && (
              <p className="text-sm text-gray-400">
                Glissez des tags ici pour filtrer
              </p>
            )}
            {selectedTagIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm"
              >
                {tagLabel(id)}
                <button
                  onClick={() => removeTag(id)}
                  className="ml-1 text-blue-600 hover:text-blue-900 font-bold"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="flex gap-4">
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">Total conversations</p>
          <p className="text-2xl font-bold text-gray-900">{totalConversations}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">Moyenne / jour</p>
          <p className="text-2xl font-bold text-gray-900">{avgPerDay}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">Jours avec donnees</p>
          <p className="text-2xl font-bold text-gray-900">{data.length}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Conversations par jour
          {selectedTagIds.length > 0 && (
            <span className="text-gray-400 font-normal ml-2">
              ({selectedTagIds.map((id) => tagLabel(id)).join(" + ")})
            </span>
          )}
        </h3>

        {loading ? (
          <div className="flex items-center justify-center h-80">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-80 text-gray-400">
            Aucune donnee pour cette selection
          </div>
        ) : (
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
                  formatter={(value: unknown, name: unknown) => {
                    const labels: Record<string, string> = {
                      count: "Conversations",
                      avg_sentiment: "Sentiment moy.",
                      avg_urgency: "Urgence moy.",
                    };
                    return [String(value), labels[String(name)] ?? String(name)];
                  }}
                  labelFormatter={(label: unknown) => formatDate(String(label))}
                />
                <Legend
                  formatter={(value: string) => {
                    const labels: Record<string, string> = {
                      count: "Conversations",
                      avg_sentiment: "Sentiment moy.",
                      avg_urgency: "Urgence moy.",
                    };
                    return labels[value] ?? value;
                  }}
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
        )}
      </div>
    </div>
  );
}
