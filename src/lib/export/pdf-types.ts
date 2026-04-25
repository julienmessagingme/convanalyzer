/**
 * PDF data shapes shared between the client `<ExportPdfButton>` and the
 * server-side generators in pdf-dashboard.ts / pdf-conversation.ts.
 *
 * Why a separate file? Next 14 NFT (Node File Trace) follows transitive
 * imports of any module a client component references — even via
 * `import type`. If <ExportPdfButton> imports types directly from
 * pdf-dashboard.ts, NFT pulls jspdf (~880 KB) into every Lambda that
 * renders the button, even though jspdf is loaded client-side via
 * `await import("jspdf")` and never executed server-side.
 *
 * Isolating the types here breaks that trace: pdf-dashboard.ts and
 * pdf-conversation.ts (which actually import jspdf) live in their own
 * modules, while consumers only depend on this types-only file.
 */

import type { Conversation } from "@/types/database";

export interface DashboardPdfData {
  period: string;
  metrics: {
    totalConversations: number;
    botConversations: number;
    agentConversations: number;
    escalatedConversations: number;
    tauxTransfert: number;
  };
  tags: Array<{ label: string; conversation_count: number }>;
}

export interface ConversationPdfData {
  conversation: Conversation;
  tags?: string[];
  failureReasons: string[];
}
