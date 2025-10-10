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

  it("allows many comma-separated keywords (up to 20)", () => {
    const parser = new KeywordParser();
    const result = parser.parse(
      "summer, sun, beach, ocean, wave, palm, tropical, vacation, hot, sunny",
    );
    expect(result).toEqual([
      "summer",
      "sun",
      "beach",
      "ocean",
      "wave",
      "palm",
      "tropical",
      "vacation",
      "hot",
      "sunny",
    ]);
    expect(result.length).toBe(10);
  });

  it("throws when more than 20 comma-separated keywords are provided", () => {
    const parser = new KeywordParser();
    const tooManyKeywords = Array.from({ length: 21 }, (_, i) => `keyword${i}`).join(", ");
    expect(() => parser.parse(tooManyKeywords)).toThrowError(
      "Keyword input must be provided as short keywords, not full sentences.",
    );
  });

  it("detects sentences without delimiters (4+ space-separated words)", () => {
    const parser = new KeywordParser();
    expect(() => parser.parse("find me some layout icons")).toThrowError(
      "Keyword input must be provided as short keywords, not full sentences.",
    );
  });

  it("allows short space-separated keywords (less than 4 words)", () => {
    const parser = new KeywordParser();
    expect(parser.parse("home office building")).toEqual([
      "home",
      "office",
      "building",
    ]);
  });

  it("detects stop words even with delimiters", () => {
    const parser = new KeywordParser();
    expect(() => parser.parse("home, please, office")).toThrowError(
      "Keyword input must be provided as short keywords, not full sentences.",
    );
  });
});
