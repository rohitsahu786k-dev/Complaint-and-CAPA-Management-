import * as XLSX from "xlsx";

export type SheetRow = Record<string, string | number | boolean | null | undefined>;

function sanitiseSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Sheet1";
}

/**
 * Column widths are derived from the content so exported registers stay readable
 * without any manual resizing in Excel.
 */
function autoWidth(rows: SheetRow[]) {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).map((key) => {
    const longest = rows.reduce((max, row) => Math.max(max, String(row[key] ?? "").length), key.length);
    return { wch: Math.min(60, Math.max(10, longest + 2)) };
  });
}

export function downloadSheet(filename: string, sheetName: string, rows: SheetRow[]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = autoWidth(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, sanitiseSheetName(sheetName));
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export function downloadWorkbook(filename: string, sheets: { name: string; rows: SheetRow[] }[]) {
  const workbook = XLSX.utils.book_new();
  sheets
    .filter((entry) => entry.rows.length > 0)
    .forEach((entry) => {
      const sheet = XLSX.utils.json_to_sheet(entry.rows);
      sheet["!cols"] = autoWidth(entry.rows);
      XLSX.utils.book_append_sheet(workbook, sheet, sanitiseSheetName(entry.name));
    });
  if (workbook.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Note: "No data" }]), "Empty");
  }
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export function downloadTemplate(filename: string, columns: readonly string[], sample: SheetRow) {
  downloadSheet(filename, "Template", [Object.fromEntries(columns.map((column) => [column, sample[column] ?? ""])) as SheetRow]);
}

/** Reads the first worksheet of an uploaded file into plain rows for server-side validation. */
export async function readSheet(file: File): Promise<SheetRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const first = workbook.SheetNames[0];
  if (!first) return [];
  return XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[first], { defval: "", raw: false });
}

export function timestampedName(base: string) {
  return `${base}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}
