/**
 * Detects the webhook message format from the raw messages array.
 *
 * - Format A (legacy agent): messages alternate [direction_string, message_object, ...]
 *   Detection: first element is a string
 * - Format B (bot): messages are [{ role, content }, ...]
 *   Detection: first element is an object with a 'role' property
 * - Format C (UChat agent): messages are [{ type, text, time, agent_id? }, ...]
 *   Detection: first element is an object with 'type' and 'text' properties (no 'role')
 * - Unknown: empty array or unrecognized structure
 */
export function detectFormat(
  messages: unknown[]
): "format-a" | "format-b" | "format-c" | "unknown" {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "unknown";
  }

  const first = messages[0];

  // Format A: first element is a direction string ("Sent" or "")
  if (typeof first === "string") {
    return "format-a";
  }

  if (typeof first === "object" && first !== null) {
    // Format B: first element has a 'role' property (OpenAI-style)
    if ("role" in first) {
      return "format-b";
    }

    // Format C: first element has 'type' and 'text' properties (UChat agent format)
    if ("type" in first && "text" in first) {
      return "format-c";
    }
  }

  return "unknown";
}
