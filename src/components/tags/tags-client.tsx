"use client";

import { useEffect, useState } from "react";
import { TagManager } from "./tag-manager";
import type { Tag, SuggestedTag } from "@/types/database";

interface TagsClientProps {
  workspaceId: string;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ""}`} />
  );
}

export function TagsClient({ workspaceId }: TagsClientProps) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const [tags, setTags] = useState<Tag[] | null>(null);
  const [suggested, setSuggested] = useState<SuggestedTag[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ workspace_id: workspaceId });
    fetch(`${basePath}/api/tags/list?${params}`)
      .then((r) => r.json())
      .then((json) => {
        setTags(json.tags ?? []);
        setSuggested(json.suggestedTags ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [basePath, workspaceId]);

  if (loading || !tags || !suggested) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Tags</h1>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Tags</h1>
      <TagManager
        workspaceId={workspaceId}
        initialHumanTags={tags}
        initialSuggestedTags={suggested}
      />
    </div>
  );
}
