# Remix Icon MCP ![](https://img.shields.io/badge/A%20FRAD%20PRODUCT-WIP-yellow)

[English](README.md) | 简体中文

一个轻量级的 [Model Context Protocol](https://modelcontextprotocol.io/)（MCP）服务器：用户只需提供与图标相关的关键词，服务器即返回匹配的 Remix Icon 名称与元数据。不再依赖 Cloudflare Workers、缓存系统或多阶段 AI 检索。

## 特性

- **关键词工具**：仅接受以逗号分隔的关键词输入，返回按相关度排序的 Remix Icon。
- **本地倒排索引**：启动时预构建索引，查询全部在内存中完成，响应迅速。
- **可预期的结果**：完全基于关键词匹配与前缀扩展，无外部 API 或 AI 模型。
- **丰富的输出**：每条结果都包含图标路径、分类、风格以及触发匹配的 token。

## 快速开始

```bash
npm install
npm run build
```

通过运行编译后的 JavaScript（例如 `node build/index.js`）或使用你喜欢的 TypeScript 运行器来启动 MCP 服务器。服务器基于 stdio + JSON-RPC 2.0 通信，仅提供一个工具：

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
│   ├── data/icon-catalog.json  # Remix Icon 元数据（沿用原项目）
│   ├── icon-search.ts          # 关键词解析、倒排索引与排序逻辑
│   ├── icon-types.ts           # 图标类型定义
│   ├── index.ts                # 入口（启动 MCP 服务器）
│   └── mcp-server.ts           # 精简的 JSON-RPC MCP 实现
├── tests/                      # Vitest 测试（保持不变）
├── package.json                # 精简后的 npm 配置
└── tsconfig.json               # 面向 Node 环境的 TypeScript 配置
```

## 实现说明

- 使用支持 Unicode 的分词方式并统一转为小写。
- 倒排索引将每个 token 映射到包含它的图标；此前缀扩展可以提供轻量级的模糊匹配。
- 结果根据关键词覆盖度打分（精确匹配权重更高），并进行确定性排序。
- 响应遵循 MCP 工具格式，带 `Content-Length` 头以确保兼容性。

## 开发脚本

```bash
npm run build   # 类型检查
npm run lint    # 执行 Biome 检查（不写入）
npm run test    # 运行现有的 Vitest 测试

# 使用 pnpm 可以直接调用 Biome。仓库内的 shim 会把 `--write`
# 转换成 Biome 支持的 `--apply`，以保持既有命令兼容。
pnpm exec biome check --write
```

## 许可证

[MIT License](LICENSE)
