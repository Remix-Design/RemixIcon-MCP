import type { IconMatch } from "../../domain/entities/icon";
import type { KeywordParser } from "../../domain/services/keyword-parser";
import type { IconSearchRepository } from "../ports/icon-search-repository";

interface SearchIconsUseCaseDependencies {
  readonly repository: IconSearchRepository;
  readonly parser: KeywordParser;
}

interface SearchIconsRequest {
  readonly input: string;
}

export interface SearchIconsResponse {
  readonly matches: IconMatch[];
  readonly guidance: string;
}

const FIXED_LIMIT = 5;

export class SearchIconsUseCase {
  private readonly repository: IconSearchRepository;
  private readonly parser: KeywordParser;

  constructor({
    repository,
    parser,
  }: SearchIconsUseCaseDependencies) {
    this.repository = repository;
    this.parser = parser;
  }

  async execute({
    input,
  }: SearchIconsRequest): Promise<SearchIconsResponse> {
    const keywords = this.parser.parse(input);
    const matches = await this.repository.search(keywords, FIXED_LIMIT);

    return {
      matches,
      guidance: this.buildGuidance(matches, keywords),
    };
  }

  private buildGuidance(matches: IconMatch[], keywords: string[]): string {
    if (matches.length === 0) {
      return `No icons matched the keywords: ${keywords.join(", ")}. Consider refining with specific icon tags or base names.`;
    }

    if (matches.length === 1) {
      const icon = matches[0]?.icon;
      return `Single icon match found for keywords [${keywords.join(", ")}] -> ${icon.name}. Use this icon if it suits the request.`;
    }

    return "";
  }
}
