import { beforeEach, describe, expect, it } from "vitest";
import { SearchIconsUseCase } from "../../src/application/use-cases/search-icons.usecase";
import type { IconMetadata } from "../../src/domain/entities/icon";
import { KeywordParser } from "../../src/domain/services/keyword-parser";
import { FlexSearchIconSearchRepository } from "../../src/infrastructure/search/flexsearch-icon-search.repository";

const SAMPLE_ICONS: IconMetadata[] = [
  {
    name: "layout-grid",
    path: "ri-layout-grid",
    category: "System",
    style: "Line",
    usage: "layout",
    baseName: "layout",
    tags: ["layout", "grid", "dashboard"],
  },
  {
    name: "layout-column",
    path: "ri-layout-column",
    category: "System",
    style: "Fill",
    usage: "layout",
    baseName: "layout",
    tags: ["layout", "column", "design"],
  },
  {
    name: "pencil-line",
    path: "ri-pencil-line",
    category: "Design",
    style: "Line",
    usage: "editing",
    baseName: "pencil",
    tags: ["edit", "sketch", "design"],
  },
];

describe("SearchIconsUseCase", () => {
  let useCase: SearchIconsUseCase;

  beforeEach(async () => {
    const repository = new FlexSearchIconSearchRepository({
      icons: SAMPLE_ICONS,
    });
    await repository.initialise();
    useCase = new SearchIconsUseCase({
      repository,
      parser: new KeywordParser(),
    });
  });

  it("ranks icons by keyword relevance using the repository score", async () => {
    const response = await useCase.execute({ input: "grid" });
    expect(response.matches[0]?.icon.name).toBe("layout-grid");
    expect(response.matches[0]?.score).toBeGreaterThan(
      response.matches[1]?.score ?? 0,
    );
  });

  it("returns empty guidance when multiple matches exist", async () => {
    const response = await useCase.execute({ input: "layout, design" });
    expect(response.matches.length).toBeGreaterThan(1);
    expect(response.guidance).toBe("");
  });

  it("returns empty matches and specific guidance when no keywords match", async () => {
    const response = await useCase.execute({ input: "nonexistent" });
    expect(response.matches).toEqual([]);
    expect(response.guidance).toContain("No icons matched");
  });
});
