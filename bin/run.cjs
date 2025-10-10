#!/usr/bin/env node
const { register } = require("tsx/cjs/api");

const unregister = register();

(async () => {
  try {
    const mod = require("../src/cli/run.ts");
    const runCli = mod.runCli ?? mod.default;
    if (typeof runCli !== "function") {
      throw new Error("runCli export missing");
    }
    await runCli();
  } catch (error) {
    console.error("Failed to start MCP server", error);
    process.exit(1);
  } finally {
    unregister();
  }
})();
