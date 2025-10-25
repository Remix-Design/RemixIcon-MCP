# RemixIcon MCP

![NPM Version](https://img.shields.io/npm/v/remixicon-mcp) ![NPM License](https://img.shields.io/npm/l/remixicon-mcp) ![NPM Downloads](https://img.shields.io/npm/dt/remixicon-mcp)

[English](README.md) | 简体中文

一个轻量级的 [Model Context Protocol](https://modelcontextprotocol.io/)（MCP）服务器：用户提供简洁的图标关键词（最多 20 个），服务器即返回最相关的 5 个 Remix Icon 名称与元数据——采用 Clean Architecture 架构与 FlexSearch 本地搜索。

## 特性

- **智能关键词输入**：支持最多 20 个逗号分隔的关键词，同时自动拒绝自然语言描述以确保最佳搜索质量。
- **固定返回前 5 结果**：始终返回最相关的 5 个图标，帮助用户聚焦决策。
- **FlexSearch 索引**：使用 FlexSearch v0.8 文档索引在本地构建高速检索。
- **Clean Architecture 分层**：领域、应用、基础设施、接口层各自独立，易于测试与扩展。
- **CLI 就绪**：可通过 `npx remixicon-mcp` 作为独立 CLI 工具运行，或集成到 MCP 客户端。
- **LLM 友好的输出**：返回排序候选、命中的 token，并提示模型从结果中只选择一个图标。

## 快速开始

### 安装

```bash
# 全局安装 CLI 工具
npm install -g remixicon-mcp

# 或使用 npx 直接运行
npx remixicon-mcp

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
npx remixicon-mcp

# 或全局安装后运行
remixicon-mcp
```

## 平台配置

### Claude Desktop

**配置方式**
将以下配置添加到 `claude_desktop_config.json`：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

**设置步骤**
1. 保存配置文件
2. 完全退出并重启 Claude Desktop
3. `search_icons` 工具将在对话中可用

### Claude Code

**选项 1：Marketplace 插件（推荐）**
```bash
# 在 Claude Code 中添加 marketplace 插件
/plugin marketplace add Remix-Design/remixicon-mcp
```

优势：
- 自动安装和更新
- 完整的插件元数据和版本管理
- 丰富的关键词和分类发现
- 与 Claude Code 插件生态系统的完整集成

**选项 2：手动配置**
```bash
# 快速命令行设置
claude mcp add --transport stdio remixicon -- npx -y remixicon-mcp
```

或在项目的 `.claude/settings.json` 中手动添加：
```json
{
  "mcp": {
    "servers": {
      "remix-icon": {
        "command": "npx",
        "args": ["-y", "remixicon-mcp"]
      }
    }
  }
}
```

**设置步骤**
1. 选择上述任一安装方式
2. 重启 Claude Code 使更改生效
3. `search_icons` 工具将在会话中可用

### Codex

**配置方式**
```bash
# 快速命令行设置
codex mcp add remixicon -- npx -y remixicon-mcp
```

**设置步骤**
1. 运行上述安装命令
2. 重启 Codex 使更改生效
3. `search_icons` 工具将在对话中可用

## 可用工具

服务器通过官方 `@modelcontextprotocol/sdk` 以 stdio + JSON-RPC 2.0 通信，仅提供一个工具：

### `search_icons`

**输入**：`keywords` 字符串（逗号分隔，最多 20 个关键词）  
**输出**：最相关的 5 个图标及其元数据  
**格式**：可读摘要 + 结构化元数据

### 使用示例

**JSON-RPC 调用：**
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

**示例响应：**
服务器返回与关键词匹配的最相关 5 个图标，包含名称、分类和使用信息。

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
├── .claude-plugin/
│   └── marketplace.json            # Claude Code 插件发现的 Marketplace 元数据
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
