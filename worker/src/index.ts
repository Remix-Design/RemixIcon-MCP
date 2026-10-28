import { createIconMcpServer } from "../../src/bootstrap/mcp-server";
import { createHttpHandler } from "../../src/interface/http/mcp-handler";

// Only immutable icon metadata is shared; MCP instances are created per request.
const handler = createHttpHandler({ createServer: createIconMcpServer });

export default {
  fetch(request: Request): Promise<Response> {
    return handler(request);
  },
} satisfies ExportedHandler;
