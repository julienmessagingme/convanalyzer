"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { Tag } from "@/types/database";

interface FilterBarProps {
  tags: Tag[];
  currentFilters: Record<string, string>;
  activeTab?: "bot" | "agent";
}

export function FilterBar({ tags, currentFilters, activeTab }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [localQuery, setLocalQuery] = useState<string>(currentFilters.q ?? "");

  // Keep local query in sync with URL when navigating
  useEffect(() => {
    setLocalQuery(currentFilters.q ?? "");
  }, [currentFilters.q]);

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // Reset to page 1 on filter change
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, searchParams, pathname]
  );

  const submitQuery = useCallback(() => {
    const trimmed = localQuery.trim();
    const current = currentFilters.q ?? "";
    if (trimmed === current) return;
    updateFilter("q", trimmed);
  }, [localQuery, currentFilters.q, updateFilter]);

  const hasQuery = (currentFilters.q ?? "").trim().length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex gap-3 items-center flex-wrap">
        {/* Keyword search */}
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              placeholder="Rechercher (mot-cle)..."
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitQuery();
                }
              }}
              onBlur={submitQuery}
              className="w-full border border-gray-300 rounded-md pl-8 pr-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {hasQuery && (
            <select
              value={currentFilters.mode ?? "combined"}
              onChange={(e) => updateFilter("mode", e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="combined">Combine</option>
              <option value="text">Texte</option>
              <option value="semantic">Semantique</option>
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="date_from" className="text-sm text-gray-600">
            Du
          </label>
          <input
            id="date_from"
            type="date"
            value={currentFilters.date_from ?? ""}
            onChange={(e) => updateFilter("date_from", e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="date_to" className="text-sm text-gray-600">
            Au
          </label>
          <input
            id="date_to"
            type="date"
            value={currentFilters.date_to ?? ""}
            onChange={(e) => updateFilter("date_to", e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <select
          value={currentFilters.sentiment ?? ""}
          onChange={(e) => updateFilter("sentiment", e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Tout sentiment</option>
          <option value="negative">Frustre (-5 a -1)</option>
          <option value="neutral">Neutre (0)</option>
          <option value="positive">Satisfait (+1 a +5)</option>
        </select>

        <select
          value={currentFilters.urgency ?? ""}
          onChange={(e) => updateFilter("urgency", e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Toute urgence</option>
          <option value="low">Faible (0-2)</option>
          <option value="high">Critique (3-5)</option>
        </select>

        {activeTab === "bot" && (
          <select
            value={currentFilters.escalated ?? ""}
            onChange={(e) => updateFilter("escalated", e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Tout transfert</option>
            <option value="yes">Transferees a un humain</option>
            <option value="no">Non transferees</option>
          </select>
        )}

        <select
          value={currentFilters.tag ?? ""}
          onChange={(e) => updateFilter("tag", e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Tous les tags</option>
          <option value="untagged">Non attribue</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
