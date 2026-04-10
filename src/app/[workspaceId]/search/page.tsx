import { createServiceClient } from "@/lib/supabase/server";
import { searchConversations } from "@/lib/supabase/search";
import { SearchBar } from "@/components/search/search-bar";
import { SearchGroupStats } from "@/components/search/search-group-stats";
import { ConversationTabs } from "@/components/conversations/conversation-tabs";
import { ConversationCard } from "@/components/conversations/conversation-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ForbiddenPage } from "@/components/ui/forbidden-page";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import { Search } from "lucide-react";
import type { Tag } from "@/types/database";

interface SearchPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({
  params,
  searchParams,
}: SearchPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId } = await params;
  const filters = await searchParams;

  const query = typeof filters.q === "string" ? filters.q.trim() : "";
  const mode = typeof filters.mode === "string" && ["text", "semantic", "combined"].includes(filters.mode)
    ? (filters.mode as "text" | "semantic" | "combined")
    : "combined";
  const tab =
    typeof filters.tab === "string" && filters.tab === "agent"
      ? "agent"
      : "bot";

  // No query yet — show empty state
  if (!query) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Recherche thematique
        </h1>
        <SearchBar />
        <EmptyState
          title="Rechercher un theme"
          description="Tapez un theme ou une expression pour trouver les conversations correspondantes. La recherche combine texte exact et similarite semantique."
          icon={<Search className="h-12 w-12" />}
        />
      </div>
    );
  }

  // Fetch available tags for ConversationCard quick-assign
  const supabase = createServiceClient();
  const { data: tagsData } = await supabase
    .from("tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("conversation_count", { ascending: false });

  const allTags = (tagsData as Tag[]) ?? [];

  // Run search with mode
  const result = await searchConversations(workspaceId, query, mode);

  // Get matches for active tab
  const activeGroup = result.groups[tab];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        Recherche thematique
      </h1>

      <SearchBar />

      <p className="text-sm text-gray-500">
        {result.totalCount} conversation{result.totalCount !== 1 ? "s" : ""}{" "}
        trouvee{result.totalCount !== 1 ? "s" : ""} pour{" "}
        <span className="font-medium text-gray-700">&laquo;{result.query}&raquo;</span>
        {mode !== "combined" && (
          <span className="ml-2 text-xs text-gray-400">
            (mode: {mode === "text" ? "texte exact" : "semantique"})
          </span>
        )}
      </p>

      {/* Stats cards */}
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

      {/* Tabs */}
      <ConversationTabs
        activeTab={tab}
        botCount={result.groups.bot.count}
        agentCount={result.groups.agent.count}
      />

      {/* Conversation list - vertical with match info */}
      {activeGroup.conversations.length > 0 ? (
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
    </div>
  );
}
