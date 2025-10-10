import { afterEach, describe, expect, it, vi } from "vitest";

const startMock = vi.fn();

vi.mock("../../../src/interface/mcp/icon-keyword-server", () => ({
  startMcpServer: startMock,
}));

afterEach(() => {
  vi.restoreAllMocks();
  startMock.mockReset();
});

describe("runCli", () => {
  it("starts the MCP server when invoked", async () => {
    startMock.mockResolvedValue(undefined);

    const { runCli } = await import("../../../src/cli/run");

    await expect(runCli()).resolves.toBeUndefined();
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it("logs and exits when server startup fails", async () => {
    const failure = new Error("boom");
    startMock.mockRejectedValue(failure);

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {
        throw new Error("exit 1");
      }) as never);

    const { runCli } = await import("../../../src/cli/run");

    await expect(runCli()).rejects.toThrow("exit 1");
    expect(errorSpy).toHaveBeenCalledWith("Failed to start MCP server", failure);
    expect(exitSpy).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
