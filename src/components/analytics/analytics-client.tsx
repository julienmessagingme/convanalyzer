"use client";

import { useEffect, useState } from "react";
import { AnalyticsDashboard } from "./analytics-dashboard";
import type { Tag } from "@/types/database";

interface AnalyticsClientProps {
  workspaceId: string;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ""}`} />
  );
}

export function AnalyticsClient({ workspaceId }: AnalyticsClientProps) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const [tags, setTags] = useState<Tag[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ workspace_id: workspaceId });
    fetch(`${basePath}/api/dashboard/tags?${params}`)
      .then((r) => r.json())
      .then((json) => {
        setTags(json.tags ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [basePath, workspaceId]);

  if (loading || !tags) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Analytics</h2>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Analytics</h2>
      <AnalyticsDashboard workspaceId={workspaceId} tags={tags} />
    </div>
  );
}
