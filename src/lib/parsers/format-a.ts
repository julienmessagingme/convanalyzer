import type { NormalizedMessage } from "@/types/database";
import { formatAMessageObjectSchema } from "./schemas";

/**
 * Parses Format A messages (agent conversations).
 *
 * Format A is an array of alternating [direction, messageObject] pairs:
 * - "Sent" + object = agent sent this message (sender_type = 'agent')
 * - "" + object = client sent this message (sender_type = 'client')
 *
 * Returns normalized messages and the dominant agent_id.
 */
export function parseFormatA(messages: unknown[]): {
  normalized: NormalizedMessage[];
  agentId: number | null;
} {
  const normalized: NormalizedMessage[] = [];
  const agentIds: number[] = [];

  // Warn if array length is odd -- last element will be ignored
  if (messages.length % 2 !== 0) {
    console.warn(
      `[parseFormatA] Odd-length messages array (${messages.length}). Last element will be ignored.`
    );
  }

  let sequence = 0;

  for (let i = 0; i + 1 < messages.length; i += 2) {
    const direction = messages[i];
    const rawObj = messages[i + 1];

    // Direction must be a string
    if (typeof direction !== "string") {
      console.warn(
        `[parseFormatA] Skipping pair at index ${i}: direction is not a string.`
      );
      continue;
    }

    // Validate message object with Zod (safeParse -- tolerant)
    const result = formatAMessageObjectSchema.safeParse(rawObj);
    if (!result.success) {
      console.warn(
        `[parseFormatA] Skipping pair at index ${i}: message object validation failed.`,
        result.error.issues
      );
      continue;
    }

    const msgObj = result.data;

    // Determine sender type from direction
    const senderType = direction === "Sent" ? "agent" : "client";

    // Determine content: use text field, or '[media]' for non-text types with empty text
    let content = msgObj.text;
    if (msgObj.type !== "text" && !content) {
      content = "[media]";
    }

    // Collect agent_id if present
    if (msgObj.agent_id !== undefined && msgObj.agent_id !== null) {
      agentIds.push(msgObj.agent_id);
    }

    normalized.push({
      sender_type: senderType,
      content: content,
      timestamp: msgObj.time ?? null,
      sequence: sequence,
      msg_type: msgObj.type,
      agent_id: msgObj.agent_id,
    });

    sequence++;
  }

  // Extract dominant agent_id (most frequent)
  const agentId = getDominantAgentId(agentIds);

  return { normalized, agentId };
}

/**
 * Returns the most frequent agent_id from the list, or null if empty.
 */
function getDominantAgentId(agentIds: number[]): number | null {
  if (agentIds.length === 0) return null;

  const counts = new Map<number, number>();
  for (const id of agentIds) {
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  let dominant: number | null = null;
  let maxCount = 0;
  counts.forEach((count, id) => {
    if (count > maxCount) {
      maxCount = count;
      dominant = id;
    }
  });

  return dominant;
}
