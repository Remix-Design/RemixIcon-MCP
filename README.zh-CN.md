# Remix Icon MCP ![](https://img.shields.io/badge/A%20FRAD%20PRODUCT-WIP-yellow)

[English](README.md) | 简体中文

一个轻量级的 [Model Context Protocol](https://modelcontextprotocol.io/)（MCP）服务器：用户提供简洁的图标关键词（最多 20 个），服务器即返回最相关的 5 个 Remix Icon 名称与元数据——采用 Clean Architecture 架构与 FlexSearch 本地搜索。

## 特性

- **智能关键词输入**：支持最多 20 个逗号分隔的关键词，同时自动拒绝自然语言描述以确保最佳搜索质量。
- **固定返回前 5 结果**：始终返回最相关的 5 个图标，帮助用户聚焦决策。
- **FlexSearch 索引**：使用 FlexSearch v0.8 文档索引在本地构建高速检索。
- **Clean Architecture 分层**：领域、应用、基础设施、接口层各自独立，易于测试与扩展。
- **CLI 就绪**：可通过 `npx mcp-server-remix-icon` 作为独立 CLI 工具运行，或集成到 MCP 客户端。
- **LLM 友好的输出**：返回排序候选、命中的 token，并提示模型从结果中只选择一个图标。

## 快速开始

### 安装

```bash
# 全局安装 CLI 工具
npm install -g mcp-server-remix-icon

# 或使用 npx 直接运行
npx mcp-server-remix-icon

# 开发环境
pnpm install
pnpm typecheck
pnpm test
```

### 使用

#### 作为独立 CLI 工具

你可以通过 stdio 直接运行 MCP 服务器进行测试或集成：

```bash
# 使用 npx 运行
npx mcp-server-remix-icon

# 或全局安装后运行
mcp-server-remix-icon
```

#### Claude Desktop 配置

要在 Claude Desktop 中使用此服务器，请将以下配置添加到 `claude_desktop_config.json`：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "remix-icon": {
      "command": "npx",
      "args": ["-y", "mcp-server-remix-icon"]
    }
  }
}
```

保存配置文件后，完全退出并重启 Claude Desktop 以使更改生效。

#### Claude Code 配置

**添加为 Marketplace 插件**

直接从 GitHub 安装为 marketplace 插件：

```bash
# 在 Claude Code 中，添加 marketplace
/plugin marketplace add FradSer/mcp-server-remix-icon
```

这将提供：
- 自动安装和更新
- 完整的插件元数据和版本管理
- 用于发现的关键词和分类
- 丰富的描述和作者信息
- 与 Claude Code 插件生态系统的完整集成

**手动配置（备选）**

或者，在项目的 `.claude/settings.json` 中添加以下配置：

```json
{
  "mcp": {
    "servers": {
      "remix-icon": {
        "command": "npx",
        "args": ["-y", "mcp-server-remix-icon"]
      }
    }
  }
}
```

添加配置后，重启 Claude Code 以使更改生效。

#### 可用工具

服务器通过官方 `@modelcontextprotocol/sdk` 以 stdio + JSON-RPC 2.0 通信，仅提供一个工具：

- `search_icons` – 必填参数 `keywords`（逗号分隔的关键词字符串,最多 20 个）。始终返回前 5 个结果。

### 工具调用示例

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

服务器会返回便于阅读的摘要文本，以及包含最相关的 5 个图标的结构化元数据。

## 项目结构

```
.
├── bin/
│   └── run.cjs                     # CLI 入口，用于 npx 执行
├── src/
│   ├── cli/                        # CLI 运行器实现
│   ├── bootstrap/                  # 装配依赖，维持 Clean Architecture 分层
│   ├── domain/                     # 图标实体与关键词解析器
│   ├── application/                # 搜索用例，负责校验与排序
│   ├── infrastructure/search/      # 基于 FlexSearch 的搜索实现
│   ├── interface/mcp/              # 使用 @modelcontextprotocol/sdk 构建的 MCP 服务器
│   └── data/tags.json              # Remix Icon 搜索标签
├── tests/                          # Vitest 测试用例
├── marketplace.json                # Claude Code 插件发现的 Marketplace 元数据
├── package.json                    # pnpm 脚本配置
└── tsconfig.json                   # 严格的 TypeScript 配置（含 Node 类型）
```

## 实现说明

- 关键词解析器支持最多 20 个逗号分隔的关键词，同时在检测到句子式输入时直接拒绝。
- 增强的检测逻辑能够区分关键词列表（带分隔符）和自然语言句子（空格分隔的短语）。
- FlexSearch 对图标名称、标签、用途、分类等字段建索引，结合字段权重与 token 命中计算得分。
- 固定返回前 5 个结果，提供聚焦且相关的匹配结果，无需复杂配置。
- 应用层组合解析、仓库查询与响应格式化，接口层只负责传输协议。
- MCP 响应同时提供可读提示与机器可消费的结果，确保 LLM 只选择单个图标。
- CLI 运行器支持通过 `npx` 或全局安装独立执行，方便集成。

## 开发脚本

```bash
pnpm typecheck   # 类型检查（tsc --noEmit）
pnpm test        # 运行 Vitest
pnpm exec biome check --write --unsafe   # 使用 Biome 自动修复格式与 lint
```

## 许可证

[MIT License](LICENSE)
