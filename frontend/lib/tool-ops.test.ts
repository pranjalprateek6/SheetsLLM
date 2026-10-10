import { describe, expect, it } from "vitest";

import {
  cellText,
  changeCase,
  findReplace,
  inferValue,
  mergeTables,
  pickColumns,
  sheetToGrid,
  splitColumn,
  toCase,
  toRecords,
} from "./tool-ops";

const t = (headers: string[], ...rows: string[][]) => ({ headers, rows });

describe("mergeTables", () => {
  it("lines columns up by name, fills gaps, and can name the source", () => {
    const m = mergeTables(
      [
        { name: "oct.csv", table: t(["id", "name"], ["1", "Ada"]) },
        { name: "nov.csv", table: t(["name", "id", "region"], ["Grace", "2", "East"]) },
      ],
      { source: true },
    );
    expect(m.headers).toEqual(["Source file", "id", "name", "region"]);
    expect(m.rows).toEqual([
      ["oct.csv", "1", "Ada", ""],
      ["nov.csv", "2", "Grace", "East"],
    ]);
    expect(m.added).toEqual(["region"]);
  });
});

describe("toRecords", () => {
  it("infers plain numbers and booleans but keeps IDs with leading zeros as text", () => {
    expect(inferValue("12")).toBe(12);
    expect(inferValue("-3.5")).toBe(-3.5);
    expect(inferValue("007")).toBe("007");
    expect(inferValue("1,200")).toBe("1,200");
    expect(inferValue("true")).toBe(true);
    expect(inferValue("")).toBeNull();
  });

  it("nests dotted headers on request", () => {
    const r = toRecords(t(["id", "address.city", "address.zip"], ["1", "London", "N1"]), { nest: true });
    expect(r).toEqual([{ id: 1, address: { city: "London", zip: "N1" } }]);
    const flat = toRecords(t(["id", "address.city"], ["1", "London"]), { infer: false });
    expect(flat).toEqual([{ id: "1", "address.city": "London" }]);
  });

  it("never lets a header write to the object prototype", () => {
    const r = toRecords(
      t(["__proto__.polluted", "constructor.prototype.bad", "a.__proto__", "ok.x"], ["1", "2", "3", "4"]),
      { nest: true },
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).bad).toBeUndefined();
    // Dangerous paths stay flat, literal keys; ordinary ones still nest
    expect(Object.keys(r[0])).toEqual(["__proto__.polluted", "constructor.prototype.bad", "a.__proto__", "ok"]);
    expect(r[0].ok).toEqual({ x: 4 });
    expect(JSON.parse(JSON.stringify(r[0]))["__proto__.polluted"]).toBe(1);
  });
});

describe("pickColumns", () => {
  it("keeps and reorders", () => {
    expect(pickColumns(t(["a", "b", "c"], ["1", "2", "3"]), [2, 0])).toEqual(t(["c", "a"], ["3", "1"]));
  });
});

describe("findReplace", () => {
  const data = t(["city", "note"], ["NYC", "nyc office"], ["Boston", "NYC trip"]);

  it("replaces case-insensitively across all columns and counts cells", () => {
    const r = findReplace(data, { find: "nyc", replace: "New York", columns: null });
    expect(r.rows).toEqual([
      ["New York", "New York office"],
      ["Boston", "New York trip"],
    ]);
    expect(r.changed).toBe(3);
  });

  it("respects match case, whole cell and the chosen columns", () => {
    const r = findReplace(data, { find: "NYC", replace: "New York", columns: [0], matchCase: true, wholeCell: true });
    expect(r.rows[0]).toEqual(["New York", "nyc office"]);
    expect(r.changed).toBe(1);
  });

  it("treats the find text literally and keeps $ in the replacement", () => {
    const r = findReplace(t(["p"], ["$5.00 (est)"]), { find: "(est)", replace: "$&x", columns: null });
    expect(r.rows[0][0]).toBe("$5.00 $&x");
  });
});

describe("splitColumn", () => {
  it("splits into as many columns as needed, replacing the original", () => {
    const r = splitColumn(t(["id", "name"], ["1", "Ada Lovelace"], ["2", "Grace Brewster Hopper"]), 1, " ");
    expect(r.headers).toEqual(["id", "name 1", "name 2", "name 3"]);
    expect(r.rows[0]).toEqual(["1", "Ada", "Lovelace", ""]);
  });

  it("caps the parts, keeping the rest in the last one, and names them", () => {
    const r = splitColumn(t(["name"], ["Grace Brewster Hopper"]), 0, " ", { parts: 2, keepOriginal: true, names: ["First", "Last"] });
    expect(r.headers).toEqual(["name", "First", "Last"]);
    expect(r.rows[0]).toEqual(["Grace Brewster Hopper", "Grace", "Brewster Hopper"]);
  });
});

describe("changeCase", () => {
  it("knows the four cases", () => {
    expect(toCase("hello WORLD", "upper")).toBe("HELLO WORLD");
    expect(toCase("Hello WORLD", "lower")).toBe("hello world");
    expect(toCase("mary-jane o'neil", "title")).toBe("Mary-Jane O'neil");
    expect(toCase("WELL. this IS it!  yes", "sentence")).toBe("Well. This is it!  Yes");
  });

  it("only touches the chosen columns and counts changes", () => {
    const r = changeCase(t(["a", "b"], ["ada", "x"], ["ADA", "y"]), [0], "title");
    expect(r.rows).toEqual([
      ["Ada", "x"],
      ["Ada", "y"],
    ]);
    expect(r.changed).toBe(2);
  });
});

describe("excel cells", () => {
  it("writes dates as ISO and drops trailing empty rows", () => {
    expect(cellText(new Date(Date.UTC(2026, 9, 3)))).toBe("2026-10-03");
    expect(cellText(new Date(Date.UTC(2026, 9, 3, 14, 30)))).toBe("2026-10-03T14:30:00Z");
    expect(cellText(new Date(Date.UTC(2026, 9, 4, 14, 29, 59, 999)))).toBe("2026-10-04T14:30:00Z");
    expect(cellText(new Date(Date.UTC(2026, 9, 3, 23, 59, 59, 999)))).toBe("2026-10-04");
    expect(cellText(null)).toBe("");
    const g = sheetToGrid([["id", "amount", null], [1, 9.5, "x"], [null, null, null]]);
    expect(g).toEqual({ headers: ["id", "amount", "Column 3"], rows: [["1", "9.5", "x"]] });
  });
});
