import FlexSearch, { type Document } from "flexsearch";
import type { IconSearchRepository } from "../../application/ports/icon-search-repository";
import type { IconMatch, IconMetadata } from "../../domain/entities/icon";
import { WORD_BOUNDARY } from "../../domain/constants/text-processing";

const FIELD_WEIGHTS: Record<string, number> = {
  name: 5,
  baseName: 4,
  tags: 3,
  usage: 2,
  category: 1,
  style: 1,
};

// Token scoring constants
const EXACT_TOKEN_MATCH_BONUS = 5;
const PREFIX_TOKEN_MATCH_BONUS = 2;

interface FlexSearchIconSearchRepositoryOptions {
  readonly icons: readonly IconMetadata[];
}

interface IndexDocument {
  id: string;
  name: string;
  baseName: string;
  tags: string;
  usage: string;
  category: string;
  style: string;
  [key: string]: string;
}

type DocumentIndex = Document<IndexDocument, false>;

export class FlexSearchIconSearchRepository implements IconSearchRepository {
  private readonly icons: readonly IconMetadata[];
  private readonly tokenIndex = new Map<string, Set<string>>();
  private readonly iconMap = new Map<string, IconMetadata>();
  private document?: DocumentIndex;

  constructor({ icons }: FlexSearchIconSearchRepositoryOptions) {
    this.icons = icons;
  }

  async initialise(): Promise<void> {
    if (this.document) {
      return;
    }

    const document = new FlexSearch.Document<IndexDocument, false>({
      tokenize: "forward",
      cache: true,
      document: {
        id: "id",
        index: ["name", "baseName", "tags", "usage", "category", "style"],
      },
    });

    for (const icon of this.icons) {
      document.add({
        id: icon.name,
        name: icon.name,
        baseName: icon.baseName,
        tags: icon.tags.join(" "),
        usage: icon.usage,
        category: icon.category,
        style: icon.style,
      });
      this.tokenIndex.set(icon.name, this.buildTokens(icon));
      this.iconMap.set(icon.name, icon);
    }

    this.document = document;
  }

  async search(keywords: string[], limit: number): Promise<IconMatch[]> {
    if (!this.document) {
      throw new Error(
        "FlexSearchIconSearchRepository must be initialised before searching.",
      );
    }

    const scores = this.calculateScores(keywords, limit);
    const ranked = this.rankResults(scores);
    return ranked.slice(0, limit);
  }

  private calculateScores(
    keywords: string[],
    limit: number,
  ): Map<string, { score: number; matched: Set<string> }> {
    const scores = new Map<string, { score: number; matched: Set<string> }>();

    for (const keyword of keywords) {
      const results = this.document!.search(keyword, {
        enrich: true,
        limit,
        suggest: true,
      });

      for (const fieldResult of results) {
        for (const entry of fieldResult.result) {
          const iconId = this.resolveIconId(entry);
          if (!iconId || !this.iconMap.get(iconId)) {
            continue;
          }

          this.updateScore(scores, iconId, fieldResult.field, keyword);
        }
      }
    }

    return scores;
  }

  private updateScore(
    scores: Map<string, { score: number; matched: Set<string> }>,
    iconId: string,
    field: string,
    keyword: string,
  ): void {
    const current = scores.get(iconId) ?? {
      score: 0,
      matched: new Set<string>(),
    };

    current.score +=
      FIELD_WEIGHTS[field as keyof typeof FIELD_WEIGHTS] ?? 1;

    this.applyTokenMatching(current, iconId, keyword);
    scores.set(iconId, current);
  }

  private applyTokenMatching(
    scoreData: { score: number; matched: Set<string> },
    iconId: string,
    keyword: string,
  ): void {
    const tokens = this.tokenIndex.get(iconId);
    if (!tokens) {
      return;
    }

    for (const token of tokens) {
      if (token === keyword) {
        scoreData.score += EXACT_TOKEN_MATCH_BONUS;
        scoreData.matched.add(token);
      } else if (token.startsWith(keyword)) {
        scoreData.score += PREFIX_TOKEN_MATCH_BONUS;
        scoreData.matched.add(token);
      }
    }
  }

  private rankResults(
    scores: Map<string, { score: number; matched: Set<string> }>,
  ): IconMatch[] {
    return Array.from(scores.entries())
      .map(([id, value]) => {
        const icon = this.iconMap.get(id);
        if (!icon) {
          throw new Error(`Icon metadata missing for id ${id}`);
        }

        return {
          icon,
          score: Number.parseFloat(value.score.toFixed(2)),
          matchedTokens: Array.from(value.matched).sort((a, b) =>
            a.localeCompare(b),
          ),
        } satisfies IconMatch;
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.icon.name.localeCompare(b.icon.name);
      });
  }

  private buildTokens(icon: IconMetadata): Set<string> {
    const tokens = new Set<string>();
    const add = (value: string | readonly string[] | undefined) => {
      if (!value) {
        return;
      }

      if (Array.isArray(value)) {
        for (const entry of value) {
          for (const token of this.tokenize(entry)) {
            tokens.add(token);
          }
        }
        return;
      }

      const scalar = value as string;
      for (const token of this.tokenize(scalar)) {
        tokens.add(token);
      }
    };

    add(icon.name);
    add(icon.baseName);
    add(icon.category);
    add(icon.style);
    add(icon.usage);
    add(icon.tags);

    return tokens;
  }

  private tokenize(value: string): string[] {
    return value
      .split(WORD_BOUNDARY)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
  }

  private resolveIconId(entry: unknown): string | undefined {
    if (typeof entry === "string") {
      return entry;
    }

    if (!entry || typeof entry !== "object") {
      return undefined;
    }

    const withId = entry as { id?: unknown };
    if (typeof withId.id === "string") {
      return withId.id;
    }

    const withDoc = entry as { doc?: unknown };
    if (withDoc.doc && typeof withDoc.doc === "object") {
      const doc = withDoc.doc as { id?: unknown };
      if (typeof doc.id === "string") {
        return doc.id;
      }
    }

    return undefined;
  }
}
