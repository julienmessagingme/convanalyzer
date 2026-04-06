import { createServiceClient } from "../supabase/server";

// --- Signal score constants (SPEC section 8.1) ---
const ESCALATION_SCORE = 3;
const CLIENT_REPETITION_SCORE = 2;
const BOT_UNCERTAINTY_SCORE = 2;
const VERY_SHORT_RESPONSE_SCORE = 1;
const NEGATIVE_SENTIMENT_SCORE = 2;

const DEFAULT_LIMIT = 10;
const ESCALATION_WINDOW_HOURS = 24;
const REPETITION_THRESHOLD = 0.85;
const SHORT_RESPONSE_LENGTH = 20;

// --- Uncertainty patterns (French bot hedging phrases) ---
const UNCERTAINTY_PATTERNS: RegExp[] = [
  /je ne sais pas/i,
  /je ne peux pas/i,
  /je n'ai pas l'information/i,
  /je ne dispose pas/i,
  /malheureusement/i,
  /je ne suis pas en mesure/i,
];

// --- Negative keywords (French v1 sentiment detection) ---
const NEGATIVE_KEYWORDS: string[] = [
  "probleme",
  "problème",
  "inacceptable",
  "scandaleux",
  "honteux",
  "nul",
  "horrible",
  "decu",
  "déçu",
  "colere",
  "colère",
  "plainte",
  "furieux",
  "furieuse",
  "inadmissible",
  "catastrophe",
  "pire",
  "arnaque",
];

// --- Types ---
interface ConversationRow {
  id: string;
  workspace_id: string;
  client_id: string;
  started_at: string | null;
}

interface MessageRow {
  id: string;
  sender_type: string;
  content: string | null;
  sequence: number;
  embedding: number[] | null;
  embedding_status: string | null;
}

interface SignalHit {
  messageId: string;
  signal: string;
  score: number;
}

// --- Cosine similarity helper ---
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// --- Signal detectors ---

async function detectEscalation(
  supabase: ReturnType<typeof createServiceClient>,
  conversation: ConversationRow
): Promise<SignalHit[]> {
  if (!conversation.started_at || !conversation.client_id) return [];

  const startTime = new Date(conversation.started_at);
  const endTime = new Date(
    startTime.getTime() + ESCALATION_WINDOW_HOURS * 60 * 60 * 1000
  );

  const { data: agentConvs, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("client_id", conversation.client_id)
    .eq("type", "agent")
    .gte("started_at", conversation.started_at)
    .lte("started_at", endTime.toISOString())
    .neq("id", conversation.id)
    .limit(1);

  if (error || !agentConvs || agentConvs.length === 0) return [];

  // Escalation is a conversation-level signal; attach to the last message
  return [
    {
      messageId: "__conversation__",
      signal: "escalation",
      score: ESCALATION_SCORE,
    },
  ];
}

function detectClientRepetition(messages: MessageRow[]): SignalHit[] {
  const hits: SignalHit[] = [];
  const clientMessages = messages.filter((m) => m.sender_type === "client");

  for (let i = 1; i < clientMessages.length; i++) {
    const prev = clientMessages[i - 1];
    const curr = clientMessages[i];

    // Both must have completed embeddings
    if (
      prev.embedding_status !== "done" ||
      curr.embedding_status !== "done" ||
      !prev.embedding ||
      !curr.embedding
    ) {
      continue;
    }

    const similarity = cosineSimilarity(prev.embedding, curr.embedding);
    if (similarity > REPETITION_THRESHOLD) {
      hits.push({
        messageId: curr.id,
        signal: "client_repetition",
        score: CLIENT_REPETITION_SCORE,
      });
    }
  }

  return hits;
}

function detectBotUncertainty(messages: MessageRow[]): SignalHit[] {
  const hits: SignalHit[] = [];

  for (const msg of messages) {
    if (msg.sender_type !== "bot" || !msg.content) continue;

    for (const pattern of UNCERTAINTY_PATTERNS) {
      if (pattern.test(msg.content)) {
        hits.push({
          messageId: msg.id,
          signal: "bot_uncertainty",
          score: BOT_UNCERTAINTY_SCORE,
        });
        break; // Only count once per message
      }
    }
  }

  return hits;
}

function detectVeryShortResponse(messages: MessageRow[]): SignalHit[] {
  const hits: SignalHit[] = [];

  for (const msg of messages) {
    if (msg.sender_type !== "bot" || !msg.content) continue;

    if (msg.content.length < SHORT_RESPONSE_LENGTH) {
      hits.push({
        messageId: msg.id,
        signal: "very_short_response",
        score: VERY_SHORT_RESPONSE_SCORE,
      });
    }
  }

  return hits;
}

function detectNegativeSentimentSpike(messages: MessageRow[]): SignalHit[] {
  const hits: SignalHit[] = [];

  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];

    // Client message following a bot message
    if (prev.sender_type !== "bot" || curr.sender_type !== "client") continue;
    if (!curr.content) continue;

    const lowerContent = curr.content.toLowerCase();
    const hasNegative = NEGATIVE_KEYWORDS.some((keyword) =>
      lowerContent.includes(keyword)
    );

    if (hasNegative) {
      hits.push({
        messageId: curr.id,
        signal: "negative_sentiment_spike",
        score: NEGATIVE_SENTIMENT_SCORE,
      });
    }
  }

  return hits;
}

// --- Main exported function ---

/**
 * Processes pending bot conversations with rule-based failure detection.
 * Applies 5 signal types: escalation, client_repetition, bot_uncertainty,
 * very_short_response, negative_sentiment_spike.
 *
 * Updates each flagged message with failure_signal and failure_score.
 * Updates conversation with total failure_score and scoring_status='scored'.
 *
 * @param limit - Maximum conversations to process (default 10)
 * @returns Number of successfully scored conversations
 */
export async function scorePendingConversations(
  limit?: number
): Promise<number> {
  const supabase = createServiceClient();
  const maxConversations = limit ?? DEFAULT_LIMIT;

  // Query pending bot conversations
  const { data: conversations, error: queryError } = await supabase
    .from("conversations")
    .select("id, workspace_id, client_id, started_at")
    .eq("scoring_status", "pending")
    .limit(maxConversations);

  if (queryError) {
    console.error(
      "[rule-scorer] Failed to query pending conversations:",
      queryError.message
    );
    return 0;
  }

  if (!conversations || conversations.length === 0) {
    return 0;
  }

  let scoredCount = 0;

  for (const conv of conversations) {
    try {
      // Fetch all messages ordered by sequence
      const { data: messages, error: msgError } = await supabase
        .from("messages")
        .select(
          "id, sender_type, content, sequence, embedding, embedding_status"
        )
        .eq("conversation_id", conv.id)
        .order("sequence", { ascending: true });

      if (msgError || !messages) {
        console.error(
          `[rule-scorer] Failed to fetch messages for ${conv.id}:`,
          msgError?.message
        );
        await supabase
          .from("conversations")
          .update({ scoring_status: "error" })
          .eq("id", conv.id);
        continue;
      }

      // Run all signal detectors
      const escalationHits = await detectEscalation(supabase, conv);
      const repetitionHits = detectClientRepetition(messages);
      const uncertaintyHits = detectBotUncertainty(messages);
      const shortResponseHits = detectVeryShortResponse(messages);
      const sentimentHits = detectNegativeSentimentSpike(messages);

      const allHits: SignalHit[] = [
        ...escalationHits,
        ...repetitionHits,
        ...uncertaintyHits,
        ...shortResponseHits,
        ...sentimentHits,
      ];

      // Update individual messages with their failure signals
      // Group hits by messageId to handle multiple signals per message
      const hitsByMessage = new Map<string, SignalHit[]>();
      for (const hit of allHits) {
        if (hit.messageId === "__conversation__") continue;
        const existing = hitsByMessage.get(hit.messageId) ?? [];
        existing.push(hit);
        hitsByMessage.set(hit.messageId, existing);
      }

      const messageIds = Array.from(hitsByMessage.keys());
      for (const messageId of messageIds) {
        const hits = hitsByMessage.get(messageId)!;
        // Use the highest-scoring signal as the primary failure_signal
        const primary = hits.reduce((a: SignalHit, b: SignalHit) =>
          a.score >= b.score ? a : b
        );
        const totalScore = hits.reduce(
          (sum: number, h: SignalHit) => sum + h.score,
          0
        );

        await supabase
          .from("messages")
          .update({
            failure_signal: primary.signal,
            failure_score: totalScore,
          })
          .eq("id", messageId);
      }

      // Calculate total conversation failure score
      const totalConversationScore = allHits.reduce(
        (sum, h) => sum + h.score,
        0
      );

      // Update conversation with total score and mark as scored
      await supabase
        .from("conversations")
        .update({
          failure_score: totalConversationScore,
          scoring_status: "scored",
        })
        .eq("id", conv.id);

      scoredCount++;
    } catch (err) {
      console.error(
        `[rule-scorer] Error processing conversation ${conv.id}:`,
        err instanceof Error ? err.message : err
      );

      // Mark as error and continue with next conversation
      await supabase
        .from("conversations")
        .update({ scoring_status: "error" })
        .eq("id", conv.id);
    }
  }

  return scoredCount;
}
