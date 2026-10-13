// @vitest-environment node
import { describe, expect, it } from "vitest";

import { LEGAL_DOCS, LEGAL_UPDATED, legalDoc } from "./legal";

const text = (slug: string) =>
  legalDoc(slug)!.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.bullets ?? [])]).join("\n");

describe("legal documents", () => {
  it("are the three Razorpay and the law ask for, each with a date", () => {
    expect(LEGAL_DOCS.map((d) => d.slug)).toEqual(["terms", "privacy", "refunds"]);
    expect(LEGAL_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const d of LEGAL_DOCS) {
      expect(d.href).toBe(`/legal/${d.slug}`);
      expect(d.sections.length).toBeGreaterThan(3);
    }
  });

  it("describe the product as it is: strict privacy by default, nothing sent for recipes, deletion that removes everything", () => {
    const privacy = text("privacy");
    expect(privacy).toMatch(/Strict privacy is on by default/);
    expect(privacy).toMatch(/does not get a single value/);
    expect(privacy).toMatch(/Recipes, undo, redo and one-click fixes .* send nothing/);
    expect(privacy).toMatch(/Deleting your account removes all of it/);
    expect(privacy).toMatch(/Razorpay/);
    expect(privacy).toMatch(/Gemini/);
  });

  it("promise nothing the code cannot keep", () => {
    const all = LEGAL_DOCS.map((d) => text(d.slug)).join("\n");
    // Whether the model trains on requests is the provider's call, not ours
    expect(all).not.toMatch(/never trains/i);
    // A user can cancel and keep the paid period; there is no pro-rata refund
    expect(text("refunds")).toMatch(/keep Pro until the end of the period/);
    expect(text("refunds")).toMatch(/do not refund the unused part/);
    expect(text("terms")).toMatch(/at least 18/);
  });

  it("use the product's words and no em dash", () => {
    const all = LEGAL_DOCS.map((d) => text(d.slug)).join("\n");
    expect(all).not.toMatch(/—/);
    expect(all).not.toMatch(/\btransform/i);
    expect(all).not.toMatch(/\brevert/i);
  });
});
