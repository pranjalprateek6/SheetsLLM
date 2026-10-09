import { describe, expect, it } from "vitest";

import { exportFileName, fileStem } from "./export";

const OCT_9 = new Date(2026, 9, 9);

describe("exportFileName", () => {
  it("keeps the file's own name at zero steps", () => {
    expect(exportFileName("orders", 0, "csv", OCT_9)).toBe("orders.csv");
  });

  it("says a cleaned export is cleaned, with steps and date", () => {
    expect(exportFileName("orders", 6, "csv", OCT_9)).toBe("orders_cleaned_6steps_2026-10-09.csv");
  });

  it("singular for one step", () => {
    expect(exportFileName("orders", 1, "csv", OCT_9)).toBe("orders_cleaned_1step_2026-10-09.csv");
  });

  it.each(["csv", "tsv", "json", "parquet", "xlsx"])("uses the %s extension", (fmt) => {
    expect(exportFileName("orders", 2, fmt, OCT_9).endsWith(`.${fmt}`)).toBe(true);
  });

  it("pads month and day", () => {
    expect(exportFileName("a", 3, "csv", new Date(2026, 0, 5))).toBe("a_cleaned_3steps_2026-01-05.csv");
  });
});

describe("fileStem", () => {
  it("drops only the last extension", () => {
    expect(fileStem("orders.oct.csv")).toBe("orders.oct");
    expect(fileStem("orders")).toBe("orders");
  });
});
