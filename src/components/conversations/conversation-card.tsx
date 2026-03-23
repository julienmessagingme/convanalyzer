"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Bot, User, MessageSquare, Plus } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Conversation, Tag } from "@/types/database";
import { getScoreLevel, scoreColors, formatScore } from "@/lib/utils/scores";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const apiKey = process.env.NEXT_PUBLIC_INTERNAL_API_KEY || "";

interface ConversationCardProps {
  conversation: Conversation;
  workspaceId: string;
  tags?: { id?: string; label: string }[];
  availableTags?: Tag[];
}

export function ConversationCard({
  conversation,
  workspaceId,
  tags,
  availableTags = [],
}: ConversationCardProps) {
  const router = useRouter();
  const level = getScoreLevel(conversation.failure_score);
  const colors = scoreColors[level];
  const TypeIcon = conversation.type === "bot" ? Bot : User;
  const typeLabel = conversation.type === "bot" ? "Bot" : "Agent";

  const [showDropdown, setShowDropdown] = useState(false);
  const [localTags, setLocalTags] = useState(tags || []);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const assignedIds = new Set(localTags.map((t) => t.id).filter(Boolean));
  const unassigned = availableTags.filter((t) => !assignedIds.has(t.id));

  const handleAssign = async (tagId: string, tagLabel: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const res = await fetch(
      `${basePath}/api/conversations/${conversation.id}/tags`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ tag_id: tagId }),
      }
    );
    if (res.ok) {
      setLocalTags((prev) => [...prev, { id: tagId, label: tagLabel }]);
      setShowDropdown(false);
      router.refresh();
    }
  };

  return (
    <a
      href={`${basePath}/${workspaceId}/conversations/${conversation.id}`}
      className="block p-4 rounded-lg border border-gray-200 hover:border-gray-300 bg-white transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <TypeIcon className="h-4 w-4" />
          <span>{typeLabel}</span>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
        >
          <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
          {formatScore(conversation.failure_score)}
        </div>
      </div>

      <div className="text-sm text-gray-500 mb-2">
        {format(
          parseISO(conversation.started_at || conversation.created_at),
          "dd MMM yyyy HH:mm"
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {localTags.map((tag, i) => (
          <span
            key={`${tag.label}-${i}`}
            className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700"
          >
            {tag.label}
          </span>
        ))}

        {/* Add tag button */}
        {unassigned.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowDropdown(!showDropdown);
              }}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
              title="Ajouter un tag"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {showDropdown && (
              <div className="absolute left-0 top-8 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] max-h-48 overflow-y-auto">
                {unassigned.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={(e) => handleAssign(tag.id, tag.label, e)}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
          <MessageSquare className="h-3 w-3" />
          {conversation.message_count}
        </span>
      </div>
    </a>
  );
}
