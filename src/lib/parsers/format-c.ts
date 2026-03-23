import type { NormalizedMessage } from "@/types/database";

/**
 * Parses Format C messages (real UChat agent conversations).
 *
 * Format C is a flat array of message objects:
 * - If object has `agent_id` => agent (human) message
 * - If object has no `agent_id` => client message
 *
 * Each object has: { type, time, text, url?, caption?, agent_id? }
 * Time can be a unix timestamp (number) or ISO string.
 */
export function parseFormatC(messages: unknown[]): {
  normalized: NormalizedMessage[];
  agentId: number | null;
} {
  const normalized: NormalizedMessage[] = [];
  const agentIds: number[] = [];

  let sequence = 0;

  for (let i = 0; i < messages.length; i++) {
    const raw = messages[i];

    if (typeof raw !== "object" || raw === null) {
      console.warn(
        `[parseFormatC] Skipping index ${i}: not an object.`
      );
      continue;
    }

    const msg = raw as Record<string, unknown>;

    // Determine sender type: agent_id present = agent, otherwise client
    const hasAgentId =
      msg.agent_id !== undefined && msg.agent_id !== null;
    const senderType = hasAgentId ? "agent" : "client";

    // Extract text content
    let content =
      typeof msg.text === "string" ? msg.text : "";
    if (
      msg.type !== "text" &&
      !content &&
      typeof msg.url === "string" &&
      msg.url
    ) {
      content = "[media]";
    }

    // Parse time: can be unix timestamp (number) or ISO string
    let timestamp: string | null = null;
    if (typeof msg.time === "number") {
      timestamp = new Date(msg.time * 1000).toISOString();
    } else if (typeof msg.time === "string") {
      timestamp = msg.time;
    }

    // Collect agent_id
    if (hasAgentId && typeof msg.agent_id === "number") {
      agentIds.push(msg.agent_id);
    }

    normalized.push({
      sender_type: senderType,
      content: content,
      timestamp: timestamp,
      sequence: sequence,
      msg_type:
        typeof msg.type === "string" ? msg.type : "text",
      agent_id: hasAgentId
        ? (msg.agent_id as number)
        : undefined,
    });

    sequence++;
  }

  // Extract dominant agent_id (most frequent)
  const agentId = getDominantAgentId(agentIds);

  return { normalized, agentId };
}

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
