import type { IconMatch } from "../../domain/entities/icon";

export interface IconSearchRepository {
  search(keywords: string[], limit: number): Promise<IconMatch[]>;
}
