/** A suggested next step: what clicking it does, what it sends, and the
 *  finding behind it ("21% of Region is empty"), when there is one. */
export type Suggestion = { text: string; instruction: string; detail?: string };

const MAX_SUGGESTIONS = 6;

/**
 * Normalise every suggestion shape the app meets into Suggestion[]:
 * the insights response (`{insights: {suggestions: [{text, instruction}]}}`),
 * the bare insights object an upload carries (`{suggestions: [...]}`), or a
 * plain list of strings (the curated sample-file prompts, where the chip text
 * is also the instruction). Anything unrecognised yields [].
 */
export function toSuggestions(source: unknown): Suggestion[] {
  if (!source) return [];
  let list: unknown = source;
  if (!Array.isArray(list) && typeof list === "object") {
    const obj = list as Record<string, unknown>;
    const inner = (obj.insights as Record<string, unknown> | undefined) ?? obj;
    list = inner?.suggestions;
  }
  if (!Array.isArray(list)) return [];
  const out: Suggestion[] = [];
  for (const item of list) {
    if (typeof item === "string" && item.trim()) {
      out.push({ text: item, instruction: item });
    } else if (item && typeof item === "object") {
      const { text, instruction, detail } = item as Record<string, unknown>;
      if (typeof text === "string" && text.trim()) {
        out.push({
          text,
          instruction: typeof instruction === "string" && instruction.trim() ? instruction : text,
          ...(typeof detail === "string" && detail.trim() ? { detail } : {}),
        });
      }
    }
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

/**
 * Next steps when the file has nothing to fix, from its columns alone (no AI
 * call to come up with them): sort by a date, count by a category, or ask
 * Chef for a summary. At most three.
 */
export function ideasFor(columns: { name: string; dtype?: string }[]): Suggestion[] {
  const out: Suggestion[] = [];
  const date = columns.find((c) => /DATE|TIME/i.test(c.dtype ?? "") || /date|time|_at$|_on$/i.test(c.name));
  if (date) {
    out.push({
      text: `Sort by ${date.name}, newest first`,
      instruction: `sort by ${date.name} descending`,
      detail: "The latest rows at the top",
    });
  }
  const category = columns.find(
    (c) => /VARCHAR|TEXT|STRING/i.test(c.dtype ?? "VARCHAR") && c !== date && !/id$|^id\b|email|name|phone|note|comment/i.test(c.name),
  );
  if (category) {
    out.push({
      text: `Count the rows for each ${category.name}`,
      instruction: `How many rows are there for each ${category.name}?`,
      detail: "An answer, the file stays as it is",
    });
  }
  out.push({
    text: "Summarise this file",
    instruction: "Summarise this file: what each column holds, and anything that looks off",
    detail: "What each column holds, and anything that looks off",
  });
  return out.slice(0, 3);
}
