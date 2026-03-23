import { z } from "zod/v3";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient } from "../openai/client";
import { createServiceClient } from "../supabase/server";

const LLM_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT =
  "Tu analyses des conversations echouees d'un chatbot IA en francais. A partir des exemples fournis, identifie une lacune dans la base de connaissances et suggere un contenu a ajouter. Reponds en JSON selon le schema fourni.";

const SuggestionResult = z.object({
  question: z.string(),
  suggested_answer: z.string(),
  impact_score: z.number(),
});

const MIN_CLUSTER_SIZE = 3;

/**
 * Generates KB improvement suggestions from failed/ambiguous conversation clusters.
 * Groups conversations by topic, sends representative Q&A pairs to GPT-4o-mini,
 * and stores structured suggestions.
 *
 * Full-refresh strategy: deletes existing suggestions before inserting new ones.
 * Per-cluster error isolation: single OpenAI failure does not abort remaining clusters.
 *
 * @param workspaceId - The workspace to generate suggestions for
 * @returns Number of suggestions generated
 */
export async function generateKbSuggestions(
  workspaceId: string
): Promise<number> {
  const supabase = createServiceClient();
  const openai = getOpenAIClient();

  // 1. Query conversations with failure_score >= 4 from last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateThreshold = thirtyDaysAgo.toISOString();

  const { data: conversations, error: convError } = await supabase
    .from("conversations")
    .select("id, failure_score")
    .eq("workspace_id", workspaceId)
    .gte("failure_score", 4)
    .gte("created_at", dateThreshold);

  if (convError) {
    console.error(
      "[kb-suggester] Failed to query conversations:",
      convError.message
    );
    return 0;
  }

  if (!conversations || conversations.length === 0) {
    console.log(
      `[kb-suggester] No failed conversations found for workspace ${workspaceId}`
    );
    return 0;
  }

  const conversationIds = conversations.map((c) => c.id as string);

  // 2. Get client messages for these conversations (questions)
  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("id, conversation_id, content, sender_type")
    .in("conversation_id", conversationIds)
    .order("sequence", { ascending: true });

  if (msgError) {
    console.error(
      "[kb-suggester] Failed to query messages:",
      msgError.message
    );
    return 0;
  }

  // 3. Get topic assignments via message_topics join
  const clientMessageIds = (messages ?? [])
    .filter((m) => m.sender_type === "client")
    .map((m) => m.id as string);

  // Build conversation -> messages map
  const convMessageMap = new Map<
    string,
    { clientMessages: string[]; allMessages: { sender_type: string; content: string }[] }
  >();

  for (const msg of messages ?? []) {
    const convId = msg.conversation_id as string;
    const entry = convMessageMap.get(convId) ?? { clientMessages: [], allMessages: [] };
    entry.allMessages.push({
      sender_type: msg.sender_type as string,
      content: msg.content as string,
    });
    if (msg.sender_type === "client") {
      entry.clientMessages.push(msg.content as string);
    }
    convMessageMap.set(convId, entry);
  }

  // 4. Get topic assignments to group conversations by topic
  const topicConvMap = new Map<string, Set<string>>();

  if (clientMessageIds.length > 0) {
    // Query in batches to avoid payload limits
    for (let i = 0; i < clientMessageIds.length; i += 500) {
      const batch = clientMessageIds.slice(i, i + 500);
      const { data: msgTopics } = await supabase
        .from("message_topics")
        .select("message_id, topic_id")
        .in("message_id", batch);

      if (msgTopics) {
        for (const mt of msgTopics) {
          const topicId = mt.topic_id as string;
          const msgId = mt.message_id as string;

          // Find which conversation this message belongs to
          const convForMsg = (messages ?? []).find(
            (m) => (m.id as string) === msgId
          );
          if (convForMsg) {
            const convSet = topicConvMap.get(topicId) ?? new Set<string>();
            convSet.add(convForMsg.conversation_id as string);
            topicConvMap.set(topicId, convSet);
          }
        }
      }
    }
  }

  // If no topic assignments, group all conversations into one cluster
  if (topicConvMap.size === 0) {
    const allSet = new Set(conversationIds);
    topicConvMap.set("ungrouped", allSet);
  }

  // 5. Full refresh: delete existing kb_suggestions for this workspace
  await supabase
    .from("kb_suggestions")
    .delete()
    .eq("workspace_id", workspaceId);

  // 6. For each topic cluster with >= MIN_CLUSTER_SIZE conversations, generate suggestion
  let suggestionsGenerated = 0;

  const topicEntries = Array.from(topicConvMap.entries());

  for (const [, convIds] of topicEntries) {
    const clusterConvIds = Array.from(convIds);

    if (clusterConvIds.length < MIN_CLUSTER_SIZE) {
      continue;
    }

    // Take top 5-10 representative conversations (sorted by failure_score desc)
    const clusterConvs = conversations
      .filter((c) => clusterConvIds.includes(c.id as string))
      .sort((a, b) => (b.failure_score as number) - (a.failure_score as number))
      .slice(0, 10);

    // Build Q&A summaries for the prompt
    const summaries: string[] = [];
    for (const conv of clusterConvs) {
      const convData = convMessageMap.get(conv.id as string);
      if (!convData) continue;

      // Build pairs of client question + bot answer
      const pairs: string[] = [];
      for (let i = 0; i < convData.allMessages.length; i++) {
        const msg = convData.allMessages[i];
        if (msg.sender_type === "client") {
          const nextMsg = convData.allMessages[i + 1];
          const botAnswer =
            nextMsg && nextMsg.sender_type !== "client"
              ? nextMsg.content
              : "(pas de reponse)";
          pairs.push(`Client: ${msg.content}\nBot: ${botAnswer}`);
        }
      }

      if (pairs.length > 0) {
        summaries.push(pairs.slice(0, 3).join("\n"));
      }
    }

    if (summaries.length === 0) continue;

    // 7. Call GPT-4o-mini with zodResponseFormat
    try {
      const response = await openai.chat.completions.parse({
        model: LLM_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Voici ${summaries.length} conversations echouees regroupees par theme:\n\n${summaries.join("\n---\n")}\n\nIdentifie la lacune principale dans la base de connaissances et suggere un contenu a ajouter. L'impact_score doit etre entre 0 et 10.`,
          },
        ],
        response_format: zodResponseFormat(SuggestionResult, "suggestion_result"),
      });

      const parsed = response.choices[0]?.message?.parsed;

      if (parsed) {
        const { error: insertError } = await supabase
          .from("kb_suggestions")
          .insert({
            workspace_id: workspaceId,
            question: parsed.question,
            suggested_answer: parsed.suggested_answer,
            impact_score: Math.min(10, Math.max(0, parsed.impact_score)),
            source_conversation_ids: clusterConvIds,
            frequency: clusterConvIds.length,
            status: "pending",
          });

        if (insertError) {
          console.error(
            "[kb-suggester] Failed to insert suggestion:",
            insertError.message
          );
        } else {
          suggestionsGenerated++;
        }
      }
    } catch (err) {
      // Per-cluster error isolation: log and continue
      console.error(
        "[kb-suggester] Failed to generate suggestion for cluster:",
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `[kb-suggester] Generated ${suggestionsGenerated} suggestions for workspace ${workspaceId}`
  );

  return suggestionsGenerated;
}
