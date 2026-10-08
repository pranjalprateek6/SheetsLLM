/** A suggested next step: what the chip says, and what clicking it sends. */
export type Suggestion = { text: string; instruction: string };

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
      const { text, instruction } = item as Record<string, unknown>;
      if (typeof text === "string" && text.trim()) {
        out.push({
          text,
          instruction: typeof instruction === "string" && instruction.trim() ? instruction : text,
        });
      }
    }
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}
