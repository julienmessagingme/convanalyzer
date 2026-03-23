"use client";

import { useState, useCallback } from "react";
import { Plus, X } from "lucide-react";
import type { Tag } from "@/types/database";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const apiKey = process.env.NEXT_PUBLIC_INTERNAL_API_KEY || "";

interface AssignedTag {
  tag_id: string;
  label: string;
  assigned_by: "ai" | "human";
}

interface TagAssignmentProps {
  conversationId: string;
  initialTags: AssignedTag[];
  availableTags: Tag[];
}

export function TagAssignment({
  conversationId,
  initialTags,
  availableTags,
}: TagAssignmentProps) {
  const [tags, setTags] = useState<AssignedTag[]>(initialTags);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [adding, setAdding] = useState(false);

  const apiHeaders: HeadersInit = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };

  // Tags not yet assigned
  const assignedTagIds = new Set(tags.map((t) => t.tag_id));
  const unassignedTags = availableTags.filter(
    (t) => !assignedTagIds.has(t.id)
  );

  const handleAdd = useCallback(async () => {
    if (!selectedTagId) return;
    setAdding(true);
    try {
      const res = await fetch(
        `${basePath}/api/conversations/${conversationId}/tags`,
        {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({ tag_id: selectedTagId }),
        }
      );
      if (res.ok) {
        const tag = availableTags.find((t) => t.id === selectedTagId);
        if (tag) {
          setTags((prev) => [
            ...prev,
            {
              tag_id: tag.id,
              label: tag.label,
              assigned_by: "human",
            },
          ]);
        }
        setSelectedTagId("");
      }
    } finally {
      setAdding(false);
    }
  }, [selectedTagId, conversationId, availableTags]);

  const handleRemove = useCallback(
    async (tagId: string) => {
      const res = await fetch(
        `${basePath}/api/conversations/${conversationId}/tags`,
        {
          method: "DELETE",
          headers: apiHeaders,
          body: JSON.stringify({ tag_id: tagId }),
        }
      );
      if (res.ok) {
        setTags((prev) => prev.filter((t) => t.tag_id !== tagId));
      }
    },
    [conversationId]
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Tags</h2>

      {/* Current tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tags.length === 0 && (
          <p className="text-sm text-gray-500">Aucun tag assigne.</p>
        )}
        {tags.map((tag) => (
          <span
            key={tag.tag_id}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-green-100 text-green-700"
          >
            {tag.label}
            {tag.assigned_by === "human" && (
              <button
                onClick={() => handleRemove(tag.tag_id)}
                className="ml-1 p-0.5 rounded-full hover:bg-black/10 transition-colors"
                title="Retirer ce tag"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>

      {/* Add tag */}
      {unassignedTags.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selectedTagId}
            onChange={(e) => setSelectedTagId(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Ajouter un tag...</option>
            {unassignedTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={adding || !selectedTagId}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </button>
        </div>
      )}
    </div>
  );
}
