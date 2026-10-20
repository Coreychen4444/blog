English | [简体中文](README.zh-CN.md)

# Corey's Blog

[![License: CC BY-SA 4.0](https://img.shields.io/badge/content-CC%20BY--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-sa/4.0/)
[![License: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE-CODE)
[![Live site](https://img.shields.io/badge/read%20on-coreyverse.dev%2Fblog-6366f1.svg)](https://coreyverse.dev/blog)

Personal writing by **Corey Chen** — a Go backend engineer based in Singapore.
The content is open source: share it, adapt it, translate it — just give credit
and keep derivatives under the same license.

Rendered at **[coreyverse.dev/blog](https://coreyverse.dev/blog)** via a
GitHub-as-CMS pipeline (this repo is the source of truth). Posts are written
in one language (often Chinese) and published in four: English, 简体中文,
繁體中文 and 日本語 — see [Languages](#languages).

## What's inside

| Topic | What I write about |
|---|---|
| **tech** | Backend engineering, Go, distributed systems, MySQL/Redis/Kafka |
| **travel** | Essays from trips — food, streets, people |
| **trading** | Markets, investing and trading systems, from first principles |
| **ai** | AI and agents: how they work, where they're going, how I build with them |

Browse by topic: [`posts/trading/`](posts/trading) · [`posts/tech/`](posts/tech) · [`posts/ai/`](posts/ai) · [`posts/travel/`](posts/travel)

## Reuse and attribution

Everything in `posts/` and `i18n/` is under **CC BY-SA 4.0**. You can:

- **Quote, translate, repost, remix** — in any medium, commercial or not.
- **Required:** credit _Corey Chen_, link back to the source post on
  [coreyverse.dev/blog](https://coreyverse.dev/blog), and license your
  derivative work under the same CC BY-SA 4.0.
- **Not required** but appreciated: open an issue to let me know, especially
  for translations — I'd love to link to them.

Code in `scripts/` and `.github/workflows/` is **MIT** — see
[`LICENSE-CODE`](LICENSE-CODE).

## Contributing

Found a typo, broken link, or factual error? PRs welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). For content suggestions or translation
interest, open an issue.

## Repo structure

```
posts/                  # Originals, one per post
├── tech/               # Backend engineering, Go, systems
├── travel/             # Essays and food notes
├── trading/            # Markets, investing and trading systems
└── ai/                 # AI and agents
i18n/                   # Translations: i18n/<lang>/<topic>/<name>.md
├── en/  ├── zh/  ├── zh-TW/  └── ja/
posts.json              # Auto-generated manifest — do not edit by hand
scripts/
├── build-manifest.mjs  # posts/ + i18n/ → posts.json
├── i18n.mjs            # translation status / sourceHash helper
└── lib/posts.mjs       # shared frontmatter parser, LANGS, sourceHash
.github/
├── workflows/manifest.yml
└── ISSUE_TEMPLATE/
LICENSE         # CC BY-SA 4.0 (content)
LICENSE-CODE    # MIT (code)
```

## Writing a new post (for future contributors)

1. Create `posts/<topic>/<slug>.md` with this frontmatter:

   ```yaml
   ---
   title: "Post title"
   lang: "en"              # en | zh | zh-TW | ja — the language it is written in
   topic: "tech"           # trading | tech | ai | travel
   type: "essay"           # essay | note | case-note
   status: "published"     # published | draft | updated
   date: "2026-04-17"
   updatedDate: "2026-04-20"   # optional
   excerpt: "One-sentence hook."
   author: "Corey Chen"
   authorUrl: "https://coreyverse.dev"   # optional
   tags: ["Go", "Kafka"]
   readTime: 8
   featured: false         # optional
   ---
   ```

2. Write the body in standard CommonMark Markdown. Fenced code blocks with
   language hints are highlighted via Shiki on the rendered site.
3. Add translations under `i18n/<lang>/<topic>/<slug>.md` (see
   [Languages](#languages)).
4. Commit + push to `main`. The GitHub Action regenerates `posts.json`
   and triggers a rebuild of coreyverse.dev.

### Local manifest build

```bash
node scripts/build-manifest.mjs   # fails on broken frontmatter or translation links
node scripts/i18n.mjs status      # which translations are missing or stale
```

## Languages

Each post has one original under `posts/` and up to three translations under
`i18n/<lang>/`, with the same `<topic>/<slug>` path. The manifest lists a
post's original language (`lang`) and its translations; translations never
appear as separate posts. Each locale of the site shows its own translation of
the title, excerpt and body, falls back to the original with a note when a
translation is missing, and flags translations whose original has changed
since (`sourceHash`). Full rules: [`posts/README.md`](posts/README.md#languages-and-translations).

## Contact

- Website: [coreyverse.dev](https://coreyverse.dev)
- GitHub: [@Coreychen4444](https://github.com/Coreychen4444)
