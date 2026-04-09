import type { Conversation, Tag } from "@/types/database";
import { ConversationCard } from "./conversation-card";
import { EmptyState } from "@/components/ui/empty-state";

interface ConversationListProps {
  conversations: Conversation[];
  tagMap: Record<string, { id?: string; label: string }[]>;
  workspaceId: string;
  availableTags?: Tag[];
}

export function ConversationList({
  conversations,
  tagMap,
  workspaceId,
  availableTags = [],
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <EmptyState
        title="Aucune conversation trouvee"
        description="Ajustez vos filtres ou attendez que de nouvelles conversations soient analysees."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {conversations.map((conversation) => (
        <ConversationCard
          key={conversation.id}
          conversation={conversation}
          workspaceId={workspaceId}
          tags={tagMap[conversation.id]}
          availableTags={availableTags}
        />
      ))}
    </div>
  );
}
