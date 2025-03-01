# Remix Icon MCP ![](https://img.shields.io/badge/A%20FRAD%20PRODUCT-WIP-yellow)

[![Twitter Follow](https://img.shields.io/twitter/follow/FradSer?style=social)](https://twitter.com/FradSer)

[English](README.md) | 简体中文

基于 Cloudflare Workers 构建的强大图标搜索和推荐服务，通过先进的语义匹配算法提供智能图标发现功能。

## 功能特点

- **智能图标搜索**：基于自然语言描述查找图标，使用多重相似度算法
- **多语言支持**：针对中英文输入进行了优化
- **分类管理**：按类别浏览和搜索图标
- **高级匹配**：使用多种算法实现更好的搜索结果：
  - Jaccard 相似度
  - N-gram 匹配
  - 分类匹配
  - 精确匹配
  - Levenshtein 距离
  - 名称匹配
  - 标签匹配
- **倒排索引**：使用倒排索引进行快速初步搜索
- **缓存机制**：采用 LRU 缓存提升性能

## API 接口

### 查找图标
```typescript
findIcons(description: string): ResponseContent[]
```
根据用户描述查找图标，返回相似度最高的前 5 个推荐结果。

### 获取图标分类
```typescript
getIconCategories(): ResponseContent[]
```
返回所有可用的图标分类列表。

### 按分类查找图标
```typescript
findIconsByCategory(description: string, category: string): ResponseContent[]
```
在指定分类中基于描述搜索图标，返回相似度最高的前 5 个推荐结果。

## 项目结构

```
.
├── src/                   # 源代码目录
│   ├── index.ts           # 主入口文件
│   ├── data/              # 数据文件，包括图标目录
│   ├── domain/            # 领域模型和服务
│   │   ├── icon/          # 图标领域模型
│   │   └── search/        # 搜索功能
│   ├── infrastructure/    # 基础设施组件
│   │   ├── logging/       # 日志工具
│   │   └── result/        # 结果处理
│   └── utils/             # 工具函数
│       ├── similarity/    # 相似度计算算法
│       └── text/          # 文本处理工具
├── tests/                 # 测试文件
│   ├── integration/       # 集成测试
│   └── unit/              # 单元测试
└── wrangler.jsonc         # Cloudflare Workers 配置
```

## 技术细节

- 基于 Cloudflare Workers 平台构建
- 使用 LRU 缓存优化性能
- 实现加权多算法相似度评分
- 支持中文的字符级和词级匹配
- 可配置的相似度阈值和权重
- 使用倒排索引加速初步搜索

## 性能优化

- 实现 LRU（最近最少使用）缓存策略
- 最大缓存容量：2000 条
- 最低相似度阈值：0.08
- 针对中英文优化的相似度计算
- 两级搜索策略：倒排索引用于快速初步结果，然后进行详细评分

## 响应格式

所有接口返回的响应格式如下：
```typescript
interface ResponseContent {
    type: 'text';
    text: string;
}
```

## 开发说明

本项目使用 TypeScript 和 Cloudflare Workers 构建。主要功能在继承自 `WorkerEntrypoint` 的 `RemixIconMCP` 类中实现。

### 设置与部署

```bash
# 安装依赖
npm install

# 运行开发服务器
npm run dev

# 部署到 Cloudflare Workers
npm run deploy

# 运行测试
npm run test
```

## 许可证

[MIT 许可证](LICENSE) 