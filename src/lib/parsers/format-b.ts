import type { NormalizedMessage } from "@/types/database";
import { formatBMessageSchema } from "./schemas";

/**
 * Parses Format B messages (bot conversations).
 *
 * Format B is an array of { role: "user" | "assistant", content: string } objects.
 * - "user" -> sender_type = 'client'
 * - "assistant" -> sender_type = 'bot'
 *
 * Timestamps are null for all Format B messages (no per-message timestamps).
 * Agent ID is always null (bot conversations have no agent).
 */
export function parseFormatB(messages: unknown[]): {
  normalized: NormalizedMessage[];
  agentId: null;
} {
  const normalized: NormalizedMessage[] = [];
  let sequence = 0;

  for (let i = 0; i < messages.length; i++) {
    const result = formatBMessageSchema.safeParse(messages[i]);
    if (!result.success) {
      console.warn(
        `[parseFormatB] Skipping message at index ${i}: validation failed.`,
        result.error.issues
      );
      continue;
    }

    const msg = result.data;

    // Map role to sender_type
    const senderType = msg.role === "user" ? "client" : "bot";

    normalized.push({
      sender_type: senderType,
      content: msg.content,
      timestamp: null,
      sequence: sequence,
      msg_type: "text",
    });

    sequence++;
  }

  return { normalized, agentId: null };
}
