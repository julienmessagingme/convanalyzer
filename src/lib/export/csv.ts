/**
 * CSV export utility for conversations.
 * Produces UTF-8 BOM-prefixed CSV for proper French character rendering in Excel.
 */

/** Escape a field per RFC 4180: quote if it contains commas, quotes, or newlines */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface CsvConversationRow {
  created_at: string;
  topic: string;
  failure_score: number;
  resume: string;
}

/**
 * Generate CSV string with UTF-8 BOM for Excel French compatibility.
 * Columns: Date, Topic, Score, Resume (per locked decision).
 */
export function generateConversationsCsv(conversations: CsvConversationRow[]): string {
  const BOM = "\uFEFF";
  const headers = ["Date", "Topic", "Score", "Resume"];
  const headerRow = headers.map(escapeCsvField).join(",");

  const rows = conversations.map((c) => {
    const date = c.created_at ? new Date(c.created_at).toLocaleDateString("fr-FR") : "";
    const resume = c.resume.length > 200 ? c.resume.slice(0, 200) + "..." : c.resume;
    return [date, c.topic, c.failure_score, resume].map(escapeCsvField).join(",");
  });

  return BOM + [headerRow, ...rows].join("\r\n");
}

/** Trigger a browser download from a Blob */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
