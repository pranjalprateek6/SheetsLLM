// @vitest-environment node
/**
 * The glossary, enforced. Product copy says file, step, recipe, undo, go
 * back, export, AI request and Chef, never the engine's words, and never an
 * em dash. This scans what a user can read in app/ and components/: JSX text
 * and string literals that look like prose (comments are skipped).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const DIRS = ["app", "components"];

const RULES: { name: string; re: RegExp }[] = [
  { name: "transform, transformed, transformation (say step or clean)", re: /\btransform(s|ed|ing|ations?)?\b/i },
  { name: "chain (say recipe or steps)", re: /\bchain\b/i },
  { name: "revert (say go back)", re: /\brevert(ed|s|ing)?\b/i },
  { name: "Download as (say Export as)", re: /\bDownload as\b/ },
  { name: "Sage (say Chef)", re: /\bSage\b/ },
  { name: "AI transform (say AI request)", re: /\bAI transforms?\b/i },
  { name: "unqualified 'never goes to the AI'", re: /never goes to the AI/i },
  { name: "em dash", re: /\u2014/ },
];

// file (relative to frontend/) → rule names allowed there, with the reason
const ALLOW: Record<string, string[]> = {};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "api" ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Strip comments, then collect JSX text and prose-like string literals. */
function readable(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const out: string[] = [];
  for (const m of Array.from(code.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g))) out.push(m[1]);
  for (const m of Array.from(code.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g))) {
    const text = m[2];
    // Prose has a space and a letter, and is not a class list, path or key
    if (!/\s/.test(text) || !/[A-Za-z]/.test(text)) continue;
    if (/^[\w:/.[\]()%#&>=-]+(\s+[\w:/.[\]()%#&>=!-]+)*$/.test(text) && !/[A-Z][a-z]+ [a-z]/.test(text)) continue;
    // Tailwind class lists ("inline-flex items-center ... transition-transform")
    if (/(^|\s)(inline-flex|flex|grid|items-\w+|justify-\w+|rounded(-\w+)?|text-\w+|bg-\w+|p[xy]?-\d|gap-\d|[hw]-\d)(\s|$)/.test(text)) continue;
    out.push(text);
  }
  return out;
}

describe("product copy", () => {
  const all = DIRS.flatMap((d) => files(join(ROOT, d)));

  it("finds the source to check", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  for (const rule of RULES) {
    it(`never says: ${rule.name}`, () => {
      const hits: string[] = [];
      for (const file of all) {
        const rel = relative(ROOT, file).replace(/\\/g, "/");
        if (ALLOW[rel]?.includes(rule.name)) continue;
        for (const text of readable(readFileSync(file, "utf-8"))) {
          if (rule.re.test(text)) hits.push(`${rel}: ${text.trim().slice(0, 90)}`);
        }
      }
      expect(hits).toEqual([]);
    });
  }
});
