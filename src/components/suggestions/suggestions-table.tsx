"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { KbSuggestion } from "@/types/database";

interface SuggestionsTableProps {
  suggestions: KbSuggestion[];
}

function getPriorityBadge(impactScore: number) {
  if (impactScore >= 7) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        Haute
      </span>
    );
  }
  if (impactScore >= 4) {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
        Moyenne
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      Basse
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
      title="Copier la suggestion"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      Copier
    </button>
  );
}

export function SuggestionsTable({ suggestions }: SuggestionsTableProps) {
  // Sort by mixed score: impact_score * frequency (descending)
  const sorted = [...suggestions].sort(
    (a, b) => b.impact_score * b.frequency - a.impact_score * a.frequency
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="px-3 py-2">Sujet</th>
            <th className="px-3 py-2">Action recommandee</th>
            <th className="px-3 py-2">Priorite</th>
            <th className="px-3 py-2 text-right">Conversations impactees</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((suggestion, i) => (
            <tr
              key={suggestion.id}
              className={`border-b border-gray-100 ${
                i % 2 === 0 ? "bg-white" : "bg-gray-50"
              }`}
            >
              <td className="px-3 py-2 font-medium text-gray-900 max-w-[250px]">
                {suggestion.question}
              </td>
              <td className="px-3 py-2 text-gray-600 max-w-[350px]">
                {suggestion.suggested_answer.length > 100
                  ? suggestion.suggested_answer.slice(0, 100) + "..."
                  : suggestion.suggested_answer}
              </td>
              <td className="px-3 py-2">
                {getPriorityBadge(suggestion.impact_score)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                {suggestion.frequency}
              </td>
              <td className="px-3 py-2">
                <CopyButton text={suggestion.suggested_answer} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
