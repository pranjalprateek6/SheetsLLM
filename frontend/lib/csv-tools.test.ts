import { describe, expect, it } from "vitest";

import {
  LARGE_FILE_BYTES,
  baseName,
  formatBytes,
  inSlices,
  parseCsvFile,
  plural,
  toCsvAsync,
} from "./csv-tools";

const csvFile = (text: string, name = "t.csv") => new File([text], name, { type: "text/csv" });

describe("parseCsvFile", () => {
  it("parses headers and rows with no warnings", async () => {
    const t = await parseCsvFile(csvFile("a,b\n1,2\n3,4\n"));
    expect(t.headers).toEqual(["a", "b"]);
    expect(t.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(t.warnings).toEqual([]);
  });

  it("strips a UTF-8 BOM from the first header", async () => {
    const t = await parseCsvFile(csvFile("﻿a,b\n1,2\n"));
    expect(t.headers[0]).toBe("a");
  });

  it("names the headers a wider row needs and says nothing was dropped", async () => {
    const t = await parseCsvFile(csvFile("a,b\n1,2,3\n"));
    expect(t.headers).toEqual(["a", "b", "Column 3"]);
    expect(t.rows).toEqual([["1", "2", "3"]]);
    expect(t.warnings).toHaveLength(1);
    expect(t.warnings[0]).toMatch(/Column 3/);
    expect(t.warnings[0]).toMatch(/Nothing was dropped/);
  });

  it("surfaces malformed CSV as a warning with a row number", async () => {
    const t = await parseCsvFile(csvFile('a,b\n"unterminated,2\n'));
    expect(t.warnings.length).toBeGreaterThanOrEqual(1);
    expect(t.warnings[0]).toMatch(/^Row \d+:/);
  });

  it("rejects an empty file", async () => {
    await expect(parseCsvFile(csvFile(""))).rejects.toThrow(/empty/);
  });

  it("reports progress from 0 toward 1 and ends at 1", async () => {
    const seen: number[] = [];
    await parseCsvFile(csvFile("a,b\n1,2\n"), (f) => seen.push(f));
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((f) => f >= 0 && f <= 1)).toBe(true);
    expect([...seen].sort((x, y) => x - y)).toEqual(seen);
  });
});

describe("toCsvAsync", () => {
  it("pads and clips every row to the header width, CRLF-joined", async () => {
    const csv = await toCsvAsync({ headers: ["a", "b"], rows: [["1", "2"], ["3"], ["5", "6", "7"]] });
    expect(csv).toBe("a,b\r\n1,2\r\n3,\r\n5,6");
  });

  it("writes only the header when there are no rows", async () => {
    expect(await toCsvAsync({ headers: ["a", "b"], rows: [] })).toBe("a,b");
  });

  it("round-trips through parseCsvFile", async () => {
    const original = { headers: ["name", "note"], rows: [["Ada", "says \"hi\""], ["Grace", "a, b"]] };
    const csv = await toCsvAsync(original);
    const back = await parseCsvFile(csvFile(csv));
    expect(back.headers).toEqual(original.headers);
    expect(back.rows).toEqual(original.rows);
  });
});

describe("inSlices", () => {
  it("covers the whole range in slices and reports progress to 1", async () => {
    const ranges: [number, number][] = [];
    const progress: number[] = [];
    await inSlices(25_000, (s, e) => ranges.push([s, e]), (f) => progress.push(f));
    expect(ranges[0][0]).toBe(0);
    expect(ranges.at(-1)![1]).toBe(25_000);
    // contiguous, no overlap
    for (let i = 1; i < ranges.length; i++) expect(ranges[i][0]).toBe(ranges[i - 1][1]);
    expect(ranges.length).toBeGreaterThan(1);
    expect(progress.at(-1)).toBe(1);
  });

  it("does no work and still reports 1 for an empty range", async () => {
    const progress: number[] = [];
    let calls = 0;
    await inSlices(0, () => calls++, (f) => progress.push(f));
    expect(calls).toBe(0);
    expect(progress).toEqual([1]);
  });
});

describe("helpers", () => {
  it("formatBytes picks the unit and one decimal below 10", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(LARGE_FILE_BYTES)).toBe("50 MB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
  });

  it("baseName drops only the last extension", () => {
    expect(baseName("orders.2026.csv")).toBe("orders.2026");
    expect(baseName("noext")).toBe("noext");
  });

  it("plural agrees with the count", () => {
    expect(plural(1, "row")).toBe("1 row");
    expect(plural(2, "row")).toBe("2 rows");
    expect(plural(1200, "row")).toBe("1,200 rows");
  });
});
