import { createMcpHandler } from "agents/mcp/server";
import { createServer } from "./server";

export type Env = Record<string, never>;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return createMcpHandler(createServer)(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
