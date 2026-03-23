import { z } from "zod/v3";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient } from "../openai/client";
import { createServiceClient } from "../supabase/server";
import type { Tag } from "@/types/database";

const LLM_MODEL = "gpt-4o-mini";
const BATCH_SIZE = 5;
const MIN_CONFIDENCE = 0.8;

const SYSTEM_PROMPT = `Tu es un classifieur STRICT de conversations pour une assurance auto.
On te donne une liste de tags et le contenu d'une conversation.
Tu dois determiner quels tags correspondent PRECISEMENT au SUJET PRINCIPAL de la conversation.

REGLES STRICTES:
- N'assigne un tag que si la conversation parle EXPLICITEMENT et DIRECTEMENT du sujet du tag
- confidence >= 0.8 = le sujet du tag est clairement le theme principal de la conversation
- confidence 0.5-0.79 = le sujet est mentionne mais n'est pas le theme principal -> NE PAS ASSIGNER
- confidence < 0.5 = pas de lien direct -> NE PAS ASSIGNER
- En cas de doute, NE PAS assigner le tag
- Maximum 2 tags par conversation
- Retourne un tableau VIDE si aucun tag ne correspond clairement

Reponds en JSON selon le schema fourni.`;

const TagMatch = z.object({
  tag_id: z.string(),
  confidence: z.number().min(0).max(1),
});

const ClassificationResult = z.object({
  matches: z.array(TagMatch),
});

/**
 * Classifies conversations into user-defined human tags for a workspace.
 * Incremental: only processes conversations that don't already have
 * AI-assigned human tags.
 *
 * @param workspaceId - The workspace to classify conversations for
 * @returns Number of conversation-tag assignments created
 */
export async function classifyConversationTags(
  workspaceId: string
): Promise<number> {
  const supabase = createServiceClient();

  // Fetch all tags for this workspace
  const { data: allTags, error: tagsError } = await supabase
    .from("tags")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (tagsError) {
    console.error(
      "[tag-classifier] Failed to fetch tags:",
      tagsError.message
    );
    return 0;
  }

  if (!allTags || allTags.length === 0) {
    console.log(
      `[tag-classifier] No tags defined for workspace ${workspaceId}, skipping`
    );
    return 0;
  }

  const tags = allTags as Tag[];
  const tagIds = tags.map((t) => t.id);

  // Find ALL existing AI assignments (conversation_id + tag_id pairs)
  const { data: existingAssignments } = await supabase
    .from("conversation_tags")
    .select("conversation_id, tag_id")
    .in("tag_id", tagIds)
    .eq("assigned_by", "ai");

  // Build a set of "convId:tagId" pairs that are already done
  const alreadyDone = new Set(
    (existingAssignments ?? []).map(
      (a) => `${a.conversation_id}:${a.tag_id}`
    )
  );

  // Find ALL conversations for this workspace
  const { data: conversations, error: convError } = await supabase
    .from("conversations")
    .select("id")
    .eq("workspace_id", workspaceId);

  if (convError) {
    console.error(
      "[tag-classifier] Failed to fetch conversations:",
      convError.message
    );
    return 0;
  }

  if (!conversations || conversations.length === 0) {
    return 0;
  }

  // For each conversation, find which tags still need to be tested
  const toClassify: { convId: string; tagsToTest: Tag[] }[] = [];
  for (const conv of conversations) {
    const convId = conv.id as string;
    const missingTags = tags.filter(
      (t) => !alreadyDone.has(`${convId}:${t.id}`)
    );
    if (missingTags.length > 0) {
      toClassify.push({ convId, tagsToTest: missingTags });
    }
  }

  if (toClassify.length === 0) {
    console.log(
      `[tag-classifier] All conversations already classified against all tags for workspace ${workspaceId}`
    );
    return 0;
  }

  console.log(
    `[tag-classifier] Classifying ${toClassify.length} conversations against new/missing tags for workspace ${workspaceId}`
  );

  const openai = getOpenAIClient();
  let totalAssignments = 0;
  const tagCountIncrements = new Map<string, number>();

  // Process in batches
  for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
    const batch = toClassify.slice(i, i + BATCH_SIZE);

    for (const { convId, tagsToTest } of batch) {
      // Fetch client messages for this conversation
      const { data: msgs } = await supabase
        .from("messages")
        .select("content")
        .eq("conversation_id", convId)
        .eq("sender_type", "client")
        .order("sequence", { ascending: true });

      if (!msgs || msgs.length === 0) continue;

      const conversationText = msgs
        .map((m) => m.content as string)
        .join("\n");

      // Build tag list — only tags that haven't been tested yet for this conversation
      const tagList = tagsToTest
        .map(
          (t) =>
            `- ID: ${t.id} | Label: ${t.label}${t.description ? ` | Description: ${t.description}` : ""}`
        )
        .join("\n");

      const testTagIds = new Set(tagsToTest.map((t) => t.id));

      try {
        const response = await openai.chat.completions.parse({
          model: LLM_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Tags disponibles:\n${tagList}\n\nMessages client de la conversation:\n${conversationText}\n\nQuels tags s'appliquent a cette conversation ? Retourne uniquement les tags pertinents avec un score de confiance entre 0 et 1. Si aucun tag ne correspond, retourne un tableau vide.`,
            },
          ],
          response_format: zodResponseFormat(
            ClassificationResult,
            "classification_result"
          ),
        });

        const parsed = response.choices[0]?.message?.parsed;
        if (!parsed) continue;

        // Filter by minimum confidence and only tags we're testing
        const validMatches = parsed.matches
          .filter(
            (m) => m.confidence >= MIN_CONFIDENCE && testTagIds.has(m.tag_id)
          )
          .sort((a, b) => b.confidence - a.confidence);

        if (validMatches.length === 0) continue;

        // Count existing tags on this conversation (human + ai)
        const { count: existingCount } = await supabase
          .from("conversation_tags")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", convId);

        const slotsLeft = Math.max(0, 2 - (existingCount ?? 0));
        if (slotsLeft === 0) continue;

        // Keep only top matches within the 2-tag limit
        const cappedMatches = validMatches.slice(0, slotsLeft);

        // Insert conversation_tags (max 2 per conversation)
        const records = cappedMatches.map((m) => ({
          conversation_id: convId,
          tag_id: m.tag_id,
          assigned_by: "ai" as const,
          confidence: m.confidence,
        }));

        const { error: insertError } = await supabase
          .from("conversation_tags")
          .insert(records);

        if (insertError) {
          console.error(
            `[tag-classifier] Failed to insert tags for conversation ${convId}:`,
            insertError.message
          );
          continue;
        }

        totalAssignments += cappedMatches.length;

        // Track count increments per tag
        for (const m of cappedMatches) {
          tagCountIncrements.set(
            m.tag_id,
            (tagCountIncrements.get(m.tag_id) ?? 0) + 1
          );
        }
      } catch (err) {
        console.error(
          `[tag-classifier] Failed to classify conversation ${convId}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  // Update conversation_count on affected tags
  for (const [tagId, increment] of Array.from(tagCountIncrements.entries())) {
    const tag = tags.find((t) => t.id === tagId);
    if (!tag) continue;

    const { error: updateError } = await supabase
      .from("tags")
      .update({ conversation_count: tag.conversation_count + increment })
      .eq("id", tagId);

    if (updateError) {
      console.error(
        `[tag-classifier] Failed to update count for tag ${tagId}:`,
        updateError.message
      );
    }
  }

  console.log(
    `[tag-classifier] Created ${totalAssignments} tag assignments for workspace ${workspaceId}`
  );

  return totalAssignments;
}
