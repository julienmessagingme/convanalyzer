// Re-export the NormalizedMessage type for convenience
export type { NormalizedMessage } from "@/types/database";

import type { NormalizedMessage, SenderType } from "@/types/database";

/**
 * Converts a NormalizedMessage to a database message insert row.
 * Maps the canonical parser output to columns matching the messages table.
 */
export function normalizedToMessageRow(
  msg: NormalizedMessage,
  conversationId: string,
  workspaceId: string
): {
  conversation_id: string;
  workspace_id: string;
  sender_type: SenderType;
  agent_id: number | null;
  sent_at: string | null;
  content: string;
  msg_type: string;
  sequence: number;
} {
  return {
    conversation_id: conversationId,
    workspace_id: workspaceId,
    sender_type: msg.sender_type,
    agent_id: msg.agent_id ?? null,
    sent_at: msg.timestamp,
    content: msg.content,
    msg_type: msg.msg_type,
    sequence: msg.sequence,
  };
}
