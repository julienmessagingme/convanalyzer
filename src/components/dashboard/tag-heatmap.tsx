"use client";

import { useMemo, useState } from "react";
import { DensityHeatmap } from "./density-heatmap";

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

interface TagHeatmapProps {
  conversations: ScatterConversation[];
  workspaceId: string;
  tags: TagOption[];
}

export function TagHeatmap({
  conversations,
  workspaceId,
  tags,
}: TagHeatmapProps) {
  // Compute tag counts once so pills can show them and we can pick a sensible default
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of conversations) {
      if (!c.tags) continue;
      for (const t of c.tags) {
        map.set(t.id, (map.get(t.id) ?? 0) + 1);
      }
    }
    return map;
  }, [conversations]);

  const tagsWithCounts = useMemo(
    () =>
      tags
        .map((t) => ({ ...t, count: tagCounts.get(t.id) ?? 0 }))
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count),
    [tags, tagCounts]
  );

  const [selectedTagId, setSelectedTagId] = useState<string>(
    () => tagsWithCounts[0]?.id ?? ""
  );

  const filteredConversations = useMemo(() => {
    if (!selectedTagId) return [];
    return conversations.filter((c) =>
      c.tags?.some((t) => t.id === selectedTagId)
    );
  }, [conversations, selectedTagId]);

  if (tagsWithCounts.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-500">
        Creez des tags et lancez le pipeline pour voir la matrice par theme.
      </div>
    );
  }

  return (
    <div>
      {/* Tag selector pills */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Theme :</span>
        {tagsWithCounts.map((tag) => (
          <button
            key={tag.id}
            onClick={() => setSelectedTagId(tag.id)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              selectedTagId === tag.id
                ? "bg-blue-600 text-white"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100"
            }`}
          >
            {tag.label} ({tag.count})
          </button>
        ))}
      </div>

      {selectedTagId ? (
        <DensityHeatmap
          conversations={filteredConversations}
          workspaceId={workspaceId}
          forcedTagId={selectedTagId}
        />
      ) : (
        <div className="flex items-center justify-center h-40 text-sm text-gray-500">
          Selectionnez un theme pour voir la heatmap.
        </div>
      )}
    </div>
  );
}
