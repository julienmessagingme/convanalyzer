import { createServiceClient } from "../supabase/server";
import { embedPendingMessages } from "./embedder";
import { scorePendingConversations } from "./rule-scorer";
import { llmScorePendingConversations } from "./llm-scorer";
import { suggestTags } from "./tag-suggester";
import { classifyConversationTags } from "./tag-classifier";
import { generateKbSuggestions } from "./kb-suggester";

export interface PipelineResult {
  embedded: number;
  ruleScored: number;
  llmScored: number;
  tagsSuggested: number;
  tagsClassified: number;
  kbSuggested: number;
  errors: string[];
  duration: number;
}

/**
 * Orchestrates all 5 analysis pipelines in the correct dependency order:
 * 1. Embed pending client messages (required for analysis)
 * 2. Rule-score pending bot conversations
 * 3. LLM-score rule-scored conversations
 * 4. Suggest new tags from untagged conversations
 * 5. Classify conversations into user-defined tags
 *
 * Each step is isolated: failures in one step do not prevent subsequent steps
 * from running on existing data. Returns detailed result with counts and errors.
 */
export async function runAnalysisPipeline(): Promise<PipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  let embedded = 0;
  let ruleScored = 0;
  let llmScored = 0;
  let tagsSuggested = 0;
  let tagsClassified = 0;
  let kbSuggested = 0;
  // Step 1: Embed pending client messages
  try {
    console.log("[pipeline] Step 1: Embedding pending client messages...");
    embedded = await embedPendingMessages(2000);
    console.log(`[pipeline] Step 1: Embedded ${embedded} messages`);
  } catch (err) {
    const msg = `Embedding failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[pipeline] Step 1 error: ${msg}`);
    errors.push(msg);
  }

  // Step 2: Rule-score pending conversations
  try {
    console.log("[pipeline] Step 2: Rule-scoring pending conversations...");
    ruleScored = await scorePendingConversations(500);
    console.log(`[pipeline] Step 2: Rule-scored ${ruleScored} conversations`);
  } catch (err) {
    const msg = `Rule scoring failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[pipeline] Step 2 error: ${msg}`);
    errors.push(msg);
  }

  // Step 3: LLM-score rule-scored conversations
  try {
    console.log("[pipeline] Step 3: LLM-scoring scored conversations...");
    llmScored = await llmScorePendingConversations(500);
    console.log(`[pipeline] Step 3: LLM-scored ${llmScored} conversations`);
  } catch (err) {
    const msg = `LLM scoring failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[pipeline] Step 3 error: ${msg}`);
    errors.push(msg);
  }

  // Step 4: Suggest new tags from untagged conversations
  try {
    console.log("[pipeline] Step 4: Suggesting tags from untagged conversations...");
    const supabase = createServiceClient();
    const { data: workspaces, error: wsError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("is_active", true);

    if (wsError) {
      throw new Error(`Failed to query workspaces: ${wsError.message}`);
    }

    if (workspaces && workspaces.length > 0) {
      const results = await Promise.all(
        workspaces.map((ws) => suggestTags(ws.id as string))
      );
      tagsSuggested = results.reduce((sum, n) => sum + n, 0);
    }

    console.log(
      `[pipeline] Step 4: Suggested ${tagsSuggested} new tags across ${workspaces?.length ?? 0} workspaces`
    );
  } catch (err) {
    const msg = `Tag suggestion failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[pipeline] Step 4 error: ${msg}`);
    errors.push(msg);
  }

  // Step 5: Classify conversations into user-defined tags
  try {
    console.log("[pipeline] Step 5: Classifying conversations into tags...");
    const supabase = createServiceClient();
    const { data: workspaces, error: wsError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("is_active", true);

    if (wsError) {
      throw new Error(`Failed to query workspaces: ${wsError.message}`);
    }

    if (workspaces && workspaces.length > 0) {
      const results = await Promise.all(
        workspaces.map((ws) => classifyConversationTags(ws.id as string))
      );
      tagsClassified = results.reduce((sum, n) => sum + n, 0);
    }

    console.log(
      `[pipeline] Step 5: Created ${tagsClassified} tag assignments across ${workspaces?.length ?? 0} workspaces`
    );
  } catch (err) {
    const msg = `Tag classification failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[pipeline] Step 5 error: ${msg}`);
    errors.push(msg);
  }

  // Step 6: Generate KB suggestions from failed conversations
  try {
    console.log("[pipeline] Step 6: Generating KB suggestions...");
    const supabase6 = createServiceClient();
    const { data: workspaces6, error: wsError6 } = await supabase6
      .from("workspaces")
      .select("id")
      .eq("is_active", true);

    if (wsError6) {
      throw new Error(`Failed to query workspaces: ${wsError6.message}`);
    }

    if (workspaces6 && workspaces6.length > 0) {
      const results = await Promise.all(
        workspaces6.map((ws) => generateKbSuggestions(ws.id as string))
      );
      kbSuggested = results.reduce((sum, n) => sum + n, 0);
    }

    console.log(
      `[pipeline] Step 6: Generated ${kbSuggested} KB suggestions across ${workspaces6?.length ?? 0} workspaces`
    );
  } catch (err) {
    const msg = `KB suggestion failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[pipeline] Step 6 error: ${msg}`);
    errors.push(msg);
  }

  const duration = Date.now() - startTime;
  console.log(
    `[pipeline] Complete in ${duration}ms: ${embedded} embedded, ${ruleScored} rule-scored, ${llmScored} LLM-scored, ${tagsSuggested} tags suggested, ${tagsClassified} tag assignments, ${kbSuggested} KB suggestions`
  );

  return {
    embedded,
    ruleScored,
    llmScored,
    tagsSuggested,
    tagsClassified,
    kbSuggested,
    errors,
    duration,
  };
}
