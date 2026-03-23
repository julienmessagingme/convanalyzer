import { z } from "zod/v3";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient } from "../openai/client";
import { createServiceClient } from "../supabase/server";

// --- Constants ---
const DEFAULT_LIMIT = 5;
const LLM_MODEL = "gpt-4o-mini";

const SENTIMENT_URGENCY_PROMPT = `Tu analyses une conversation entre un client et un chatbot d'assurance auto.
Evalue deux dimensions:

1. SENTIMENT: le sentiment global du client sur toute la conversation.
-5 = tres frustre, en colere, mecontent, menace de partir
-3 = agace, impatient, insatisfait
-1 = legerement insatisfait
0 = neutre
+1 = correct, poli
+3 = satisfait, content
+5 = tres content, reconnaissant, enthousiaste
Prends en compte le TON general, les majuscules, la ponctuation, les mots forts.

2. URGENCE: l'intention/urgence business du client.
0 = simple curiosite, question generale, salutation
1 = demande d'information (tarifs, garanties, fonctionnement)
2 = demande de modification simple (changement adresse, mise a jour info)
3 = demande transactionnelle (nouveau devis, souscription, ajout garantie)
4 = reclamation, demande de remboursement, contestation facture
5 = menace de resiliation, churn imminent, escalade juridique, plainte formelle

Reponds en JSON selon le schema fourni.`;

// --- Zod schema: single call for sentiment + urgency ---
const SentimentUrgencyResult = z.object({
  sentiment: z.number().min(-5).max(5),
  urgency: z.number().min(0).max(5),
  reason: z.string(),
});

// --- Types ---
interface ConversationRow {
  id: string;
  failure_score: number | null;
}

interface MessageRow {
  sender_type: string;
  content: string | null;
  sequence: number;
}

// --- Transfer detection patterns ---
// When the bot asks for personal info in sequence, it's preparing a handoff to a human agent.
const TRANSFER_PATTERNS = [
  // The key phrase before transfer: asking permission to collect info
  /collecte[r]?\s*(quelques\s*)?informations\s*(n[eé]cessaires)?/i,
  /r[eé]colter\s*(quelques\s*)?informations/i,
  /d.accord\s*pour\s*que\s*je\s*collecte/i,
  // Asking for personal info (contract, name, address)
  /num[eé]ro\s*(de\s*)?(contrat|dossier|client)/i,
  /votre\s*nom/i,
  /votre\s*pr[eé]nom/i,
  /votre\s*adresse/i,
  /confirmer?\s*(votre|vos)\s*(nom|pr[eé]nom|adresse|num[eé]ro)/i,
  // Explicit transfer language
  /je\s*(vous\s*)?transf[eè]re/i,
  /un\s*(de\s*mes\s*)?coll[eè]gue/i,
  /agent\s*(va|pour)/i,
  /mettre\s*en\s*relation/i,
  /passer\s*la\s*main/i,
  /conseiller\s*(qui\s*)?(pourra|va|pour)/i,
  /vous\s*transf[eé]rer\s*[aà]\s*un\s*conseiller/i,
];

/**
 * Detects if a conversation has been escalated/transferred to a human.
 * Scans bot messages for transfer patterns.
 */
function detectEscalation(messages: MessageRow[]): boolean {
  const botMessages = messages.filter((m) => m.sender_type === "bot");
  return botMessages.some((m) =>
    TRANSFER_PATTERNS.some((pattern) => pattern.test(m.content ?? ""))
  );
}

// --- Main exported function ---

/**
 * Processes rule-scored bot conversations:
 * 1. Detects transfer/escalation via regex (free)
 * 2. Single LLM call for sentiment (-5/+5) + urgency (0-5)
 *
 * scoring_status flow: 'scored' -> 'llm_scored' (or 'llm_error')
 */
export async function llmScorePendingConversations(
  limit?: number
): Promise<number> {
  const supabase = createServiceClient();
  const openai = getOpenAIClient();
  const maxConversations = limit ?? DEFAULT_LIMIT;

  const { data: conversations, error: queryError } = await supabase
    .from("conversations")
    .select("id, failure_score")
    .eq("scoring_status", "scored")
    .eq("type", "bot")
    .limit(maxConversations);

  if (queryError) {
    console.error(
      "[llm-scorer] Failed to query scored conversations:",
      queryError.message
    );
    return 0;
  }

  if (!conversations || conversations.length === 0) {
    return 0;
  }

  let scoredCount = 0;

  for (const conv of conversations as ConversationRow[]) {
    try {
      // Fetch messages
      const { data: messages, error: msgError } = await supabase
        .from("messages")
        .select("sender_type, content, sequence")
        .eq("conversation_id", conv.id)
        .order("sequence", { ascending: true });

      if (msgError || !messages) {
        console.error(
          `[llm-scorer] Failed to fetch messages for ${conv.id}:`,
          msgError?.message
        );
        await supabase
          .from("conversations")
          .update({ scoring_status: "llm_error" })
          .eq("id", conv.id);
        continue;
      }

      const msgRows = messages as MessageRow[];

      if (msgRows.length === 0) {
        await supabase
          .from("conversations")
          .update({ scoring_status: "llm_scored" })
          .eq("id", conv.id);
        scoredCount++;
        continue;
      }

      // 1. Detect escalation (free, regex-based)
      const isEscalated = detectEscalation(msgRows);

      // 2. Single LLM call: sentiment + urgency
      const allMessages = msgRows
        .filter((m) => m.content && m.content.trim())
        .map(
          (m) =>
            `${m.sender_type === "client" ? "Client" : "Bot"}: ${m.content}`
        )
        .join("\n");

      let sentiment = 0;
      let urgency = 0;

      try {
        const response = await openai.chat.completions.parse({
          model: LLM_MODEL,
          messages: [
            { role: "system", content: SENTIMENT_URGENCY_PROMPT },
            { role: "user", content: allMessages },
          ],
          response_format: zodResponseFormat(
            SentimentUrgencyResult,
            "sentiment_urgency_result"
          ),
        });
        const result = response.choices[0]?.message?.parsed;
        if (result) {
          sentiment = result.sentiment;
          urgency = result.urgency;
          console.log(
            `[llm-scorer] ${conv.id}: sentiment=${sentiment} urgency=${urgency} escalated=${isEscalated}`
          );
        }
      } catch (llmErr) {
        console.error(
          `[llm-scorer] LLM error for ${conv.id}:`,
          llmErr instanceof Error ? llmErr.message : llmErr
        );
      }

      // 3. Update conversation
      await supabase
        .from("conversations")
        .update({
          sentiment_score: sentiment,
          urgency_score: urgency,
          escalated: isEscalated,
          scoring_status: "llm_scored",
        })
        .eq("id", conv.id);

      scoredCount++;
    } catch (err) {
      console.error(
        `[llm-scorer] Error processing conversation ${conv.id}:`,
        err instanceof Error ? err.message : err
      );
      await supabase
        .from("conversations")
        .update({ scoring_status: "llm_error" })
        .eq("id", conv.id);
    }
  }

  return scoredCount;
}
