import { getKbSuggestions } from "@/lib/supabase/queries";
import { SuggestionsTable } from "@/components/suggestions/suggestions-table";
import { GenerateButton } from "@/components/suggestions/generate-button";

interface SuggestionsPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function SuggestionsPage({
  params,
}: SuggestionsPageProps) {
  const { workspaceId } = await params;
  const suggestions = await getKbSuggestions(workspaceId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Suggestions KB</h1>
        <GenerateButton workspaceId={workspaceId} />
      </div>

      {suggestions.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500">
            Aucune suggestion generee. Lancez l&apos;analyse pour generer des
            suggestions.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white">
          <SuggestionsTable suggestions={suggestions} />
        </div>
      )}
    </div>
  );
}
