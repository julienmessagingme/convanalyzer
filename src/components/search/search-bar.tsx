"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

type SearchMode = "combined" | "text" | "semantic";

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [mode, setMode] = useState<SearchMode>(
    (searchParams.get("mode") as SearchMode) || "combined"
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("q", trimmed);
    params.set("mode", mode);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un theme (ex: accident non responsable)"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Rechercher
        </button>
      </form>
      <div className="flex items-center gap-4">
        <span className="text-xs text-gray-500 font-medium">Mode :</span>
        {([
          { value: "combined", label: "Combine" },
          { value: "text", label: "Texte exact" },
          { value: "semantic", label: "Semantique" },
        ] as const).map((opt) => (
          <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="search-mode"
              value={opt.value}
              checked={mode === opt.value}
              onChange={() => setMode(opt.value)}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className={`text-sm ${mode === opt.value ? "text-gray-900 font-medium" : "text-gray-600"}`}>
              {opt.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
