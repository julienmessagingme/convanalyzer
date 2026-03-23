import { createServiceClient } from "@/lib/supabase/server";
import { TagManager } from "@/components/tags/tag-manager";
import type { Tag, SuggestedTag } from "@/types/database";

interface TagsPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function TagsPage({ params }: TagsPageProps) {
  const { workspaceId } = await params;
  const supabase = createServiceClient();

  const { data: allTags } = await supabase
    .from("tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("conversation_count", { ascending: false });

  const tags = (allTags as Tag[]) ?? [];

  const { data: suggestedData } = await supabase
    .from("suggested_tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("source_conversation_count", { ascending: false });

  const suggestedTags = (suggestedData as SuggestedTag[]) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Tags</h1>
      <TagManager
        workspaceId={workspaceId}
        initialHumanTags={tags}
        initialSuggestedTags={suggestedTags}
      />
    </div>
  );
}
