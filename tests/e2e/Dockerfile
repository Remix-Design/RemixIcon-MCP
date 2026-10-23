FROM node:24-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tests/e2e ./tests/e2e
RUN mkdir -p /results && chown -R node:node /app /results
USER node
ENV MCP_E2E_DOCKER=1
CMD ["node", "node_modules/vitest/vitest.mjs", "run", "--config", "tests/e2e/vitest.config.mts", "--reporter=default", "--reporter=json", "--outputFile.json=/results/report.json"]
