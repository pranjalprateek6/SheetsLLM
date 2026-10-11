import { describe, expect, it } from "vitest";

import { parseJsonOrLines } from "./JsonToCsvTool";

describe("parseJsonOrLines", () => {
  it("reads ordinary JSON", () => {
    expect(parseJsonOrLines('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("reads JSON Lines, one object per line, blank lines ignored", () => {
    expect(parseJsonOrLines('{"a":1}\n\n{"a":2}\r\n')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("reports the JSON error when it is neither", () => {
    expect(() => parseJsonOrLines('{"a":1}\n{oops')).toThrow(SyntaxError);
  });
});
