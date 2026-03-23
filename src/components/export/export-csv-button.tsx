"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  generateConversationsCsv,
  downloadBlob,
  type CsvConversationRow,
} from "@/lib/export/csv";

interface ExportCsvButtonProps {
  conversations: CsvConversationRow[];
}

export function ExportCsvButton({ conversations }: ExportCsvButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const csv = generateConversationsCsv(conversations);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `conversations-export-${date}.csv`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading || conversations.length === 0}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Exporter CSV
    </button>
  );
}
