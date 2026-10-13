// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CHANGELOG } from "./changelog";
import { HELP_SECTIONS, ONE_CLICK_FIXES, helpSection } from "./help";

describe("help", () => {
  it("has the sections the app links to", () => {
    for (const id of ["start", "chef", "fixes", "recipes", "history", "privacy", "plans", "shortcuts"]) {
      expect(helpSection(id)?.items.length ?? 0).toBeGreaterThan(2);
    }
    expect(new Set(HELP_SECTIONS.map((s) => s.id)).size).toBe(HELP_SECTIONS.length);
  });

  it("lists every fix the column menu offers, by the menu's words", () => {
    const grid = readFileSync(join(__dirname, "..", "DataGrid.tsx"), "utf-8");
    for (const f of ONE_CLICK_FIXES) expect(grid, f.name).toContain(f.name);
  });

  it("says the plan numbers the plans module says", () => {
    const plans = helpSection("plans")!.items.join("\n");
    expect(plans).toMatch(/Free: 50 uploads and 200 AI requests a month, 1 saved recipe\./);
    expect(plans).toMatch(/Pro: 1,000 uploads and 5,000 AI requests a month, unlimited saved recipes\./);
  });
});

describe("changelog", () => {
  it("is dated, newest first, with something in every entry", () => {
    const dates = CHANGELOG.map((e) => e.date);
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(CHANGELOG.every((e) => e.items.length > 0 && e.title.length > 10)).toBe(true);
  });
});
