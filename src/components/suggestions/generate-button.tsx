"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle } from "lucide-react";

interface GenerateButtonProps {
  workspaceId: string;
}

export function GenerateButton({ workspaceId }: GenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  // Timer during generation
  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setSuccess(false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const res = await fetch(`${basePath}/api/suggestions/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.NEXT_PUBLIC_INTERNAL_API_KEY ?? "",
        },
        body: JSON.stringify({ workspace_id: workspaceId }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erreur lors de la generation");
      }

      setSuccess(true);
      router.refresh();
      // Auto-hide success after 5s
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Timeout: la generation a depasse 90 secondes. Reessayez.");
      } else {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading
          ? `Generation en cours... (${elapsed}s)`
          : "Generer les suggestions"}
      </button>
      {success && (
        <span className="inline-flex items-center gap-1 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          Suggestions generees avec succes
        </span>
      )}
      {error && (
        <span className="text-sm text-red-600">{error}</span>
      )}
    </div>
  );
}
