import { WORD_BOUNDARY } from "../constants/text-processing";

export class KeywordParser {
  parse(raw: string): string[] {
    if (!raw || raw.trim().length === 0) {
      throw new Error("Keyword input must not be empty.");
    }

    const keywords = raw.split(/[\n,]/u).flatMap((segment) =>
      segment
        .split(WORD_BOUNDARY)
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean),
    );

    if (keywords.length === 0) {
      throw new Error("Keyword input must not be empty.");
    }

    if (this.containsSentence(raw, keywords)) {
      throw new Error(
        "Keyword input must be provided as short keywords, not full sentences.",
      );
    }

    return Array.from(new Set(keywords));
  }

  private containsSentence(raw: string, tokens: string[]): boolean {
    const hasDelimiter = /[,;\n]/u.test(raw);
    const spaceSeparated = raw.trim().split(/\s+/u);
    const includesStopWord = tokens.some((token) => STOP_WORDS.has(token));

    // If delimiters are present, allow many keywords (up to 20)
    // This supports comma-separated keyword lists like "summer, sun, beach, ocean"
    if (hasDelimiter) {
      return tokens.length > 20 || includesStopWord;
    }

    // Without delimiters, be more strict to detect sentences
    // Space-separated input with 4+ words or 6+ tokens is likely a sentence
    if (spaceSeparated.length >= 4 || tokens.length >= 6) {
      return true;
    }

    return includesStopWord;
  }
}

const STOP_WORDS = new Set([
  "about",
  "for",
  "from",
  "have",
  "here",
  "icon",
  "icons",
  "please",
  "show",
  "tell",
  "that",
  "the",
  "what",
  "with",
]);
