import { describe, expect, it } from "vitest";
import type { IconMetadata } from "../../src/domain/entities/icon";
import { FlexSearchIconSearchRepository } from "../../src/infrastructure/search/flexsearch-icon-search.repository";

describe("FlexSearchIconSearchRepository", () => {
  it("ranks all matching candidates before applying the result limit", async () => {
    const icons: IconMetadata[] = [
      "home-aaa-long",
      "home-bbb-long",
      "home-ccc-long",
      "home-ddd-long",
      "home-eee-long",
      "home",
    ].map((baseName) => ({
      name: `${baseName}-line`,
      baseName,
      path: `icons/System/${baseName}-line.svg`,
      category: "System",
      style: "line",
      usage: "",
      tags: [],
    }));
    const repository = new FlexSearchIconSearchRepository({ icons });
    await repository.initialise();

    const matches = await repository.search(["home"], 5);

    expect(matches).toHaveLength(5);
    expect(matches[0]?.icon.name).toBe("home-line");
  });
});
