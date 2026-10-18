import { describe, expect, it } from "vitest";

import {
  compareTables,
  extractMatches,
  fillDown,
  sortNumber,
  sortTable,
  toHtmlTable,
  toMarkdown,
  toSheetRows,
  toSql,
  transposeTable,
  validateTable,
} from "./tool-ops-more";

const t = (headers: string[], rows: string[][]) => ({ headers, rows });

describe("transposeTable", () => {
  it("turns rows into columns, the first column becoming the headers", () => {
    const out = transposeTable(t(["Metric", "Jan", "Feb"], [["Sales", "10", "12"], ["Costs", "4", "5"]]));
    expect(out.headers).toEqual(["Metric", "Sales", "Costs"]);
    expect(out.rows).toEqual([["Jan", "10", "4"], ["Feb", "12", "5"]]);
  });
});

describe("sortTable", () => {
  const data = t(["Item", "Amount"], [["Item 10", "1,200"], ["Item 2", ""], ["Item 1", "35"], ["item 3", "900.5"]]);

  it("sorts numbers as numbers, with empty cells last either way", () => {
    expect(sortTable(data, [{ column: 1 }]).rows.map((r) => r[1])).toEqual(["35", "900.5", "1,200", ""]);
    expect(sortTable(data, [{ column: 1, descending: true }]).rows.map((r) => r[1])).toEqual(["1,200", "900.5", "35", ""]);
  });

  it("sorts text in natural order and ignores case", () => {
    expect(sortTable(data, [{ column: 0 }]).rows.map((r) => r[0])).toEqual(["Item 1", "Item 2", "item 3", "Item 10"]);
  });

  it("breaks ties with the next key and keeps order otherwise", () => {
    const d = t(["Region", "N"], [["East", "2"], ["West", "1"], ["East", "1"], ["West", "1"]]);
    const out = sortTable(d, [{ column: 0 }, { column: 1 }]);
    expect(out.rows).toEqual([["East", "1"], ["East", "2"], ["West", "1"], ["West", "1"]]);
  });

  it("reads amounts the way a person writes them", () => {
    expect(sortNumber("$1,234.50")).toBe(1234.5);
    expect(sortNumber("12%")).toBe(12);
    expect(sortNumber("abc")).toBeNull();
  });
});

describe("fillDown", () => {
  it("fills empty cells from the row above, only in the chosen columns", () => {
    const out = fillDown(t(["Group", "Item"], [["A", "x"], ["", "y"], [" ", ""], ["B", "z"], ["", "w"]]), [0]);
    expect(out.rows.map((r) => r[0])).toEqual(["A", "A", "A", "B", "B"]);
    expect(out.rows[2][1]).toBe("");
    expect(out.changed).toBe(3);
  });

  it("leaves leading empty cells alone", () => {
    expect(fillDown(t(["G"], [[""], ["A"]]), [0]).rows).toEqual([[""], ["A"]]);
  });
});

describe("extractMatches", () => {
  const notes = t(["Notes", "Other"], [
    ["Write to Ana@Example.com or bob@shop.co.uk", "see https://shop.example.com/a?b=1."],
    ["again ana@example.com, call +91 98765 43210", "www.example.org"],
    ["phone (022) 2345-6789 and 12345", ""],
  ]);

  it("finds emails once each, lower-cased, with counts and first row", () => {
    expect(extractMatches(notes, "email")).toEqual([
      { value: "ana@example.com", count: 2, firstRow: 1 },
      { value: "bob@shop.co.uk", count: 1, firstRow: 1 },
    ]);
  });

  it("finds links without trailing punctuation", () => {
    expect(extractMatches(notes, "url").map((m) => m.value)).toEqual(["https://shop.example.com/a?b=1", "www.example.org"]);
  });

  it("finds phone numbers of 8 to 15 digits, keeping a leading +", () => {
    expect(extractMatches(notes, "phone").map((m) => m.value)).toEqual(["+919876543210", "02223456789"]);
  });

  it("looks only in the chosen columns", () => {
    expect(extractMatches(notes, "url", [0])).toEqual([]);
  });
});

describe("compareTables", () => {
  const before = t(["ID", "Name", "Price"], [["1", "Pen", "10"], ["2", "Ink", "40"], ["3", "Pad", "25"]]);
  const after = t(["ID", "Name", "Price", "Stock"], [["1", "Pen", "12", "5"], ["3", "Pad", "25", "0"], ["4", "Cap", "8", "9"]]);

  it("matches rows on a key and lists cell changes", () => {
    const c = compareTables(before, after, "ID");
    expect(c.added).toEqual([["4", "Cap", "8"]]);
    expect(c.removed).toEqual([["2", "Ink", "40"]]);
    expect(c.changed).toEqual([{ key: "1", column: "Price", before: "10", after: "12" }]);
    expect(c.same).toBe(1);
    expect(c.onlyAfter).toEqual(["Stock"]);
  });

  it("without a key, compares whole rows, counting repeats", () => {
    const a = t(["A"], [["x"], ["x"], ["y"]]);
    const b = t(["A"], [["x"], ["z"]]);
    const c = compareTables(a, b);
    expect(c.same).toBe(1);
    expect(c.added).toEqual([["z"]]);
    expect(c.removed.sort()).toEqual([["x"], ["y"]]);
  });

  it("flags a key that repeats", () => {
    const c = compareTables(t(["ID"], [["1"], ["1"]]), t(["ID"], [["1"]]), "ID");
    expect(c.duplicateKeys).toEqual(["1"]);
  });
});

describe("validateTable", () => {
  it("reports shape, duplicates, empty rows, blanks, kinds and stray spaces", () => {
    const v = validateTable(t(["ID", "Date", "Amount", "Amount"], [
      ["1", "2026-10-01", "100", "x"],
      ["2", "01/10/2026", " 200", "y"],
      ["1", "2026-10-01", "100", "x"],
      ["", "", "", ""],
      ["3", "", "abc", "z"],
    ]));
    expect(v.rows).toBe(5);
    expect(v.duplicateRows).toBe(1);
    expect(v.emptyRows).toBe(1);
    expect(v.duplicateHeaders).toEqual(["Amount"]);
    const byName = Object.fromEntries(v.columnsChecked.map((c) => [c.name, c]));
    expect(byName.ID.kind).toBe("number");
    expect(byName.Date.kind).toBe("date");
    expect(byName.Date.empty).toBe(2);
    expect(v.columnsChecked[2].kind).toBe("mixed");
    expect(v.columnsChecked[2].padded).toBe(1);
    expect(v.findings[0]).toMatch(/share a name/);
  });
});

describe("toSql", () => {
  it("writes a CREATE TABLE with inferred types and batched INSERTs", () => {
    const sql = toSql(t(["id", "name", "price", "active"], [["1", "O'Neil", "9.5", "true"], ["2", "", "10", "false"], ["3", "Ann", "", "true"]]), {
      name: "items", batch: 2,
    });
    expect(sql).toContain('CREATE TABLE "items" (');
    expect(sql).toContain('"id" BIGINT');
    expect(sql).toContain('"price" DOUBLE PRECISION');
    expect(sql).toContain('"active" BOOLEAN');
    expect(sql).toContain("(1, 'O''Neil', 9.5, TRUE)");
    expect(sql).toContain("(2, NULL, 10, FALSE)");
    expect(sql.match(/INSERT INTO/g)).toHaveLength(2);
  });

  it("quotes for MySQL and writes booleans as 1/0 for SQLite", () => {
    expect(toSql(t(["a b"], [["x"]]), { dialect: "mysql" })).toContain("`a b` TEXT");
    expect(toSql(t(["ok"], [["true"]]), { dialect: "sqlite" })).toContain("(1)");
  });

  it("keeps leading-zero codes as text", () => {
    expect(toSql(t(["zip"], [["01234"], ["99999"]]))).toContain('"zip" TEXT');
  });
});

describe("toMarkdown and toHtmlTable", () => {
  const data = t(["Name", "Amount"], [["a|b", "10"], ["<c>", "2"]]);

  it("escapes pipes and right-aligns number columns", () => {
    const md = toMarkdown(data);
    expect(md.split("\n")[1]).toBe("| --- | ---: |");
    expect(md).toContain("| a\\|b | 10 |");
  });

  it("escapes HTML in every cell", () => {
    const html = toHtmlTable(data);
    expect(html).toContain("<th>Name</th>");
    expect(html).toContain("<td>&lt;c&gt;</td>");
  });
});

describe("toSheetRows", () => {
  it("keeps numbers as numbers and codes with leading zeros as text", () => {
    expect(toSheetRows(t(["id", "zip", "ok", "note"], [["7", "0123", "true", ""]]))).toEqual([
      ["id", "zip", "ok", "note"],
      [7, "0123", true, null],
    ]);
  });
});

describe("output escaping", () => {
  it("MySQL doubles backslashes so a value cannot end its own string", () => {
    const BS = String.fromCharCode(92);
    const sql = toSql(t(["v"], [[`a${BS}`], [`x${BS}'); DROP TABLE t; --`]]), { dialect: "mysql", create: false });
    expect(sql).toContain(`('a${BS}${BS}')`);
    // The backslash is doubled and the quote doubled, so the value stays one string
    expect(sql).toContain(`('x${BS}${BS}''); DROP TABLE t; --')`);
    // PostgreSQL and SQLite take backslashes literally, so they stay single
    expect(toSql(t(["v"], [[`a${BS}`]]), { create: false })).toContain(`('a${BS}')`);
  });

  it("Markdown cells are HTML-escaped", () => {
    const md = toMarkdown(t(["Note"], [['<img src=x onerror="alert(1)">'], ["a & b"]]));
    expect(md).not.toContain("<img");
    expect(md).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(md).toContain("a &amp; b");
  });
});
