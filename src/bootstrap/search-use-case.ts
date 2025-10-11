import { SearchIconsUseCase } from "../application/use-cases/search-icons.usecase";
import { KeywordParser } from "../domain/services/keyword-parser";
import { loadIconsFromTags } from "../infrastructure/data/tags-to-icons.adapter";
import { FlexSearchIconSearchRepository } from "../infrastructure/search/flexsearch-icon-search.repository";

let cachedUseCase: Promise<SearchIconsUseCase> | null = null;

export function getSearchIconsUseCase(): Promise<SearchIconsUseCase> {
  if (!cachedUseCase) {
    cachedUseCase = buildUseCase();
  }
  return cachedUseCase;
}

async function buildUseCase(): Promise<SearchIconsUseCase> {
  const icons = loadIconsFromTags();
  const repository = new FlexSearchIconSearchRepository({ icons });
  await repository.initialise();
  return new SearchIconsUseCase({
    repository,
    parser: new KeywordParser(),
  });
}
