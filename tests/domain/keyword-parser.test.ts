import { describe, expect, it } from "vitest";
import { KeywordParser } from "../../src/domain/services/keyword-parser";

describe("KeywordParser", () => {
  it("splits comma separated keywords and normalises case", () => {
    const parser = new KeywordParser();
    expect(parser.parse("Layout, GRID, design")).toEqual([
      "layout",
      "grid",
      "design",
    ]);
  });

  it("handles unicode punctuation and strips blanks", () => {
    const parser = new KeywordParser();
    expect(parser.parse("导航 / 菜单; UI")).toEqual(["导航", "菜单", "ui"]);
  });

  it("throws when sentences are provided instead of keywords", () => {
    const parser = new KeywordParser();
    expect(() => parser.parse("Show me icons for layouts")).toThrowError(
      "Keyword input must be provided as short keywords, not full sentences.",
    );
  });
});
