"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Bot, User, MessageSquare, Plus, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Conversation, Tag, Message } from "@/types/database";
import { getScoreLevel, scoreColors, formatScore } from "@/lib/utils/scores";
import { MessageBubble } from "./message-bubble";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const apiKey = process.env.NEXT_PUBLIC_INTERNAL_API_KEY || "";

interface ConversationCardProps {
  conversation: Conversation;
  workspaceId: string;
  tags?: { id?: string; label: string }[];
  availableTags?: Tag[];
  matchType?: "text" | "semantic" | "both";
  matchedSnippet?: string;
}

export function ConversationCard({
  conversation,
  workspaceId,
  tags,
  availableTags = [],
  matchType,
  matchedSnippet,
}: ConversationCardProps) {
  const router = useRouter();
  const level = getScoreLevel(conversation.failure_score);
  const colors = scoreColors[level];
  const TypeIcon = conversation.type === "bot" ? Bot : User;
  const typeLabel = conversation.type === "bot" ? "Bot" : "Agent";

  const [showDropdown, setShowDropdown] = useState(false);
  const [localTags, setLocalTags] = useState(tags || []);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
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

  const handleToggleExpand = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (messages.length === 0) {
      setLoadingMessages(true);
      try {
        const res = await fetch(`${basePath}/api/conversations/${conversation.id}/messages`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages ?? []);
        }
      } finally {
        setLoadingMessages(false);
      }
    }
  };

  const sentimentDisplay = conversation.sentiment_score != null
    ? `${conversation.sentiment_score > 0 ? "+" : ""}${conversation.sentiment_score}`
    : null;

  const urgencyDisplay = conversation.urgency_score != null
    ? `${conversation.urgency_score}/5`
    : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300">
      {/* Main row - horizontal layout */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Expand button */}
        <button
          onClick={handleToggleExpand}
          className="flex-shrink-0 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          title={expanded ? "Replier" : "Voir les messages"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {/* Type icon */}
        <div className="flex items-center gap-1.5 flex-shrink-0 text-sm text-gray-600">
          <TypeIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{typeLabel}</span>
        </div>

        {/* Date */}
        <span className="text-sm text-gray-500 flex-shrink-0">
          {format(
            parseISO(conversation.started_at || conversation.created_at),
            "dd MMM yyyy HH:mm"
          )}
        </span>

        {/* Score badge */}
        <div
          className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
        >
          <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
          {formatScore(conversation.failure_score)}
        </div>

        {/* Sentiment + Urgency */}
        {sentimentDisplay && (
          <span className="text-xs text-gray-500 flex-shrink-0" title="Sentiment">
            S:{sentimentDisplay}
          </span>
        )}
        {urgencyDisplay && (
          <span className="text-xs text-gray-500 flex-shrink-0" title="Urgence">
            U:{urgencyDisplay}
          </span>
        )}

        {/* Match type badge (search results) */}
        {matchType && (
          <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
            matchType === "both" ? "bg-purple-100 text-purple-700" :
            matchType === "semantic" ? "bg-blue-100 text-blue-700" :
            "bg-green-100 text-green-700"
          }`}>
            {matchType === "both" ? "texte+sem." : matchType === "semantic" ? "semantique" : "texte"}
          </span>
        )}

        {/* Tags */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
          {localTags.map((tag, i) => (
            <span
              key={`${tag.label}-${i}`}
              className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap"
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
        </div>

        {/* Message count + detail link */}
        <span className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
          <MessageSquare className="h-3 w-3" />
          {conversation.message_count}
        </span>
        <a
          href={`${basePath}/${workspaceId}/conversations/${conversation.id}`}
          className="flex-shrink-0 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
          title="Ouvrir le detail"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Matched snippet (search results) */}
      {matchedSnippet && !expanded && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-xs text-gray-500 italic truncate">&laquo;{matchedSnippet}&raquo;</p>
        </div>
      )}

      {/* Expanded messages */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 max-h-96 overflow-y-auto">
          {loadingMessages ? (
            <p className="text-sm text-gray-400 text-center py-4">Chargement...</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun message</p>
          ) : (
            <div className="space-y-1">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isBot={msg.sender_type !== "client"}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
