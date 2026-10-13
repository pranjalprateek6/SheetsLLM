import { describe, expect, it } from "vitest";

import { describePaste, pastedToFile } from "./paste";

describe("paste", () => {
  it("reads a spreadsheet paste as tab-separated", async () => {
    const text = "Name\tAmount\r\nAnn\t10\r\nBen\t20\r\n";
    expect(describePaste(text)).toEqual({ rows: 3, delimiter: "tab" });
    const file = pastedToFile(text);
    expect(file?.name).toBe("pasted.tsv");
    expect(await file!.text()).toBe("Name\tAmount\nAnn\t10\nBen\t20\n");
  });

  it("reads commas and semicolons as csv", () => {
    expect(describePaste("a,b\n1,2")).toEqual({ rows: 2, delimiter: "comma" });
    expect(pastedToFile("a,b\n1,2")?.name).toBe("pasted.csv");
    expect(describePaste("a;b\n1;2")).toEqual({ rows: 2, delimiter: "semicolon" });
    expect(pastedToFile("a;b\n1;2")?.name).toBe("pasted.csv");
  });

  it("has nothing for an empty paste", () => {
    expect(describePaste("   \n\n")).toBeNull();
    expect(pastedToFile("")).toBeNull();
  });
});
