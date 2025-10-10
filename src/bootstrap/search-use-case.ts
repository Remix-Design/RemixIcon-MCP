import { SearchIconsUseCase } from "../application/use-cases/search-icons.usecase";
import iconCatalog from "../data/icon-catalog.json";
import type { IconMetadata } from "../domain/entities/icon";
import { KeywordParser } from "../domain/services/keyword-parser";
import { FlexSearchIconSearchRepository } from "../infrastructure/search/flexsearch-icon-search.repository";

let cachedUseCase: Promise<SearchIconsUseCase> | null = null;

export function getSearchIconsUseCase(): Promise<SearchIconsUseCase> {
  if (!cachedUseCase) {
    cachedUseCase = buildUseCase();
  }
  return cachedUseCase;
}

async function buildUseCase(): Promise<SearchIconsUseCase> {
  const icons = (iconCatalog.icons ?? []) as IconMetadata[];
  const repository = new FlexSearchIconSearchRepository({ icons });
  await repository.initialise();
  return new SearchIconsUseCase({
    repository,
    parser: new KeywordParser(),
  });
}
