#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

let cliPath;
try {
  cliPath = require.resolve("@biomejs/biome/bin/biome");
} catch (error) {
  console.error("@biomejs/biome is not installed. Please install dependencies before running this command.");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args[0] === "check" && args.includes("--write")) {
  console.warn("[biome] --write is not supported for 'check'; forwarding as --apply instead.");
  const rest = args.slice(1).map((arg) => (arg === "--write" ? "--apply" : arg));
  args.splice(0, args.length, "check", ...rest);
}

const result = spawnSync(process.execPath, [cliPath, ...args], {
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
