import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient } from "../openai/client";
import { createServiceClient } from "../supabase/server";

const LLM_MODEL = "gpt-4o-mini";
const MIN_UNTAGGED = 2;
const MAX_SAMPLE = 50;

const SYSTEM_PROMPT = `Tu analyses des conversations chatbot d'assurance auto. On te donne le contenu de plusieurs conversations non classifiees.
Propose 3 a 5 tags thematiques qui couvrent ces conversations.

REGLES IMPORTANTES:
- Ne propose PAS de tags qui sont des variantes d'un tag existant (ex: si "Resiliation" existe, ne propose pas "Resiliation de contrat")
- Ne propose PAS de tags generiques comme "Assurance auto", "Assistance client", "Support" — ils sont trop vagues
- Chaque tag doit couvrir un SUJET PRECIS et DISTINCT
- Evite les tags de test ("test chatbot", "interactions de test")
Reponds en JSON selon le schema fourni.`;

const SuggestionItem = z.object({
  label: z.string(),
  description: z.string(),
  conversation_count: z.number(),
});

const SuggestionsResult = z.object({
  suggestions: z.array(SuggestionItem),
});

/**
 * Suggests new tags based on untagged conversations for a workspace.
 * Finds conversations with no tags assigned, samples up to 50,
 * asks GPT-4o-mini to propose 3-5 thematic tags, and inserts them
 * into the suggested_tags table with status='pending'.
 *
 * Skips if fewer than 10 untagged conversations exist.
 * Does not re-suggest tags that already exist (by label match).
 *
 * @param workspaceId - The workspace to suggest tags for
 * @returns Number of suggestions created
 */
export async function suggestTags(workspaceId: string): Promise<number> {
  const supabase = createServiceClient();

  // Get all conversations for this workspace
  const { data: allConversations, error: convError } = await supabase
    .from("conversations")
    .select("id")
    .eq("workspace_id", workspaceId);

  if (convError) {
    console.error(
      "[tag-suggester] Failed to fetch conversations:",
      convError.message
    );
    return 0;
  }

  if (!allConversations || allConversations.length === 0) {
    console.log(
      `[tag-suggester] No conversations for workspace ${workspaceId}`
    );
    return 0;
  }

  const allConvIds = allConversations.map((c) => c.id as string);

  // Find which of these conversations have tags
  const { data: taggedConvRows } = await supabase
    .from("conversation_tags")
    .select("conversation_id")
    .in("conversation_id", allConvIds);

  const taggedIds = new Set(
    (taggedConvRows ?? []).map((r) => r.conversation_id as string)
  );

  const untaggedIds = allConvIds.filter((id) => !taggedIds.has(id));

  if (untaggedIds.length < MIN_UNTAGGED) {
    console.log(
      `[tag-suggester] Skipping workspace ${workspaceId}: only ${untaggedIds.length} untagged conversations (minimum ${MIN_UNTAGGED})`
    );
    return 0;
  }

  // Sample up to MAX_SAMPLE untagged conversations
  const sampleIds = untaggedIds.slice(0, MAX_SAMPLE);

  // Fetch client messages for sampled conversations
  const { data: messages } = await supabase
    .from("messages")
    .select("conversation_id, content")
    .eq("sender_type", "client")
    .in("conversation_id", sampleIds)
    .order("sequence", { ascending: true });

  if (!messages || messages.length === 0) {
    console.log(
      `[tag-suggester] No client messages found for sampled conversations in workspace ${workspaceId}`
    );
    return 0;
  }

  // Group messages by conversation
  const convMessages = new Map<string, string[]>();
  for (const msg of messages) {
    const convId = msg.conversation_id as string;
    const arr = convMessages.get(convId) ?? [];
    arr.push(msg.content as string);
    convMessages.set(convId, arr);
  }

  // Build conversation summaries for the prompt
  const conversationTexts: string[] = [];
  for (const [, msgs] of Array.from(convMessages.entries())) {
    conversationTexts.push(msgs.join(" | "));
  }

  console.log(
    `[tag-suggester] Analyzing ${conversationTexts.length} untagged conversations for workspace ${workspaceId}`
  );

  // Fetch existing tags and suggestions in parallel BEFORE calling LLM (to include in prompt)
  const [{ data: existingTags }, { data: existingSuggestions }] = await Promise.all([
    supabase
      .from("tags")
      .select("label")
      .eq("workspace_id", workspaceId),
    supabase
      .from("suggested_tags")
      .select("label")
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "rejected"]),
  ]);

  const existingLabels = new Set(
    [
      ...(existingTags ?? []).map((t) => (t.label as string).toLowerCase()),
      ...(existingSuggestions ?? []).map((s) => (s.label as string).toLowerCase()),
    ]
  );

  // Call GPT-4o-mini to suggest tags
  const openai = getOpenAIClient();

  let suggestions: { label: string; description: string; conversation_count: number }[];
  try {
    const response = await openai.chat.completions.parse({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Tags DEJA existants (ne pas reproposer ni creer de variantes):\n${Array.from(existingLabels).map((l) => `- ${l}`).join("\n")}\n\nVoici le contenu de ${conversationTexts.length} conversations non classifiees:\n\n${conversationTexts.map((t, i) => `Conversation ${i + 1}: ${t.slice(0, 500)}`).join("\n\n")}\n\nPropose 3 a 5 tags thematiques NOUVEAUX et DISTINCTS qui couvrent ces conversations.`,
        },
      ],
      response_format: zodResponseFormat(SuggestionsResult, "suggestions_result"),
    });

    const parsed = response.choices[0]?.message?.parsed;
    if (!parsed || !parsed.suggestions || parsed.suggestions.length === 0) {
      console.log(
        `[tag-suggester] No suggestions generated for workspace ${workspaceId}`
      );
      return 0;
    }

    suggestions = parsed.suggestions;
  } catch (err) {
    console.error(
      `[tag-suggester] Failed to generate suggestions for workspace ${workspaceId}:`,
      err instanceof Error ? err.message : err
    );
    return 0;
  }

  // Filter out suggestions that already exist or are too similar
  const newSuggestions = suggestions.filter((s) => {
    const label = s.label.toLowerCase();
    // Exact match
    if (existingLabels.has(label)) return false;
    // Similarity check: if one label contains the other, or >50% word overlap
    for (const existing of Array.from(existingLabels)) {
      if (label.includes(existing) || existing.includes(label)) return false;
      const wordsNew = new Set(label.split(/\s+/));
      const wordsExisting = new Set(existing.split(/\s+/));
      const overlap = Array.from(wordsNew).filter((w) => wordsExisting.has(w)).length;
      const minSize = Math.min(wordsNew.size, wordsExisting.size);
      if (minSize > 0 && overlap / minSize > 0.5) return false;
    }
    return true;
  });

  if (newSuggestions.length === 0) {
    console.log(
      `[tag-suggester] All suggestions already exist for workspace ${workspaceId}`
    );
    return 0;
  }

  // Insert new suggestions
  const records = newSuggestions.map((s) => ({
    workspace_id: workspaceId,
    label: s.label,
    description: s.description,
    source_conversation_count: s.conversation_count,
    status: "pending" as const,
  }));

  const { error: insertError } = await supabase
    .from("suggested_tags")
    .insert(records);

  if (insertError) {
    console.error(
      `[tag-suggester] Failed to insert suggestions for workspace ${workspaceId}:`,
      insertError.message
    );
    return 0;
  }

  console.log(
    `[tag-suggester] Created ${newSuggestions.length} tag suggestions for workspace ${workspaceId}`
  );

  return newSuggestions.length;
}
