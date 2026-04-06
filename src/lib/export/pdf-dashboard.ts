/**
 * Dashboard PDF report generator with Mieux Assure branding.
 * Uses dynamic imports to avoid bundle bloat.
 */

import { loadLogoAsBase64 } from "@/lib/utils/logo";

export interface DashboardPdfData {
  period: string;
  metrics: {
    totalConversations: number;
    botConversations: number;
    agentConversations: number;
    escalatedConversations: number;
    tauxTransfert: number;
  };
  tags: Array<{ label: string; conversation_count: number }>;
  trendData: Array<{
    date: string;
    conversations: number;
    failures: number;
    tauxEchec: number;
  }>;
}

export async function generateDashboardPdf(data: DashboardPdfData) {
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
  doc.text("Rapport Dashboard", logoBase64 ? 50 : 14, y + 8);
  y += 20;

  // Subtitle: period + date
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128); // gray-500
  doc.text(`Periode: ${data.period} | Genere le ${generationDate}`, 14, y);
  y += 10;

  // KPIs table
  doc.setFontSize(14);
  doc.setTextColor(31, 41, 55);
  doc.text("Indicateurs cles", 14, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [["Metrique", "Valeur"]],
    body: [
      ["Conversations totales", String(data.metrics.totalConversations)],
      ["Transferees a un humain", String(data.metrics.escalatedConversations)],
      ["Taux de transfert", `${data.metrics.tauxTransfert.toFixed(1)}%`],
    ],
    headStyles: { fillColor: [59, 130, 246] }, // blue-500
    styles: { fontSize: 10 },
    margin: { left: 14 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 12;

  // Trend data table
  if (data.trendData.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text("Tendances", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Date", "Conversations", "Echecs", "Taux d'echec"]],
      body: data.trendData.map((row) => [
        row.date,
        String(row.conversations),
        String(row.failures),
        `${row.tauxEchec.toFixed(1)}%`,
      ]),
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 },
      margin: { left: 14 },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Tags table
  if (data.tags.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text("Tags", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Tag", "Conversations"]],
      body: data.tags.map((t) => [
        t.label,
        String(t.conversation_count),
      ]),
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
