"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X, Sparkles } from "lucide-react";
import type { Tag, SuggestedTag } from "@/types/database";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const apiKey = process.env.NEXT_PUBLIC_INTERNAL_API_KEY || "";

interface TagManagerProps {
  workspaceId: string;
  initialHumanTags: Tag[];
  initialSuggestedTags: SuggestedTag[];
}

export function TagManager({
  workspaceId,
  initialHumanTags,
  initialSuggestedTags,
}: TagManagerProps) {
  const router = useRouter();
  const [humanTags, setHumanTags] = useState<Tag[]>(initialHumanTags);
  const [suggestedTags, setSuggestedTags] = useState<SuggestedTag[]>(initialSuggestedTags);
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [classifyingTagId, setClassifyingTagId] = useState<string | null>(null);
  const [classifyingLabel, setClassifyingLabel] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [similarWarning, setSimilarWarning] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState(false);

  const apiHeaders: HeadersInit = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };

  // Check if a label is similar to existing tags
  function findSimilarTag(label: string): Tag | null {
    const normalized = label.toLowerCase().trim();
    for (const tag of humanTags) {
      const existing = tag.label.toLowerCase().trim();
      // Exact match
      if (existing === normalized) return tag;
      // One contains the other
      if (existing.includes(normalized) || normalized.includes(existing)) return tag;
      // Simple word overlap: if 50%+ of words match
      const wordsNew = new Set(normalized.split(/\s+/));
      const wordsExisting = new Set(existing.split(/\s+/));
      const overlap = Array.from(wordsNew).filter((w) => wordsExisting.has(w)).length;
      const minSize = Math.min(wordsNew.size, wordsExisting.size);
      if (minSize > 0 && overlap / minSize >= 0.5) return tag;
    }
    return null;
  }

  const handleCreate = useCallback(async () => {
    if (!newLabel.trim()) return;

    // Check for similar tags (unless user already confirmed)
    if (!pendingCreate) {
      const similar = findSimilarTag(newLabel.trim());
      if (similar) {
        setSimilarWarning(
          `Le tag "${similar.label}" existe deja et semble similaire. Voulez-vous quand meme creer "${newLabel.trim()}" ?`
        );
        setPendingCreate(true);
        return;
      }
    }

    setSimilarWarning(null);
    setPendingCreate(false);
    setCreating(true);
    try {
      const res = await fetch(`${basePath}/api/tags`, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({
          workspace_id: workspaceId,
          label: newLabel.trim(),
          description: newDescription.trim() || null,
        }),
      });
      if (res.ok) {
        const { tag } = await res.json();
        setHumanTags((prev) => [...prev, tag]);
        setNewLabel("");
        setNewDescription("");
        router.refresh();
        // Ask to classify existing conversations
        setClassifyingTagId(tag.id);
        setClassifyingLabel(tag.label);
      }
    } finally {
      setCreating(false);
    }
  }, [newLabel, newDescription, workspaceId, router, pendingCreate, humanTags]);

  const handleUpdate = useCallback(
    async (tagId: string) => {
      if (!editLabel.trim()) return;
      const res = await fetch(`${basePath}/api/tags/${tagId}`, {
        method: "PATCH",
        headers: apiHeaders,
        body: JSON.stringify({
          label: editLabel.trim(),
          description: editDescription.trim() || null,
        }),
      });
      if (res.ok) {
        const { tag: updated } = await res.json();
        setHumanTags((prev) =>
          prev.map((t) => (t.id === tagId ? updated : t))
        );
        setEditingId(null);
        router.refresh();
      }
    },
    [editLabel, editDescription, router]
  );

  const handleDelete = useCallback(async (tagId: string) => {
    const res = await fetch(`${basePath}/api/tags/${tagId}`, {
      method: "DELETE",
      headers: apiHeaders,
    });
    if (res.ok) {
      setHumanTags((prev) => prev.filter((t) => t.id !== tagId));
      setDeletingId(null);
      router.refresh();
    }
  }, [router]);

  const handleAcceptSuggestion = useCallback(
    async (suggestion: SuggestedTag) => {
      // Prevent double-click
      if (acceptingId) return;
      setAcceptingId(suggestion.id);

      // Create the tag
      const createRes = await fetch(`${basePath}/api/tags`, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({
          workspace_id: workspaceId,
          label: suggestion.label,
          description: suggestion.description,
        }),
      });

      if (!createRes.ok) return;

      const { tag } = await createRes.json();
      setHumanTags((prev) => [...prev, tag]);

      // Mark suggestion as accepted
      const patchRes = await fetch(
        `${basePath}/api/suggested-tags/${suggestion.id}`,
        {
          method: "PATCH",
          headers: apiHeaders,
          body: JSON.stringify({ status: "accepted" }),
        }
      );

      if (patchRes.ok) {
        setSuggestedTags((prev) => prev.filter((s) => s.id !== suggestion.id));
        router.refresh();
        // Ask user if they want to classify existing conversations
        setClassifyingTagId(tag.id);
        setClassifyingLabel(tag.label);
      }
      setAcceptingId(null);
    },
    [workspaceId, router, acceptingId]
  );

  const handleClassifyExisting = useCallback(async () => {
    setClassifying(true);
    try {
      // Trigger the pipeline to classify conversations with the new tag
      await fetch(`${basePath}/api/cron/analyze`, {
        method: "POST",
        headers: apiHeaders,
      });
      router.refresh();
    } finally {
      setClassifying(false);
      setClassifyingTagId(null);
      setClassifyingLabel("");
    }
  }, [router]);

  const handleRejectSuggestion = useCallback(async (suggestionId: string) => {
    const res = await fetch(
      `${basePath}/api/suggested-tags/${suggestionId}`,
      {
        method: "PATCH",
        headers: apiHeaders,
        body: JSON.stringify({ status: "rejected" }),
      }
    );

    if (res.ok) {
      setSuggestedTags((prev) => prev.filter((s) => s.id !== suggestionId));
      router.refresh();
    }
  }, [router]);

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditLabel(tag.label);
    setEditDescription(tag.description || "");
  };

  return (
    <div className="space-y-8">
      {/* Create form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Creer un tag
        </h2>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="tag-label"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Libelle
            </label>
            <input
              id="tag-label"
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Ex: Reclamation"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="tag-description"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Description (optionnelle)
            </label>
            <input
              id="tag-description"
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description du tag"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newLabel.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
            Creer
          </button>
        </div>

        {/* Similar tag warning */}
        {similarWarning && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">{similarWarning}</p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleCreate}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 transition-colors"
              >
                <Check className="h-3 w-3" />
                Oui, creer quand meme
              </button>
              <button
                onClick={() => { setSimilarWarning(null); setPendingCreate(false); }}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Human tags list */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Tags manuels
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({humanTags.length})
          </span>
        </h2>

        {humanTags.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucun tag manuel. Creez-en un ci-dessus.
          </p>
        ) : (
          <div className="space-y-2">
            {humanTags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center gap-3 p-3 rounded-md border border-gray-100 hover:bg-gray-50"
              >
                {editingId === tag.id ? (
                  <>
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description"
                      className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleUpdate(tag.id)}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-md"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      {tag.label}
                    </span>
                    {tag.description && (
                      <span className="text-sm text-gray-500 flex-1 truncate">
                        {tag.description}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {tag.conversation_count} conv.
                    </span>

                    {deletingId === tag.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-600">Supprimer ?</span>
                        <button
                          onClick={() => handleDelete(tag.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEdit(tag)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeletingId(tag.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Classify modal - centered overlay */}
      {classifyingTagId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-6 w-6 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-base font-semibold text-gray-900">
                  Tag &laquo; {classifyingLabel} &raquo; cree !
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Voulez-vous analyser les conversations existantes et leur affecter ce tag automatiquement ?
                </p>
                <div className="flex items-center gap-3 mt-5">
                  <button
                    onClick={handleClassifyExisting}
                    disabled={classifying}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {classifying ? (
                      <>
                        <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        Analyse en cours...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Oui, analyser
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => { setClassifyingTagId(null); setClassifyingLabel(""); }}
                    disabled={classifying}
                    className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Plus tard
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suggested tags (AI suggestions) */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Suggestions IA
          <span className="text-sm font-normal text-gray-500">
            ({suggestedTags.length})
          </span>
        </h2>

        {suggestedTags.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucune suggestion en attente. De nouvelles suggestions apparaitront
            apres l&apos;analyse des conversations non classifiees.
          </p>
        ) : (
          <div className="space-y-3">
            {suggestedTags.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex items-center gap-3 p-3 rounded-md border border-amber-100 bg-amber-50/50"
              >
                <div className="flex-1 min-w-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
                    {suggestion.label}
                  </span>
                  {suggestion.description && (
                    <p className="text-sm text-gray-500 mt-1 truncate">
                      {suggestion.description}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  ~{suggestion.source_conversation_count} conv.
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleAcceptSuggestion(suggestion)}
                    disabled={acceptingId === suggestion.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Check className="h-3 w-3" />
                    Accepter
                  </button>
                  <button
                    onClick={() => handleRejectSuggestion(suggestion.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                  >
                    <X className="h-3 w-3" />
                    Rejeter
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
