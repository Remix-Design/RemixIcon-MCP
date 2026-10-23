import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { createHttpHandler, type HttpHandlerOptions } from "./mcp-handler";

interface NodeHttpOptions extends HttpHandlerOptions {
  host: string;
  port: number;
}

export async function startHttpServer(options: NodeHttpOptions) {
  const handler = createHttpHandler(options);
  const server = createServer(
    getRequestListener(handler, { overrideGlobalObjects: false }),
  );
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port, options.host, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    await handler.close();
    throw error;
  }
  let closing: Promise<void> | undefined;
  return {
    address: server.address(),
    close() {
      closing ??= (async () => {
        const closed = new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        const timer = setTimeout(() => server.closeAllConnections(), 5_000);
        timer.unref();
        try {
          await handler.close();
          server.closeIdleConnections();
          await closed;
        } finally {
          clearTimeout(timer);
        }
      })();
      return closing;
    },
  };
}
