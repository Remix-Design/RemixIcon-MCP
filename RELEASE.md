# RemixIcon MCP 2.0.0 release preparation

## Scope and authorization

Prepare the 2.0.0 candidate from the HTTP/MCP v2 branch and open a draft pull request to `main` for review. The release branch may be pushed for that PR. Stop before merging, creating tags or GitHub releases, publishing to npm, deploying Workers, or deleting branches unless separately authorized. The baseline is `ff819c43a128536e3799c50318435bdc84f7839e`.

## Problem and solution

The baseline includes HTTP support and an intentional MCP SDK v2 migration, but its package identifies version 1.2.0. At preparation time, GitHub's latest release is 1.2.0 and npm's latest version is 1.1.0. This candidate identifies version 2.0.0 because the runtime minimum changes from Node.js 18 to 20. It updates affected dependencies and verifies the actual package before publication.

## User stories

1. As a maintainer, I want matching package and plugin versions so consumers identify the release correctly.
2. As a CLI user, I want the npm tarball to include its runtime source and metadata so it works without a checkout or development dependencies.
3. As an MCP client user, I want stdio to remain the default and both modern and legacy negotiation to work.
4. As an HTTP client user, I want discovery, ranked search, input errors, concurrency, health, and request guards to remain supported.
5. As an operator, I want explicit runtime and deployment requirements and a migration guide.
6. As a maintainer, I want dependency audits and package checks before any external publication.
7. As a maintainer, I want publication and deployment to remain separate authorized operations.

## Acceptance scenarios

- Given the 2.0.0 candidate, when package and plugin metadata are read, then both identify version 2.0.0.
- Given the packed release installed outside this repository with production dependencies only, when its CLI runs under supported Node.js versions, then stdio and HTTP clients discover and call search_icons successfully and receive server version 2.0.0.
- Given modern and legacy HTTP clients, when the candidate handles requests, then existing search, errors, client isolation, concurrency, and HTTP guards pass the established tests.
- Given the candidate's frozen lockfile, when production and complete dependency audits run, then they report no known vulnerabilities at verification time.
- Given a release candidate but no deployment, when documentation describes the hosted endpoint, then it retains the existing deployment version and does not claim the candidate is live.
- Given preparation-only authorization, when preparation finishes, then no remote branches, tags, registry package, or deployment are changed.

## Implementation decisions

Retain the existing SDK v2 server, default stdio transport, HTTP routes, search contracts, and bundled read-only icon catalog. Update affected dependencies within compatible major versions; do not add application features. Align release metadata and record breaking runtime requirements. The installed CLI supports Node.js 20.0.0 or later. Use Node.js 22.12 or later for the complete source-development and test workflow; locked Vite 7.3.7 requires at least 22.12 on the Node.js 22 line. Wrangler deployment tooling itself requires Node.js 22 or later. Do not claim zero security risk from an audit result.

## Testing decisions

Use the existing CLI transport tests as the highest public seam. Extend those tests for release identity and actual tarball contents; rerun them against an isolated production installation. Keep domain and Worker regression suites unchanged unless dependency compatibility requires a demonstrated repair. Run independent Linux Docker HTTP cases against the local candidate, never the old hosted service. Validate frozen installation, typecheck, lint, formatting, build, production/full audits, and package contents. Check documentation links and migration facts.

## Out of scope

Merging the draft PR, release tags, GitHub release creation, npm publication, Worker deployment, branch cleanup, new UI, catalog refresh, and feature redesign.

## Verification results

Local checks on October 28, 2026:

- Frozen installation, typecheck, all 52 tests, lint, format, build, and peer checks passed. Typecheck and all 52 tests also passed with the Node.js 22.12.0 runtime on macOS/arm64; Docker checks used Node.js 24 on Linux/arm64.
- Full and production dependency audits reported zero known vulnerabilities. This is a time-specific advisory check, not proof of zero security risk.
- Zod is 4.6.7. Wrangler 4.154.0 uses Miniflare 5.20261023.1-beta and Undici 7.30.1. The release-age exceptions are limited to that Wrangler/Miniflare pair.
- Five CLI/package tests passed against the tarball installed outside the checkout with production dependencies only, using Node.js 20.0.0 and 24.16.0. The same tests check version identity, package contents, legacy and modern stdio, and HTTP concurrent clients.
- Independent Docker HTTP tests passed 9/9 against the local candidate on Linux/arm64, including input errors, client isolation, concurrency, and request guards. No hosted endpoint was used.
- The tarball includes runtime TypeScript, the icon catalog, both README files, changelog, release notes, and license. Tests, Worker deployment files, development modules, and credential paths are excluded.

Independent review is a final delivery gate. Local candidate preparation does not update npm, release tags, GitHub releases, or Worker deployments. The separately authorized draft PR is for review only; it does not authorize merging or publishing.

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

## Publication handoff

Before a separately authorized publication, integrate and review the release branch through the repository's normal process, set the actual changelog release date, and rerun the checks. Update candidate-status documentation when publication succeeds. Verify that version 2.0.0 is still unused on npm. Create the release tag and GitHub release only from the approved revision. Publish the inspected tarball rather than an unrelated checkout. Verify registry version, installed CLI behavior, and release metadata after publication.

Worker deployment is separate. Deploy only with explicit authorization, then verify the reported server version and both MCP protocol eras before updating deployment claims. Do not claim the existing hosted 1.2.0 service runs this candidate.
