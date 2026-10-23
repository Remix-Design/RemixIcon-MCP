# RemixIcon MCP ![](https://img.shields.io/npm/v/remixicon-mcp)

[![npm downloads](https://img.shields.io/npm/dt/remixicon-mcp)](https://www.npmjs.com/package/remixicon-mcp) [![License: MIT](https://img.shields.io/npm/l/remixicon-mcp)](https://opensource.org/licenses/MIT)

[English](README.md) | **简体中文**

一个将简短关键词映射到 Remix Icon 名称的 Model Context Protocol（MCP）服务器。输入最多 20 个英文逗号分隔的关键词，返回最多 5 个排序后的匹配结果。

## 特性

- 本地 stdio、本地 Node.js Streamable HTTP 和 Cloudflare Workers HTTP 共享同一个 MCP SDK v2 服务器与搜索实现。
- 使用内置 FlexSearch 索引及中英文图标标签，搜索无需外部 API 或凭据。
- 同时返回可读文本和结构化结果，包含名称、得分、分类、样式和命中关键词。
- 先对所有匹配候选评分，再选取最相关的结果。
- HTTP 支持当前 MCP 协议及 2025 年版 Streamable HTTP 客户端。当前协议请求返回 JSON，旧版请求使用请求范围内的 SSE；无独立 SSE 端点或持久会话。

## 从源码快速启动

源码开发和 Cloudflare 部署需要 Node.js 22 或更高版本及 pnpm。安装后的 CLI 运行时支持 Node.js 20 或更高版本。以下说明针对当前源码。npm 发布与 Worker 部署分别执行。

```bash
pnpm install

# 在 http://127.0.0.1:3000/mcp 启动 HTTP 服务
pnpm start:http
```

保持服务运行，在支持 URL 的 MCP 客户端中配置 `http://127.0.0.1:3000/mcp`。Claude Code 可使用：

```bash
claude mcp add --transport http remix-icon http://127.0.0.1:3000/mcp
```

使用 stdio 则运行：

```bash
pnpm start
```

### CLI 与配置

安装 CLI 后，默认仍使用 stdio：

```bash
remixicon-mcp
remixicon-mcp --transport http --host 127.0.0.1 --port 3000
```

直接运行当前源码时也支持这些参数：

```bash
pnpm exec tsx src/index.ts --transport http --host 127.0.0.1 --port 3000
```

| CLI 参数 | 环境变量 | 默认值 |
| --- | --- | --- |
| `--transport` | `MCP_TRANSPORT` | `stdio` |
| `--host` | `MCP_HOST` | `127.0.0.1` |
| `--port` | `MCP_PORT` | `3000` |

CLI 参数优先于环境变量。Node HTTP 可通过 `MCP_ALLOWED_ORIGINS` 额外允许浏览器来源，填写英文逗号分隔的精确来源，例如 `https://icons.example.com,http://localhost:5173`。来源包含协议及可选端口，不包含路径或末尾斜杠。默认允许同源请求及不带 `Origin` 请求头的原生客户端，拒绝其他浏览器来源。

默认只接受本机连接。若需其他机器访问，显式设置 `--host 0.0.0.0`。这是无需鉴权的公开图标搜索服务；对外提供服务时，请通过反向代理配置 TLS 及所需的访问控制。

### HTTP 端点

| 端点 | 方法 | 行为 |
| --- | --- | --- |
| `/mcp` | `POST`、`OPTIONS` | MCP 请求及浏览器预检 |
| `/health` | `GET` | JSON 健康状态 |

`POST /mcp` 要求 `Content-Type: application/json`，请求体上限为 16 KiB。`GET /mcp` 和 `DELETE /mcp` 返回 `405`。服务不提供旧式 `/sse` 端点，也不要求持久会话。

### 已发布的 stdio 包

stdio 客户端可使用已发布的包：

```bash
npx -y remixicon-mcp
```

Claude Desktop：在 `claude_desktop_config.json` 中添加以下配置，然后重启应用：

```json
{
  "mcpServers": {
    "remix-icon": {
      "command": "npx",
      "args": ["-y", "remixicon-mcp"]
    }
  }
}
```

Claude Code：

```bash
claude mcp add --transport stdio remixicon -- npx -y remixicon-mcp
```

### Cloudflare Workers

已有托管端点为 [RemixIcon MCP](https://remix-icon-mcp.frad.workers.dev/mcp)。在支持 URL 的 MCP 客户端中填写该地址，或使用：

```bash
claude mcp add --transport http remix-icon https://remix-icon-mcp.frad.workers.dev/mcp
```

HTTP 实现已于 2026 年 10 月 24 日部署并完成线上验证。Cloudflare 版本 `1a2ca18e-d7a6-4910-ac2f-c6d318aa407e` 承接 100% 流量；真实 MCP 客户端的新协议（`2026-07-28`）及旧协议（`2025-11-25`）协商、工具发现、搜索和并发调用均通过。服务报告版本为 `1.2.0`，部署的 MCP SDK 为包含当前安全修复的 `2.3.0`。

请在 MCP 客户端中使用该端点。浏览器直接打开 `/mcp` 会发送 `GET` 并按预期返回 `405`；浏览器健康检查可访问 [/health](https://remix-icon-mcp.frad.workers.dev/health)。后续本地修改需要再次部署才会更新托管服务：

```bash
pnpm dev       # 本地预览 Worker
pnpm run deploy # 发布到 Cloudflare Workers
```

## 工具：`search_icons`

输入：`keywords`，非空字符串，最长 200 个字符，最多包含 20 个英文逗号分隔的关键词。请使用简短关键词，避免完整句子。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_icons",
    "arguments": { "keywords": "layout, grid, design" }
  }
}
```

成功响应同时包含可读的 `content` 和结构化的 `structuredContent`。所有传输方式共享以下输出结构：

```typescript
{
  guidance: string;
  matches: Array<{
    name: string;
    score: number;
    category: string;
    style: string;
    matchedKeywords: string[];
  }>;
}
```

`matches` 包含零至五项。已有客户端仍可读取 `matches[].name`，新增字段用于说明排序及命中的目录词项。无效关键词输入返回工具错误。工具注解声明搜索为只读且幂等。

## 项目结构

```text
bin/run.cjs                    CLI 启动器
src/cli/                       CLI 参数及进程生命周期
src/bootstrap/                 依赖装配及共享搜索索引
src/domain/                    图标实体与关键词解析器
src/application/               搜索用例与仓库端口
src/infrastructure/            FlexSearch 仓库与数据适配器
src/interface/mcp/             共享 SDK v2 工具注册
src/interface/http/            共享 HTTP 路由与请求检查
src/data/tags.json             内置 Remix Icon 元数据
worker/src/index.ts            Cloudflare HTTP 入口
wrangler.jsonc                 Cloudflare 配置
tests/                         单元、传输及集成测试
```

## 开发

```bash
pnpm start        # Node stdio 服务
pnpm start:http   # Node HTTP 服务
pnpm typecheck    # Node 与 Worker 类型检查
pnpm test         # 单次运行单元与本地集成测试
pnpm test:watch   # 开发时监听测试
pnpm run test:e2e:docker # 从 Docker 检查线上 HTTP MCP
pnpm lint         # Biome lint 自动修复
pnpm format       # Biome 格式化
pnpm build        # 构建验证
```

Docker 命令使用 Linux 客户端，对 `https://remix-icon-mcp.frad.workers.dev/mcp` 执行九个用例，覆盖新旧协议协商、工具发现、搜索、无结果、非法输入恢复、并发请求、客户端隔离及 HTTP 限制。设置 `MCP_E2E_URL` 可检查其他部署。测试使用锁定依赖，不复制宿主机凭据或依赖目录，运行后删除本次测试容器。每次结果分别保存在 `.e2e/docker-http/` 下的独立目录，包含 `report.json` 与 `runtime.json`。这些线上检查与 `pnpm test` 分开执行。

`src/data/tags.json` 是来自 [RemixIcon 官方目录](https://github.com/Remix-Design/RemixIcon/blob/master/tags.json) 的内置元数据。刷新时从该来源更新文件，运行测试及类型检查，并在发布包或部署 Worker 前审查修改。服务运行时只读使用该文件。

## 许可证

[MIT](LICENSE)
