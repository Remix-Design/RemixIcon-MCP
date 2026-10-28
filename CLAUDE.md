# Claude Code repository guide

## Authoritative guidance

Follow [AGENTS.md](AGENTS.md) for repository conventions. Read [README.md](README.md) for CLI and HTTP contracts and [CHANGELOG.md](CHANGELOG.md) for changes.

## Commands

Use pnpm consistently:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm lint
pnpm format
pnpm build
pnpm audit
pnpm audit --prod
```

`pnpm test` runs once. `pnpm test:watch` starts watch mode. `pnpm test:e2e:docker` runs live HTTP tests against the configured endpoint; set `MCP_E2E_URL` to a local server when validating source changes. The default endpoint is the deployed service, not the checkout.

The 2.0.0 installed CLI runtime requires Node.js 20 or later. The complete source-development and test workflow requires Node.js 22.12 or later because the locked Vite toolchain requires it. Wrangler deployment tooling itself requires Node.js 22 or later.

## Architecture

Dependencies point inward: interfaces handle transport, infrastructure implements application-owned ports, application orchestrates use cases, and domain owns search rules. Bootstrap wires dependencies. The bundled `src/data/tags.json` is read-only at runtime.

- `src/domain/`: icon entities, keyword validation, and text constants.
- `src/application/`: search use case and repository port.
- `src/infrastructure/`: catalog adapter and FlexSearch repository.
- `src/bootstrap/`: search index, MCP server factories, and transport options.
- `src/interface/mcp/`: shared MCP SDK v2 tool registration and stdio.
- `src/interface/http/`: shared HTTP request handling and Node adapter.
- `src/cli/run.ts`: option parsing and process lifecycle.
- `bin/run.cjs`: executable launcher using the production tsx dependency.
- `worker/src/index.ts`: Cloudflare entry point using the shared HTTP handler.

Stdio remains the default. Node HTTP is opt-in through `--transport http`; Cloudflare serves Streamable HTTP. Modern and legacy clients share the same tool and ranked search behavior. There is no standalone `/sse` endpoint or persistent MCP session.

## Tests and contracts

Tests mirror the source layers. Public CLI transport tests cover stdio and HTTP; Worker smoke tests use a real local workerd runtime. Do not replace public contract checks with mocks of internal search collaborators.

`search_icons` accepts a nonempty string of at most 200 characters and at most 20 comma-separated keywords. Reject sentences. Return zero to five ranked matches, readable content, and structured metadata. Preserve `matches[].name`, error behavior, and concurrency isolation unless an explicitly approved change alters them.

Score all candidates before applying the result limit. Load the catalog once per process or Worker isolate. Do not fetch catalog data or credentials during searches.

## Distribution and deployment

The npm package contains the executable, TypeScript runtime source, bundled metadata, license, README files, changelog, and release notes. Verify the tarball outside the checkout with production dependencies only. Do not infer package correctness from source tests alone.

`pnpm dev` runs a local Worker preview. `pnpm deploy` writes to Cloudflare and requires explicit authorization. npm publication and GitHub release tagging/publication are separate release operations; Worker deployment remains separate. Never claim the hosted endpoint has an unreleased source version.
