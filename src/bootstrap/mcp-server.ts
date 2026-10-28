import { createIconKeywordServer } from "../interface/mcp/icon-keyword-server";
import { getSearchIconsUseCase } from "./search-use-case";

export function createIconMcpServer() {
  return createIconKeywordServer({ getSearchUseCase: getSearchIconsUseCase });
}
