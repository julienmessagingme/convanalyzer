"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
// Import types from the dedicated types file (pdf-types.ts) — NOT from
// pdf-dashboard.ts / pdf-conversation.ts. The latter import jspdf, and
// Next 14 NFT would otherwise pull jspdf (~880 KB) into every server
// bundle that renders this client component.
import type {
  DashboardPdfData,
  ConversationPdfData,
} from "@/lib/export/pdf-types";

type ExportPdfButtonProps =
  | {
      variant: "dashboard";
      data: DashboardPdfData;
      convId?: never;
    }
  | {
      variant: "conversation";
      data: ConversationPdfData;
      convId: string;
    };

export function ExportPdfButton(props: ExportPdfButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      if (props.variant === "dashboard") {
        const { generateDashboardPdf } = await import(
          "@/lib/export/pdf-dashboard"
        );
        const doc = await generateDashboardPdf(props.data);
        const date = new Date().toISOString().slice(0, 10);
        doc.save(`dashboard-report-${date}.pdf`);
      } else {
        const { generateConversationPdf } = await import(
          "@/lib/export/pdf-conversation"
        );
        const doc = await generateConversationPdf(props.data);
        doc.save(`conversation-${props.convId}-summary.pdf`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Exporter PDF
    </button>
  );
}
