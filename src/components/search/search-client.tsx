"use client";

import { useCallback, useEffect, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { ConversationTabs } from "@/components/conversations/conversation-tabs";
import { ConversationCard } from "@/components/conversations/conversation-card";
import { SearchGroupStats } from "@/components/search/search-group-stats";
import { EmptyState } from "@/components/ui/empty-state";
import type { SearchResult, SearchGroup } from "@/lib/supabase/search";
import type { Tag } from "@/types/database";

type SearchMode = "combined" | "text" | "semantic";

interface SearchClientProps {
  workspaceId: string;
  initialQuery: string;
  initialMode: SearchMode;
  initialTab: "bot" | "agent";
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ""}`} />
  );
}

export function SearchClient({
  workspaceId,
  initialQuery,
  initialMode,
  initialTab,
}: SearchClientProps) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  // Search form state
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const [tab, setTab] = useState<"bot" | "agent">(initialTab);

  // Submitted search (drives the fetch)
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [submittedMode, setSubmittedMode] = useState<SearchMode>(initialMode);

  // Data
  const [result, setResult] = useState<SearchResult | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(!!initialQuery);

  // Fetch on submitted query change
  useEffect(() => {
    if (!submittedQuery) {
      setResult(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({
      workspace_id: workspaceId,
      q: submittedQuery,
      mode: submittedMode,
    });

    fetch(`${basePath}/api/search?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          setResult(json.result ?? null);
          setAllTags(json.allTags ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [basePath, workspaceId, submittedQuery, submittedMode]);

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams();
    if (submittedQuery) {
      params.set("q", submittedQuery);
      params.set("mode", submittedMode);
    }
    if (tab !== "bot") params.set("tab", tab);
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [submittedQuery, submittedMode, tab]);

  // Handlers
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;
      setSubmittedQuery(trimmed);
      setSubmittedMode(mode);
      setTab("bot");
    },
    [query, mode]
  );

  const handleTabChange = useCallback((newTab: "bot" | "agent") => {
    setTab(newTab);
  }, []);

  // Active group
  const activeGroup: SearchGroup | null = result
    ? result.groups[tab]
    : null;

  // No query — empty state
  if (!submittedQuery && !loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Recherche thematique
        </h1>
        <SearchForm
          query={query}
          mode={mode}
          onQueryChange={setQuery}
          onModeChange={setMode}
          onSubmit={handleSubmit}
        />
        <EmptyState
          title="Rechercher un theme"
          description="Tapez un theme ou une expression pour trouver les conversations correspondantes. La recherche combine texte exact et similarite semantique."
          icon={<SearchIcon className="h-12 w-12" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        Recherche thematique
      </h1>

      <SearchForm
        query={query}
        mode={mode}
        onQueryChange={setQuery}
        onModeChange={setMode}
        onSubmit={handleSubmit}
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-6 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-12" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : result ? (
        <>
          <p className="text-sm text-gray-500">
            {result.totalCount} conversation
            {result.totalCount !== 1 ? "s" : ""} trouvee
            {result.totalCount !== 1 ? "s" : ""} pour{" "}
            <span className="font-medium text-gray-700">
              &laquo;{result.query}&raquo;
            </span>
            {submittedMode !== "combined" && (
              <span className="ml-2 text-xs text-gray-400">
                (mode:{" "}
                {submittedMode === "text" ? "texte exact" : "semantique"})
              </span>
            )}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SearchGroupStats
              label="Conversations IA"
              type="bot"
              group={result.groups.bot}
            />
            <SearchGroupStats
              label="Conversations humain"
              type="agent"
              group={result.groups.agent}
            />
          </div>

          <ConversationTabs
            activeTab={tab}
            botCount={result.groups.bot.count}
            agentCount={result.groups.agent.count}
            onTabChange={handleTabChange}
          />

          {activeGroup && activeGroup.conversations.length > 0 ? (
            <div className="flex flex-col gap-3">
              {activeGroup.conversations.map((match) => (
                <ConversationCard
                  key={match.conversation.id}
                  conversation={match.conversation}
                  workspaceId={workspaceId}
                  tags={match.tags}
                  availableTags={allTags}
                  matchType={match.matchType}
                  matchedSnippet={match.matchedSnippet}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Aucune conversation dans cette categorie"
              description="Essayez l'autre onglet ou modifiez votre recherche."
            />
          )}
        </>
      ) : null}
    </div>
  );
}

/** Inline search form (extracted for reuse in both states) */
function SearchForm({
  query,
  mode,
  onQueryChange,
  onModeChange,
  onSubmit,
}: {
  query: string;
  mode: SearchMode;
  onQueryChange: (q: string) => void;
  onModeChange: (m: SearchMode) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Rechercher un theme (ex: accident non responsable)"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Rechercher
        </button>
      </form>
      <div className="flex items-center gap-4">
        <span className="text-xs text-gray-500 font-medium">Mode :</span>
        {(
          [
            { value: "combined", label: "Combine" },
            { value: "text", label: "Texte exact" },
            { value: "semantic", label: "Semantique" },
          ] as const
        ).map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <input
              type="radio"
              name="search-mode"
              value={opt.value}
              checked={mode === opt.value}
              onChange={() => onModeChange(opt.value)}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span
              className={`text-sm ${
                mode === opt.value
                  ? "text-gray-900 font-medium"
                  : "text-gray-600"
              }`}
            >
              {opt.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
