import { getOpenAIClient } from "../openai/client";
import { createServiceClient } from "../supabase/server";

const BATCH_SIZE = 100;
const DEFAULT_LIMIT = 200;
const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Processes pending client messages by generating embeddings via OpenAI.
 * Works across all workspaces in a single batch (no workspace scoping).
 *
 * @param limit - Maximum number of pending messages to process (default 200)
 * @returns Number of successfully embedded messages
 */
export async function embedPendingMessages(limit?: number): Promise<number> {
  const supabase = createServiceClient();
  const openai = getOpenAIClient();
  const maxMessages = limit ?? DEFAULT_LIMIT;

  // Query pending client messages
  const { data: pendingMessages, error: queryError } = await supabase
    .from("messages")
    .select("id, content")
    .eq("sender_type", "client")
    .eq("embedding_status", "pending")
    .not("content", "is", null)
    .limit(maxMessages);

  if (queryError) {
    console.error("[embedder] Failed to query pending messages:", queryError.message);
    return 0;
  }

  if (!pendingMessages || pendingMessages.length === 0) {
    return 0;
  }

  let totalEmbedded = 0;

  // Process in chunks of BATCH_SIZE
  for (let i = 0; i < pendingMessages.length; i += BATCH_SIZE) {
    const chunk = pendingMessages.slice(i, i + BATCH_SIZE);
    const texts = chunk.map((m) => m.content as string);

    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
      });

      // Update each message with its embedding
      for (let j = 0; j < chunk.length; j++) {
        const message = chunk[j];
        const embedding = response.data[j].embedding;

        const { error: updateError } = await supabase
          .from("messages")
          .update({
            embedding: JSON.stringify(embedding),
            embedding_status: "done",
            embedding_model: EMBEDDING_MODEL,
          })
          .eq("id", message.id);

        if (updateError) {
          console.error(
            `[embedder] Failed to update message ${message.id}:`,
            updateError.message
          );
        } else {
          totalEmbedded++;
        }
      }
    } catch (err) {
      // On OpenAI error for this chunk, mark all messages as error and continue
      console.error(
        `[embedder] OpenAI error for chunk starting at index ${i}:`,
        err instanceof Error ? err.message : err
      );

      for (const message of chunk) {
        await supabase
          .from("messages")
          .update({ embedding_status: "error" })
          .eq("id", message.id);
      }
    }
  }

  return totalEmbedded;
}
