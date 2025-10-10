# Repository Guidelines

## Architecture & Dependencies
This MCP server follows strict Clean Architecture: `interface/` only handles transport, `infrastructure/` adapts data sources, `application/` orchestrates use cases, and `domain/` owns business rules. Respect the dependency rule by importing inward only; new adapters belong under `infrastructure/` and must receive dependencies via constructors. `bootstrap/` wires modules together, so extend it when registering additional repositories or validators. The shared icon catalog lives in `data/icon-catalog.json`; treat it as read-only at runtime.

## Project Structure & Module Organization
Source lives in `src/` with TypeScript entrypoint `index.ts`. Tests mirror the layers inside `tests/application/` and `tests/domain/`, and any infrastructure tests should sit under `tests/infrastructure/` when added. Keep assets and fixtures co-located with their layer to avoid leaking implementation details across boundaries.

## Build, Test & Verification Commands
Use pnpm consistently:
```bash
pnpm install              # Restore dependencies
pnpm typecheck            # Run tsc --noEmit for strict types
pnpm test                 # Execute Vitest suites
pnpm lint                 # Apply Biome lint autofixes
pnpm format               # Format sources with Biome
```
Run the full sequence before pushing or cutting a release branch.

## Coding Style & Naming Conventions
Biome enforces two-space indentation, double quotes, and organized imports. Prefer descriptive names like `SearchIconsUseCase` over abbreviations, and keep functions under 50 lines. Expose domain types via explicit TypeScript exports and document “why” decisions with brief comments when logic is non-obvious. Avoid hardcoded secrets and keep configuration in Bootstrap wiring.

## Testing Workflow
Follow mandatory TDD: add a failing `*.test.ts` in `tests/<layer>/` before touching implementation. Use Vitest `describe` blocks to mirror use cases, and include coverage for error paths such as invalid keywords or missing icon matches. For quick validation, run `pnpm test --runInBand` locally, then ensure `pnpm test` passes without flags.

## Commit & Pull Request Guidelines
Use conventional commits (`feat:`, `fix:`, `chore:`) with lowercase titles under 50 characters. Group changes atomically: update code, tests, and docs together. Pull requests must outline scope, list verification commands executed, and link related issues. Include screenshots or JSON samples when modifying MCP responses, and confirm lint, typecheck, and test runs in the PR checklist.

## Security & Configuration Tips
Never commit credential files; this server depends solely on bundled metadata and the MCP SDK. Validate new environment variables inside `bootstrap/` and surface misconfiguration through explicit errors so the interface layer can fail fast.
