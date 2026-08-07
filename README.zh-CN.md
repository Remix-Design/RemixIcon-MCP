# RemixIcon MCP ![](https://img.shields.io/npm/v/remixicon-mcp)

[![npm downloads](https://img.shields.io/npm/dt/remixicon-mcp)](https://www.npmjs.com/package/remixicon-mcp) [![License: MIT](https://img.shields.io/npm/l/remixicon-mcp)](https://opensource.org/licenses/MIT)

[English](README.md) | **简体中文**

一个 Model Context Protocol（MCP）服务器：输入图标关键词，返回匹配的 Remix Icon 名称。输入最多 20 个逗号分隔的关键词，即可得到最相关的 5 个图标。

服务器支持两种运行方式：
- **本地（stdio）** — 通过 `npx remixicon-mcp` 运行，适合 CLI 与离线使用。
- **远程（Cloudflare）** — 托管在 Cloudflare Workers 上，通过 Streamable HTTP 提供服务，任意支持远程的 MCP 客户端均可使用。

## 特性

- 接受最多 20 个逗号分隔的关键词，自动拒绝自然语言描述。
- 始终返回最相关的 5 个图标，帮助聚焦决策。
- 使用 FlexSearch v0.8 文档索引，对 Remix Icon 目录进行快速检索。
- 内置最新图标目录，与官方 RemixIcon 仓库同步：20 个分类、1690 个基础图标（line/fill 两种样式，共 3380 个图标名）。
- 支持两种传输方式：本地 stdio（SDK v1）与远程 Streamable HTTP（SDK v2 + `agents`），共享同一套领域/应用/基础设施核心层。
- 返回排序候选、命中的 token，并提示模型只选择一个图标。

## 快速开始

### 本地（stdio）

```bash
# 使用 npx 直接运行
npx remixicon-mcp

# 或全局安装
npm install -g remixicon-mcp
remixicon-mcp
```

### 远程（Cloudflare）

已部署一个托管实例，地址为：

```
https://remix-icon-mcp.frad.workers.dev/mcp
```

无需安装，把 URL 指向任意支持远程的 MCP 客户端即可。

## 配置

### 远程（Cloudflare）

托管服务器使用标准 MCP Streamable HTTP 传输。支持远程的客户端只需配置端点 URL。

**Claude Desktop**：添加到 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "remix-icon": {
      "url": "https://remix-icon-mcp.frad.workers.dev/mcp"
    }
  }
}
```

**Claude Code**：

```bash
claude mcp add --transport http remix-icon https://remix-icon-mcp.frad.workers.dev/mcp
```

服务器无状态、无需鉴权（公开图标搜索）。源码修改后重新部署：

```bash
pnpm deploy   # wrangler deploy
pnpm dev      # wrangler dev（本地预览）
```

### Claude Desktop（本地）

添加到 `claude_desktop_config.json`：

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

保存后完全退出并重启 Claude Desktop，`search_icons` 工具即在对话中可用。

### Claude Code（本地）

```bash
claude mcp add --transport stdio remixicon -- npx -y remixicon-mcp
```

重启 Claude Code 使更改生效。

## 工具

服务器只提供一个工具。传输方式取决于所选模式：

- **本地（stdio）**：通过 `@modelcontextprotocol/sdk`（v1）以 stdio + JSON-RPC 2.0 通信。
- **远程（Cloudflare）**：通过 MCP SDK v2（`@modelcontextprotocol/server`）与 `agents` 使用 Streamable HTTP。

### `search_icons`

**输入**：`keywords`，逗号分隔的字符串，最多 20 个关键词。
**输出**：最相关的 5 个图标，含名称与得分。
**格式**：可读文本 + 结构化元数据。

JSON-RPC 调用：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_icons",
    "arguments": {
      "keywords": "layout, grid, design"
    }
  }
}
```

## 项目结构

```
.
├── bin/
│   └── run.cjs                 # CLI 入口，用于 npx 执行（本地 stdio）
├── src/                        # 本地（stdio）服务器 + 共享核心层
│   ├── cli/                    # CLI 运行器
│   ├── bootstrap/              # 依赖装配
│   ├── domain/                 # 图标实体与关键词解析器
│   ├── application/            # 搜索用例
│   ├── infrastructure/         # FlexSearch 仓库、数据适配器
│   ├── interface/mcp/          # 本地 MCP 服务器（SDK v1，stdio）
│   └── data/tags.json          # Remix Icon 目录
├── worker/                     # 远程（Cloudflare）服务器
│   ├── tsconfig.json           # Worker TypeScript 配置
│   └── src/
│       ├── index.ts            # createMcpHandler + Streamable HTTP
│       └── server.ts           # SDK v2 McpServer 工厂（复用 src/ 核心层）
├── wrangler.jsonc              # Cloudflare 部署配置
├── tests/                      # Vitest 测试套件（单元 + Worker 集成）
├── .claude-plugin/
│   └── marketplace.json        # Claude Code 插件元数据
├── package.json
├── tsconfig.json               # Node TypeScript 配置
└── vitest.config.mts
```

## 开发

```bash
pnpm typecheck   # 类型检查（Node 与 Worker 两个工程）
pnpm test        # Vitest 测试套件（单元 + Worker 集成）
pnpm lint        # Biome lint 自动修复
pnpm format      # Biome 格式化
pnpm deploy      # 部署远程 Worker 到 Cloudflare
pnpm dev         # 通过 wrangler dev 本地运行 Worker
```

### 同步图标目录

`src/data/tags.json` 与官方 RemixIcon 仓库同步。要刷新数据，从 `https://raw.githubusercontent.com/Remix-Design/RemixIcon/master/tags.json` 下载最新文件，然后运行 `pnpm test` 与 `pnpm typecheck`，最后用 `pnpm deploy` 重新部署。

## 许可证

[MIT](LICENSE)
