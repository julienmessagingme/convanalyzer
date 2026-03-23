import Link from "next/link";
import { Tag as TagIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { Tag } from "@/types/database";

interface TagCloudProps {
  tags: Tag[];
  workspaceId: string;
}

export function TagCloud({ tags, workspaceId }: TagCloudProps) {
  if (tags.length === 0) {
    return (
      <EmptyState
        title="Aucun tag detecte"
        description="Les tags apparaitront apres l'analyse des conversations."
        icon={<TagIcon className="h-12 w-12" />}
      />
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Link
          key={tag.id}
          href={`/${workspaceId}/conversations?tag=${tag.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 hover:bg-green-200 rounded-full text-sm text-green-700 transition-colors"
        >
          {tag.label}
          <span className="text-xs text-green-500 font-medium">
            {tag.conversation_count}
          </span>
        </Link>
      ))}
    </div>
  );
}
