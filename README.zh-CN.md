[English](README.md) | 简体中文

# Corey 的博客

[![License: CC BY-SA 4.0](https://img.shields.io/badge/content-CC%20BY--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-sa/4.0/)
[![License: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE-CODE)
[![Live site](https://img.shields.io/badge/read%20on-coreyverse.dev%2Fblog-6366f1.svg)](https://coreyverse.dev/blog)

**Corey Chen** 的个人写作。他是一名在新加坡工作的 Go 后端工程师。
内容开源：欢迎分享、改编、翻译，只需注明出处，并让衍生作品沿用同一许可证。

内容通过 GitHub-as-CMS 流水线渲染在 **[coreyverse.dev/blog](https://coreyverse.dev/blog)**
（本仓库是唯一的事实来源）。

## 内容概览

| 主题 | 写些什么 |
|---|---|
| **ai** | AI 与 Agent：原理、走向，以及我如何用它们搭建系统 |
| **trading** | 从第一性原理出发谈市场、投资与交易系统 |
| **tech** | 后端工程、Go、分布式系统、MySQL/Redis/Kafka |
| **travel** | 旅行随笔：美食、街巷、人 |

按主题浏览：[`posts/ai/`](posts/ai) · [`posts/trading/`](posts/trading) · [`posts/tech/`](posts/tech) · [`posts/travel/`](posts/travel)

## 转载与署名

`posts/` 下的所有内容采用 **CC BY-SA 4.0** 许可。你可以：

- **引用、翻译、转载、二次创作**：任何媒介，商业或非商业用途均可。
- **必须：** 署名 _Corey Chen_，链接回
  [coreyverse.dev/blog](https://coreyverse.dev/blog) 上的原文，并让你的衍生作品
  同样采用 CC BY-SA 4.0 许可。
- **非必须**但欢迎：开一个 issue 告诉我，尤其是翻译，我很乐意加上链接。

`scripts/` 和 `.github/workflows/` 中的代码采用 **MIT** 许可，见
[`LICENSE-CODE`](LICENSE-CODE)。

## 参与贡献

发现错别字、失效链接或事实错误？欢迎提 PR，参见
[CONTRIBUTING.md](CONTRIBUTING.md)。如果有内容建议或想参与翻译，请开一个 issue。

## 仓库结构

```
posts/
├── ai/         # AI 与 Agent
├── trading/    # 市场、投资与交易系统
├── tech/       # 后端工程、Go、系统
└── travel/     # 随笔与美食笔记
posts.json      # 自动生成的清单，请勿手动编辑
scripts/
└── build-manifest.mjs
.github/
├── workflows/manifest.yml
└── ISSUE_TEMPLATE/
LICENSE         # CC BY-SA 4.0（内容）
LICENSE-CODE    # MIT（代码）
```

## 撰写新文章（写给未来的贡献者）

1. 创建 `posts/<topic>/<slug>.md`，使用以下 frontmatter：

   ```yaml
   ---
   title: "Post title"
   topic: "tech"           # ai | trading | tech | travel
   type: "essay"           # essay | note | case-note
   status: "published"     # published | draft | updated
   date: "2026-04-17"
   updatedDate: "2026-04-20"   # 可选
   excerpt: "One-sentence hook."
   author: "Corey Chen"
   authorUrl: "https://coreyverse.dev"   # 可选
   tags: ["Go", "Kafka"]
   readTime: 8
   featured: false         # 可选
   ---
   ```

2. 正文使用标准 CommonMark Markdown。带语言标注的围栏代码块会在渲染后的站点上
   通过 Shiki 高亮。
3. 提交并推送到 `main`。GitHub Action 会自动重新生成 `posts.json`。
4. `coreyverse` 会在下一次请求时拉取新文章（缓存 TTL 为 30 分钟）。

### 本地构建清单

```bash
node scripts/build-manifest.mjs
```

## 联系方式

- 网站：[coreyverse.dev](https://coreyverse.dev)
- GitHub：[@Coreychen4444](https://github.com/Coreychen4444)
