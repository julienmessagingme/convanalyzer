"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

interface PeriodSelectorProps {
  currentPeriod: string;
  currentGranularity?: string;
  /**
   * When true, only "7j" is clickable. Other period buttons are disabled
   * with opacity and a tooltip, and the granularity selector is hidden.
   * Set from the server page based on isRestrictedSession.
   */
  restrictedMode?: boolean;
}

const periods = [
  { label: "7j", value: "7d", alwaysAvailable: true },
  { label: "30j", value: "30d", alwaysAvailable: false },
  { label: "90j", value: "90d", alwaysAvailable: false },
  { label: "Personnalise", value: "custom", alwaysAvailable: false },
] as const;

const granularities = [
  { label: "Jour", value: "day" },
  { label: "Semaine", value: "week" },
  { label: "Mois", value: "month" },
] as const;

export function PeriodSelector({
  currentPeriod,
  currentGranularity,
  restrictedMode = false,
}: PeriodSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const createQueryString = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      return params.toString();
    },
    [searchParams]
  );

  function handlePeriodChange(period: string) {
    const updates: Record<string, string | null> = { period };
    if (period !== "custom") {
      updates.date_from = null;
      updates.date_to = null;
    }
    router.push(`${pathname}?${createQueryString(updates)}`);
  }

  function handleGranularityChange(granularity: string) {
    router.push(`${pathname}?${createQueryString({ granularity })}`);
  }

  function handleDateChange(key: "date_from" | "date_to", value: string) {
    router.push(`${pathname}?${createQueryString({ [key]: value })}`);
  }

  // In restricted mode, force the "7j" button to appear selected no matter
  // what the URL says; the page also forces period=7d server-side so this
  // is just a visual guarantee.
  const effectivePeriod = restrictedMode ? "7d" : currentPeriod;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {periods.map((p) => {
          const disabled = restrictedMode && !p.alwaysAvailable;
          const selected = effectivePeriod === p.value;
          const baseClasses =
            "px-3 py-1.5 text-sm font-medium rounded-full transition-colors";

          if (disabled) {
            return (
              <button
                key={p.value}
                type="button"
                disabled
                aria-disabled="true"
                title="Non disponible dans votre offre"
                className={`${baseClasses} bg-white text-gray-400 border border-gray-200 opacity-50 cursor-not-allowed`}
              >
                {p.label}
              </button>
            );
          }

          return (
            <button
              key={p.value}
              type="button"
              onClick={() => handlePeriodChange(p.value)}
              className={`${baseClasses} ${
                selected
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          );
        })}

        {!restrictedMode && currentPeriod === "custom" && (
          <div className="flex items-center gap-2 ml-3">
            <input
              type="date"
              value={searchParams.get("date_from") ?? ""}
              onChange={(e) => handleDateChange("date_from", e.target.value)}
              className="px-2 py-1 text-sm border border-gray-200 rounded-md"
            />
            <span className="text-gray-400 text-sm">-</span>
            <input
              type="date"
              value={searchParams.get("date_to") ?? ""}
              onChange={(e) => handleDateChange("date_to", e.target.value)}
              className="px-2 py-1 text-sm border border-gray-200 rounded-md"
            />
          </div>
        )}
      </div>

      {!restrictedMode && currentGranularity && (
        <div className="flex items-center gap-1">
          {granularities.map((g) => (
            <button
              key={g.value}
              onClick={() => handleGranularityChange(g.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                currentGranularity === g.value
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
