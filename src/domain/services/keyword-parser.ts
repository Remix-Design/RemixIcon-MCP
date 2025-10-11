import { WORD_BOUNDARY } from "../constants/text-processing";

// Sentence detection thresholds
const MAX_KEYWORDS_WITH_DELIMITERS = 20;
const MAX_SPACE_SEPARATED_WORDS = 4;
const MAX_TOKENS_WITHOUT_DELIMITERS = 6;

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

    // Early return: stop words indicate a sentence
    if (includesStopWord) {
      return true;
    }

    // If delimiters are present, allow many keywords (up to 20)
    // This supports comma-separated keyword lists like "summer, sun, beach, ocean"
    if (hasDelimiter) {
      return tokens.length > MAX_KEYWORDS_WITH_DELIMITERS;
    }

    // Without delimiters, be more strict to detect sentences
    // Space-separated input with 4+ words or 6+ tokens is likely a sentence
    return (
      spaceSeparated.length >= MAX_SPACE_SEPARATED_WORDS ||
      tokens.length >= MAX_TOKENS_WITHOUT_DELIMITERS
    );
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
