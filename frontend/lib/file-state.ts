/** The fields GET /files adds to each row (backend db.file_states). */
export type FileState = {
  row_count: number;
  step_count?: number;
  recipe_name?: string | null;
  last_exported_at?: string | null;
  original_row_count?: number | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Fixed abbreviations: ICU versions disagree on "Sep" versus "Sept"
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * What state a file is in, in one line:
 * "9,412 rows (uploaded 10,000) · 6 steps · Monthly orders · exported 3 Sep".
 * Parts that are unknown or unremarkable are left out, never guessed.
 */
export function describeFileState(f: FileState): string {
  const parts: string[] = [];
  const rows = `${f.row_count.toLocaleString()} rows`;
  parts.push(
    typeof f.original_row_count === "number" && f.original_row_count !== f.row_count
      ? `${rows} (uploaded ${f.original_row_count.toLocaleString()})`
      : rows,
  );
  if (typeof f.step_count === "number") {
    parts.push(f.step_count === 0 ? "untouched" : `${f.step_count} step${f.step_count === 1 ? "" : "s"}`);
  }
  if (f.recipe_name) parts.push(f.recipe_name);
  if (f.last_exported_at) {
    const when = shortDate(f.last_exported_at);
    if (when) parts.push(`exported ${when}`);
  }
  return parts.join(" · ");
}
