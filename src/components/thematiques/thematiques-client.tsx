"use client";

import { useEffect, useState } from "react";
import { Smile, AlertTriangle } from "lucide-react";
import { LevelCard } from "./level-card";

interface TagDistribution {
  id: string;
  label: string;
  count: number;
  percentage: number;
}

interface LevelBucket {
  level: number;
  total: number;
  tags: TagDistribution[];
}

interface ThematiquesData {
  buckets: LevelBucket[];
  totalScored: number;
  axis: "sentiment" | "urgency";
}

interface ThematiquesClientProps {
  workspaceId: string;
  initialAxis: "sentiment" | "urgency";
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ""}`} />
  );
}

export function ThematiquesClient({
  workspaceId,
  initialAxis,
}: ThematiquesClientProps) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const [axis, setAxis] = useState<"sentiment" | "urgency">(initialAxis);
  const [data, setData] = useState<ThematiquesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({
      workspace_id: workspaceId,
      axis,
    });
    fetch(`${basePath}/api/thematiques?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [basePath, workspaceId, axis]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (axis !== "sentiment") params.set("axis", axis);
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [axis]);

  const tabs = [
    { key: "sentiment" as const, label: "Par sentiment", icon: Smile },
    { key: "urgency" as const, label: "Par urgence", icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Thematiques</h1>
        <p className="text-sm text-gray-500 mt-1">
          Distribution des themes par niveau de{" "}
          {axis === "sentiment" ? "sentiment" : "urgence"}.{" "}
          {data?.totalScored ?? "..."} conversations analysees.
        </p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-0" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = axis === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setAxis(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="rounded-md bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-900">
        Les pourcentages indiquent la part des conversations a ce niveau
        marquees avec le theme. Les barres ne somment pas a 100% car certaines
        conversations n&apos;ont pas de tag et une conversation peut avoir
        jusqu&apos;a 2 tags.
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data?.buckets ?? []).map((bucket) => (
            <LevelCard
              key={bucket.level}
              level={bucket.level}
              total={bucket.total}
              tags={bucket.tags}
              axis={axis}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
