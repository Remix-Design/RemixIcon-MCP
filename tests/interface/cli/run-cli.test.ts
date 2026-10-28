import { afterEach, describe, expect, it, vi } from "vitest";

const { startMock } = vi.hoisted(() => ({ startMock: vi.fn() }));
vi.mock("../../../src/bootstrap/start-server", () => ({
  startServer: startMock,
}));

afterEach(() => {
  vi.restoreAllMocks();
  startMock.mockReset();
});

describe("runCli", () => {
  it("starts stdio by default", async () => {
    startMock.mockResolvedValue({ close: vi.fn() });
    const { runCli } = await import("../../../src/cli/run");
    await runCli([], {});
    expect(startMock).toHaveBeenCalledWith(
      expect.objectContaining({ transport: "stdio" }),
    );
  });

  it("passes HTTP options to startup", async () => {
    startMock.mockResolvedValue({ close: vi.fn() });
    const { runCli } = await import("../../../src/cli/run");
    await runCli(["--transport", "http", "--port", "4567"], {});
    expect(startMock).toHaveBeenCalledWith(
      expect.objectContaining({ transport: "http", port: 4567 }),
    );
  });

  it("prints help without starting a server", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { runCli } = await import("../../../src/cli/run");
    await runCli(["--help"], {});
    expect(startMock).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith(expect.stringContaining("--transport"));
  });

  it("reports startup failure through the process exit code", async () => {
    const failure = new Error("boom");
    startMock.mockRejectedValue(failure);
    const output = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const previousExitCode = process.exitCode;
    const { runCli } = await import("../../../src/cli/run");
    await runCli([], {});
    expect(output).toHaveBeenCalledWith("Failed to start MCP server", failure);
    expect(process.exitCode).toBe(1);
    process.exitCode = previousExitCode;
  });
});
