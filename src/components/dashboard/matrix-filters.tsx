"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, FormEvent } from "react";
import { Search, X } from "lucide-react";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "bot", label: "IA" },
  { value: "agent", label: "Humain" },
];

interface MatrixFiltersProps {
  /** Controlled state (when provided, component is controlled by parent). */
  matrixType?: string;
  matrixQ?: string;
  matrixMode?: string;
  onTypeChange?: (type: string) => void;
  onSearch?: (query: string, mode: string) => void;
  onClear?: () => void;
}

export function MatrixFilters({
  matrixType,
  matrixQ,
  matrixMode,
  onTypeChange,
  onSearch,
  onClear,
}: MatrixFiltersProps) {
  const controlled = onTypeChange !== undefined;

  const router = useRouter();
  const searchParams = useSearchParams();

  const [type, setType] = useState<string>(
    matrixType ?? searchParams.get("matrix_type") ?? "all"
  );
  const [query, setQuery] = useState<string>(
    matrixQ ?? searchParams.get("matrix_q") ?? ""
  );
  const [mode, setMode] = useState<string>(
    matrixMode ?? searchParams.get("matrix_mode") ?? "combined"
  );

  // Sync from controlled props
  useEffect(() => {
    if (controlled) {
      setType(matrixType ?? "all");
      setQuery(matrixQ ?? "");
      setMode(matrixMode ?? "combined");
    }
  }, [controlled, matrixType, matrixQ, matrixMode]);

  // Re-sync when URL changes (uncontrolled mode only)
  useEffect(() => {
    if (!controlled) {
      setType(searchParams.get("matrix_type") ?? "all");
      setQuery(searchParams.get("matrix_q") ?? "");
      setMode(searchParams.get("matrix_mode") ?? "combined");
    }
  }, [controlled, searchParams]);

  const applyFilters = (
    nextType: string,
    nextQuery: string,
    nextMode: string
  ) => {
    if (controlled) return; // controlled mode uses callbacks
    const params = new URLSearchParams(searchParams.toString());

    if (nextType === "all") params.delete("matrix_type");
    else params.set("matrix_type", nextType);

    const trimmed = nextQuery.trim();
    if (!trimmed) {
      params.delete("matrix_q");
      params.delete("matrix_mode");
    } else {
      params.set("matrix_q", trimmed);
      params.set("matrix_mode", nextMode);
    }

    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  };

  const handleTypeChange = (nextType: string) => {
    setType(nextType);
    if (onTypeChange) {
      onTypeChange(nextType);
    } else {
      applyFilters(nextType, query, mode);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(query, mode);
    } else {
      applyFilters(type, query, mode);
    }
  };

  const handleClearQuery = () => {
    setQuery("");
    if (onClear) {
      onClear();
    } else {
      applyFilters(type, "", mode);
    }
  };

  const handleModeChange = (nextMode: string) => {
    setMode(nextMode);
    if (query.trim()) {
      if (onSearch) {
        onSearch(query, nextMode);
      } else {
        applyFilters(type, query, nextMode);
      }
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap mb-4">
      {/* Type filter (segmented control) */}
      <div className="inline-flex items-center gap-1 bg-gray-100 rounded-full p-0.5">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleTypeChange(opt.value)}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${
              type === opt.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Keyword search */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 flex-1 min-w-[260px]"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Mot-cle (ex: remboursement, resiliation...)"
            className="w-full pl-9 pr-8 py-1.5 text-xs border border-gray-200 rounded-full focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-gray-400"
          />
          {query && (
            <button
              type="button"
              onClick={handleClearQuery}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Effacer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {query && (
          <select
            value={mode}
            onChange={(e) => handleModeChange(e.target.value)}
            className="text-xs border border-gray-200 rounded-full py-1.5 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
          >
            <option value="combined">Combine</option>
            <option value="text">Texte</option>
            <option value="semantic">Semantique</option>
          </select>
        )}

        {/* Hidden submit so Enter works without a visible button */}
        <button type="submit" className="hidden" aria-hidden="true" />
      </form>
    </div>
  );
}
