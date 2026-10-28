# RemixIcon MCP 2.0.0 release information

## Scope and authorization

The HTTP/MCP v2 changes were reviewed in draft PR #24 and merged to `main` on 2026-10-28 as commit `0a8da2d954585dd3eba3ebc852a8d7e1c082c30c`. Version 2.0.0 is merged to `main`. The changelog release date will be set to the actual publication date. npm registry availability depends on package publication; this document records source and package verification, not registry status. The reviewed source change does not deploy the Worker. The original source baseline is `ff819c43a128536e3799c50318435bdc84f7839e`.

## Release contents

The HTTP/MCP v2 source includes a breaking MCP SDK v2 migration and sets the installed CLI runtime minimum to Node.js 20. It updates affected dependencies and includes a package-verified CLI distribution. At PR #24 merge time, GitHub's latest release was 1.2.0 and npm's latest version was 1.1.0.

## Release goals

1. As a maintainer, I want matching package and plugin versions so consumers identify the release correctly.
2. As a CLI user, I want the npm tarball to include its runtime source and metadata so it works without a checkout or development dependencies.
3. As an MCP client user, I want stdio to remain the default and both modern and legacy negotiation to work.
4. As an HTTP client user, I want discovery, ranked search, input errors, concurrency, health, and request guards to remain supported.
5. As an operator, I want explicit runtime and deployment requirements and a migration guide.
6. As a maintainer, I want dependency audits and package checks before any external publication.
7. As a maintainer, I want publication and deployment to remain separate authorized operations.

## Acceptance scenarios

- Given the 2.0.0 package, when package and plugin metadata are read, then both identify version 2.0.0.
- Given the packed release installed outside this repository with production dependencies only, when its CLI runs under supported Node.js versions, then stdio and HTTP clients discover and call search_icons successfully and receive server version 2.0.0.
- Given modern and legacy HTTP clients, when the candidate handles requests, then existing search, errors, client isolation, concurrency, and HTTP guards pass the established tests.
- Given the merged source's frozen lockfile, when production and complete dependency audits run, then they report no known vulnerabilities at verification time.
- Given the source release is merged but not deployed, when documentation describes the hosted endpoint, then it retains the existing deployment version and does not claim the new source is live.
- Given PR #24 is merged, when the merge completes, then no npm package, GitHub release tag, or Worker deployment is changed by the merge itself.

## Implementation decisions

Retain the existing SDK v2 server, default stdio transport, HTTP routes, search contracts, and bundled read-only icon catalog. Update affected dependencies within compatible major versions; do not add application features. Align release metadata and record breaking runtime requirements. The installed CLI supports Node.js 20.0.0 or later. Use Node.js 22.12 or later for the complete source-development and test workflow; locked Vite 7.3.7 requires at least 22.12 on the Node.js 22 line. Wrangler deployment tooling itself requires Node.js 22 or later. Do not claim zero security risk from an audit result.

## Testing decisions

Use the existing CLI transport tests as the highest public seam. Extend those tests for release identity and actual tarball contents; rerun them against an isolated production installation. Keep domain and Worker regression suites unchanged unless dependency compatibility requires a demonstrated repair. Run independent Linux Docker HTTP cases against the local source package, never the old hosted service. Validate frozen installation, typecheck, lint, formatting, build, production/full audits, and package contents. Check documentation links and migration facts.

## Separate operations

Worker deployment is outside this release task. Publishing the npm package does not update the existing hosted Worker.

## Verification results

Local checks on October 28, 2026:

- Frozen installation, typecheck, all 52 tests, lint, format, build, and peer checks passed on the merged source. Typecheck and all 52 tests also passed with the Node.js 22.12.0 runtime on macOS/arm64; Docker checks used Node.js 24 on Linux/arm64.
- Full and production dependency audits reported zero known vulnerabilities. This is a time-specific advisory check, not proof of zero security risk.
- Zod is 4.6.7. Wrangler 4.154.0 uses Miniflare 5.20261023.1-beta and Undici 7.30.1. The release-age exceptions are limited to that Wrangler/Miniflare pair.
- Five CLI/package tests passed against the final main-based tarball installed outside the checkout with production dependencies only, using Node.js 20.0.0 and 24.16.0. The same tests check version identity, package contents, legacy and modern stdio, and HTTP concurrent clients.
- Independent Docker HTTP tests passed 9/9 against the local source on Linux/arm64, including input errors, client isolation, concurrency, and request guards. A separate hosted check confirmed the existing Worker still reports 1.2.0; no Worker deployment was included.
- The tarball includes runtime TypeScript, the icon catalog, both README files, changelog, release notes, and license. Tests, Worker deployment files, development modules, and credential paths are excluded.
- npm account `fradser` authenticated successfully; version 2.0.0 was absent from the registry before publication.

The source change was independently reviewed with Standards PASS and Spec PASS. The final main-based package was regenerated and verified after the merge.

## Reproduce package checks

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm lint
pnpm format
pnpm build
pnpm audit
pnpm audit --prod
pnpm peers check
pnpm pack --pack-destination /tmp
```

Install the tarball in an empty temporary project with production dependencies only. Enable the esbuild installation script in that project's pnpm build policy. Rerun `tests/interface/mcp/cli-transports.test.ts` from this checkout with `MCP_RELEASE_ROOT` pointing to the installed package. Set `MCP_RELEASE_NODE` to an alternate Node.js executable to verify the runtime minimum. The client tests still run with this checkout's development test runner; the server resolves runtime dependencies only from the isolated installation.

Run Docker cases with `MCP_E2E_URL` pointing to the local candidate. Do not use the default hosted endpoint to validate a source version that is not deployed.

## npm publication

The inspected version 2.0.0 package is ready for npm publication. Recheck registry version availability, publish the inspected tarball from the merged source, and verify registry version, tarball integrity, and installed CLI behavior.

Worker deployment is separate. Deploy only with explicit authorization, then verify the reported server version and both MCP protocol eras before updating deployment claims. Do not claim the existing hosted 1.2.0 service runs this candidate.
