#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." >/dev/null && pwd)"
image="remixicon-mcp-e2e:local"
report_root="$project_root/.e2e/docker-http"
endpoint="${MCP_E2E_URL:-https://remix-icon-mcp.frad.workers.dev/mcp}"
mkdir -p "$report_root"
docker build --file "$project_root/tests/e2e/Dockerfile" --tag "$image" "$project_root"
report_dir="$(mktemp -d "$report_root/run.XXXXXX")"
container_id="$(docker create --env "MCP_E2E_URL=$endpoint" "$image")"
trap 'docker rm --force "$container_id" >/dev/null' EXIT
attach_status=0
docker start --attach "$container_id" || attach_status=$?
exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$container_id")"
docker cp "$container_id:/results/." "$report_dir"
node - "$container_id" "$image" "$endpoint" "$report_dir" <<'NODE'
const { execFileSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const [containerId, imageName, endpoint, reportDir] = process.argv.slice(2);
const container = JSON.parse(execFileSync("docker", ["inspect", containerId], { encoding: "utf8" }))[0];
const image = JSON.parse(execFileSync("docker", ["image", "inspect", imageName], { encoding: "utf8" }))[0];
writeFileSync(join(reportDir, "runtime.json"), JSON.stringify({
  endpoint, containerId, imageId: image.Id, platform: `${image.Os}/${image.Architecture}`,
  startedAt: container.State.StartedAt, finishedAt: container.State.FinishedAt, exitCode: container.State.ExitCode,
}, null, 2) + "\n");
JSON.parse(readFileSync(join(reportDir, "report.json"), "utf8"));
console.log(`Docker E2E reports: ${reportDir}`);
NODE
if [[ "$exit_code" -eq 0 && "$attach_status" -ne 0 ]]; then
  exit_code="$attach_status"
fi
exit "$exit_code"
