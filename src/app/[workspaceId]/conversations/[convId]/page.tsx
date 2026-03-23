import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, User } from "lucide-react";
import { format, parseISO } from "date-fns";
import { getConversationWithMessages } from "@/lib/supabase/queries";
import { createServiceClient } from "@/lib/supabase/server";
import { getScoreLevel, scoreColors, formatScore } from "@/lib/utils/scores";
import { MessageBubble } from "@/components/conversations/message-bubble";
import { ExportPdfButton } from "@/components/export/export-pdf-button";
import { TagAssignment } from "@/components/conversations/tag-assignment";
import { EmptyState } from "@/components/ui/empty-state";
import type { Conversation, Message, Tag } from "@/types/database";

interface ConversationDetailPageProps {
  params: Promise<{ workspaceId: string; convId: string }>;
}

export default async function ConversationDetailPage({
  params,
}: ConversationDetailPageProps) {
  const { workspaceId, convId } = await params;

  const result = await getConversationWithMessages(workspaceId, convId);
  if (!result) {
    notFound();
  }

  const conversation = result.conversation as Conversation;
  const messages = result.messages as Message[];

  // Get tags for this conversation
  const supabase = createServiceClient();

  const { data: convTagRows } = await supabase
    .from("conversation_tags")
    .select("tag_id, assigned_by")
    .eq("conversation_id", convId);

  // Fetch all tags for this workspace (needed for assignment dropdown and label lookup)
  const { data: allTagsData } = await supabase
    .from("tags")
    .select("*")
    .eq("workspace_id", workspaceId);

  const allTags = (allTagsData as Tag[]) ?? [];
  const tagLookup = new Map<string, Tag>();
  for (const t of allTags) {
    tagLookup.set(t.id, t);
  }

  // Build current tags for display
  const convTags: { tag_id: string; label: string; assigned_by: "ai" | "human" }[] = [];
  const tagLabels: string[] = [];
  if (convTagRows) {
    for (const ct of convTagRows) {
      const tag = tagLookup.get(ct.tag_id);
      if (tag) {
        convTags.push({
          tag_id: tag.id,
          label: tag.label,
          assigned_by: ct.assigned_by as "ai" | "human",
        });
        tagLabels.push(tag.label);
      }
    }
  }

  // Extract failure reasons from messages with failure_signal set
  const failureReasons = messages
    .filter((m) => m.failure_signal)
    .map((m) => m.failure_reason || m.failure_signal || "")
    .filter(Boolean);

  const level = getScoreLevel(conversation.failure_score);
  const colors = scoreColors[level];
  const TypeIcon = conversation.type === "bot" ? Bot : User;
  const typeLabel = conversation.type === "bot" ? "Bot" : "Agent";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/${workspaceId}/conversations`}
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux conversations
      </Link>

      {/* Conversation header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Global failure score */}
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${colors.bg} ${colors.text}`}
          >
            <span className={`h-3 w-3 rounded-full ${colors.dot}`} />
            Score: {formatScore(conversation.failure_score)}
          </div>

          {/* Type */}
          <div className="flex items-center gap-1.5 text-sm text-gray-700">
            <TypeIcon className="h-4 w-4" />
            <span>{typeLabel}</span>
          </div>

          {/* Date range */}
          <div className="text-sm text-gray-500">
            {conversation.started_at
              ? format(
                  parseISO(conversation.started_at),
                  "dd MMM yyyy HH:mm"
                )
              : "Date inconnue"}
            {conversation.ended_at &&
              ` - ${format(parseISO(conversation.ended_at), "HH:mm")}`}
          </div>

          {/* Message count */}
          <div className="text-sm text-gray-500">
            {conversation.message_count} messages
          </div>

          {/* Scoring status */}
          {conversation.scoring_status &&
            conversation.scoring_status !== "scored" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700">
                {conversation.scoring_status}
              </span>
            )}

          {/* Tag pills in header */}
          {convTags.map((tag) => (
            <span
              key={tag.tag_id}
              className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700"
            >
              {tag.label}
            </span>
          ))}

          {/* Export PDF */}
          <div className="ml-auto">
            <ExportPdfButton
              variant="conversation"
              convId={convId}
              data={{
                conversation,
                tags: tagLabels,
                failureReasons,
              }}
            />
          </div>
        </div>
      </div>

      {/* Tag assignment */}
      <TagAssignment
        conversationId={convId}
        initialTags={convTags}
        availableTags={allTags}
      />

      {/* Message thread */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {messages.length === 0 ? (
          <EmptyState
            title="Aucun message"
            description="Cette conversation ne contient pas de messages."
          />
        ) : (
          <div className="space-y-1">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isBot={message.sender_type !== "client"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
