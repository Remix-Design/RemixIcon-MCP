import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { describe, expect, it } from "vitest";

const binary = resolve("bin/run.cjs");

async function availablePort(): Promise<number> {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No test port.");
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function verifySearch(client: Client) {
  expect((await client.listTools()).tools.map(({ name }) => name)).toEqual([
    "search_icons",
  ]);
  const results = await Promise.all(
    ["home", "sun", "car"].map((keywords) =>
      client.callTool({
        name: "search_icons",
        arguments: { keywords },
      }),
    ),
  );
  expect(results.every((result) => !result.isError)).toBe(true);
}

describe("packaged CLI transports", () => {
  it.each(["legacy", "auto"] as const)(
    "serves stdio using %s protocol negotiation",
    async (mode) => {
      const client = new Client(
        { name: "binary-test", version: "1.0.0" },
        { versionNegotiation: { mode } },
      );
      try {
        await client.connect(
          new StdioClientTransport({
            command: process.execPath,
            args: [binary],
            stderr: "pipe",
          }),
        );
        await verifySearch(client);
      } finally {
        await client.close();
      }
    },
    15000,
  );

  it("starts HTTP from flags, handles concurrent clients, and exits on SIGTERM", async () => {
    const port = await availablePort();
    const child = spawn(
      process.execPath,
      [binary, "--transport", "http", "--port", String(port)],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const exited = once(child, "exit");
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    const endpoint = new URL(`http://127.0.0.1:${port}/mcp`);
    const clients: Client[] = [];
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("HTTP startup timed out")),
          8000,
        );
        child.once("exit", () => {
          clearTimeout(timeout);
          reject(new Error("HTTP exited before startup"));
        });
        child.stderr.on("data", (chunk) => {
          if (chunk.toString().includes("listening at")) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      expect((await fetch(new URL("/health", endpoint))).status).toBe(200);
      expect(
        (
          await fetch(endpoint, {
            headers: { Origin: "https://attacker.example" },
          })
        ).status,
      ).toBe(403);
      for (const mode of ["legacy", "auto"] as const) {
        const client = new Client(
          { name: `http-${mode}`, version: "1" },
          { versionNegotiation: { mode } },
        );
        clients.push(client);
        await client.connect(new StreamableHTTPClientTransport(endpoint));
      }
      await Promise.all(clients.map(verifySearch));
      expect(stdout).toBe("");
    } finally {
      await Promise.all(clients.map((client) => client.close()));
      child.kill("SIGTERM");
      expect((await exited)[0]).toBe(0);
    }
  }, 15000);
});
