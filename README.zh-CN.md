# Remix Icon MCP ![](https://img.shields.io/badge/A%20FRAD%20PRODUCT-WIP-yellow)

[English](README.md) | 简体中文

一个轻量级的 [Model Context Protocol](https://modelcontextprotocol.io/)（MCP）服务器：用户只需提供简洁的图标关键词，服务器即返回匹配的 Remix Icon 名称与元数据——无需 Cloudflare Workers、缓存系统或多阶段 AI 检索。

## 特性

- **仅限关键词的工具**：严格要求输入为逗号分隔的短关键词，自动拒绝自然语言描述。
- **FlexSearch 索引**：使用 FlexSearch v0.8 文档索引在本地构建高速检索。
- **Clean Architecture 分层**：领域、应用、基础设施、接口层各自独立，易于测试与扩展。
- **LLM 友好的输出**：返回排序候选、命中的 token，并提示模型从结果中只选择一个图标。

## 快速开始

```bash
pnpm install
pnpm typecheck
pnpm test
```

可以直接使用你喜欢的 TypeScript 运行器启动服务器（例如 `pnpm exec tsx src/index.ts`），或先编译再运行。服务器通过官方 `@modelcontextprotocol/sdk` 以 stdio + JSON-RPC 2.0 通信，仅提供一个工具：

- `search_icons` – 必填参数 `keywords`（逗号分隔的关键词字符串），可选参数 `limit`（默认 20，最大 100）。

### 工具调用示例

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_icons",
    "arguments": {
      "keywords": "layout, grid, design",
      "limit": 5
    }
  }
}
```

服务器会返回便于阅读的摘要文本，以及包含匹配数量等信息的结构化元数据。

## 项目结构

```
.
├── src/
│   ├── bootstrap/                  # 装配依赖，维持 Clean Architecture 分层
│   ├── domain/                     # 图标实体与关键词解析器
│   ├── application/                # 搜索用例，负责校验与排序
│   ├── infrastructure/search/      # 基于 FlexSearch 的搜索实现
│   ├── interface/mcp/              # 使用 @modelcontextprotocol/sdk 构建的 MCP 服务器
│   └── data/icon-catalog.json      # Remix Icon 元数据
├── tests/                          # Vitest 测试用例
├── package.json                    # pnpm 脚本配置
└── tsconfig.json                   # 严格的 TypeScript 配置（含 Node 类型）
```

## 实现说明

- 关键词解析器会剔除空白、去重，并在检测到句子式输入时直接拒绝。
- FlexSearch 对图标名称、标签、用途、分类等字段建索引，结合字段权重与 token 命中计算得分。
- 应用层组合解析、仓库查询与响应格式化，接口层只负责传输协议。
- MCP 响应同时提供可读提示与机器可消费的结果，确保 LLM 只选择单个图标。

## 开发脚本

```bash
pnpm typecheck   # 类型检查（tsc --noEmit）
pnpm test        # 运行 Vitest
pnpm exec biome check --write --unsafe   # 使用 Biome 自动修复格式与 lint
```

## 许可证

[MIT License](LICENSE)
