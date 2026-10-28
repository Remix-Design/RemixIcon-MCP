import { describe, expect, it } from "vitest";
import { parseServerOptions } from "../../../src/bootstrap/server-options";

describe("server options", () => {
  it("normalizes hostnames and IPv6 before HTTP access checks", () => {
    expect(parseServerOptions(["--host", "MCP.EXAMPLE"]).host).toBe(
      "mcp.example",
    );
    expect(parseServerOptions(["--host", "2001:0db8:0:0:0:0:0:1"]).host).toBe(
      "2001:db8::1",
    );
  });
  it("defaults to stdio and loopback HTTP settings", () => {
    expect(parseServerOptions([])).toEqual({
      transport: "stdio",
      host: "127.0.0.1",
      port: 3000,
      allowedOrigins: [],
      help: false,
    });
  });

  it("accepts explicit HTTP flags and environment configuration", () => {
    expect(
      parseServerOptions(["--transport", "http", "--port", "4321"], {
        MCP_HOST: "localhost",
        MCP_ALLOWED_ORIGINS: "https://client.example",
      }),
    ).toMatchObject({
      transport: "http",
      host: "localhost",
      port: 4321,
      allowedOrigins: ["https://client.example"],
    });
  });

  it.each([
    ["--port", "0"],
    ["--port", "65536"],
    ["--port", "3e3"],
    ["--transport", "sse"],
    ["--port"],
    ["--host", "https://example.com"],
    ["--unknown"],
  ])("rejects invalid flags %j", (...args) => {
    expect(() => parseServerOptions(args)).toThrow();
  });

  it("validates configured browser origins", () => {
    expect(() =>
      parseServerOptions([], { MCP_ALLOWED_ORIGINS: "*" }),
    ).toThrow();
    expect(() =>
      parseServerOptions([], {
        MCP_ALLOWED_ORIGINS: "https://example.com/path",
      }),
    ).toThrow();
  });

  it("shows help even when environment configuration is invalid", () => {
    expect(parseServerOptions(["--help"], { MCP_PORT: "invalid" }).help).toBe(
      true,
    );
  });
});
