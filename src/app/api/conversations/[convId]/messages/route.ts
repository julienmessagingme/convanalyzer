import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/conversations/:convId/messages
 * Returns messages for a conversation, ordered by sequence.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ convId: string }> }
) {
  const { convId } = await params;
  const supabase = createServiceClient();

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, sender_type, content, sequence, sent_at, failure_score, failure_reason")
    .eq("conversation_id", convId)
    .order("sequence", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: messages ?? [] });
}
