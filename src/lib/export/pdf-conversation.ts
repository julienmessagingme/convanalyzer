/**
 * Conversation summary PDF generator with Mieux Assure branding.
 * Summary only - no individual messages (per user decision).
 * Uses dynamic imports to avoid bundle bloat.
 */

import type { Conversation } from "@/types/database";
import { getScoreLevel, scoreLabelsFr } from "@/lib/utils/scores";
import { loadLogoAsBase64 } from "@/lib/utils/logo";

export interface ConversationPdfData {
  conversation: Conversation;
  tags?: string[];
  failureReasons: string[];
}

export async function generateConversationPdf(data: ConversationPdfData) {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const generationDate = new Date().toLocaleDateString("fr-FR");
  let y = 15;

  // Header: logo + title
  const logoBase64 = await loadLogoAsBase64();
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", 14, y, 30, 15);
    y += 5;
  }
  doc.setFontSize(20);
  doc.setTextColor(31, 41, 55); // gray-800
  doc.text("Resume de Conversation", logoBase64 ? 50 : 14, y + 8);
  y += 20;

  // Subtitle
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128); // gray-500
  doc.text(`Genere le ${generationDate}`, 14, y);
  y += 10;

  // Info table
  const conv = data.conversation;
  const convDate = conv.started_at
    ? new Date(conv.started_at).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Date inconnue";

  const scoreLevelLabel = scoreLabelsFr[getScoreLevel(conv.failure_score)];

  const infoRows: string[][] = [
    ["Type", conv.type === "bot" ? "Bot" : "Agent"],
    ["Score", `${conv.failure_score.toFixed(1)} (${scoreLevelLabel})`],
    ["Date", convDate],
    ["Nombre de messages", String(conv.message_count)],
    ["Statut scoring", conv.scoring_status || "Non evalue"],
  ];

  if (data.tags && data.tags.length > 0) {
    infoRows.push(["Tags", data.tags.join(", ")]);
  }

  doc.setFontSize(14);
  doc.setTextColor(31, 41, 55);
  doc.text("Informations", 14, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [["Champ", "Valeur"]],
    body: infoRows,
    headStyles: { fillColor: [59, 130, 246] }, // blue-500
    styles: { fontSize: 10 },
    margin: { left: 14 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 12;

  // Failure analysis section (only if score >= 4 and reasons available)
  if (conv.failure_score >= 4 && data.failureReasons.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text("Analyse des echecs", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Raison"]],
      body: data.failureReasons.map((r) => [r]),
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 10 },
      margin: { left: 14 },
    });
  }

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175); // gray-400
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.text(
      `Mieux Assure - Page ${i}/${totalPages} | ${generationDate}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
  }

  return doc;
}
