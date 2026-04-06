import { createServiceClient } from "@/lib/supabase/server";
import { searchConversations } from "@/lib/supabase/search";
import { SearchBar } from "@/components/search/search-bar";
import { SearchGroupStats } from "@/components/search/search-group-stats";
import { ConversationTabs } from "@/components/conversations/conversation-tabs";
import { ConversationList } from "@/components/conversations/conversation-list";
import { EmptyState } from "@/components/ui/empty-state";
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
  const { workspaceId } = await params;
  const filters = await searchParams;

  const query = typeof filters.q === "string" ? filters.q.trim() : "";
  const tab =
    typeof filters.tab === "string" && filters.tab === "agent"
      ? "agent"
      : "bot";

  // Fetch available tags for ConversationCard quick-assign
  const supabase = createServiceClient();
  const { data: tagsData } = await supabase
    .from("tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("conversation_count", { ascending: false });

  const allTags = (tagsData as Tag[]) ?? [];

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

  // Run search
  const result = await searchConversations(workspaceId, query);

  // Get conversations for active tab
  const activeGroup = result.groups[tab];
  const conversations = activeGroup.conversations.map((m) => m.conversation);

  // Build tagMap from search results
  const tagMap: Record<string, { id: string; label: string }[]> = {};
  for (const match of activeGroup.conversations) {
    if (match.tags.length > 0) {
      tagMap[match.conversation.id] = match.tags;
    }
  }

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

      {/* Match type badges + conversation list */}
      {conversations.length > 0 ? (
        <div className="space-y-2">
          {/* Match indicators */}
          <div className="flex gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Texte exact
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              Similarite semantique
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Les deux
            </span>
          </div>
          <ConversationList
            conversations={conversations}
            tagMap={tagMap}
            workspaceId={workspaceId}
            availableTags={allTags}
          />
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
