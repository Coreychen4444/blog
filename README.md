# Corey's Blog

[![License: CC BY-SA 4.0](https://img.shields.io/badge/content-CC%20BY--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-sa/4.0/)
[![License: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE-CODE)
[![Live site](https://img.shields.io/badge/read%20on-coreyverse.dev%2Fblog-6366f1.svg)](https://coreyverse.dev/blog)

Personal writing by **Corey Chen** — a Go backend engineer based in Singapore.
The content is open source: share it, adapt it, translate it — just give credit
and keep derivatives under the same license.

Rendered at **[coreyverse.dev/blog](https://coreyverse.dev/blog)** via a
GitHub-as-CMS pipeline (this repo is the source of truth).

## What's inside

| Topic | What I write about |
|---|---|
| **tech** | Backend engineering, Go, distributed systems, MySQL/Redis/Kafka |
| **travel** | Essays from trips — food, streets, people |
| **finance** | Investing and markets, from first principles |

Browse by topic: [`posts/tech/`](posts/tech) · [`posts/travel/`](posts/travel) · [`posts/finance/`](posts/finance)

## Reuse and attribution

Everything in `posts/` is under **CC BY-SA 4.0**. You can:

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
posts/
├── tech/       # Backend engineering, Go, systems
├── travel/     # Essays and food notes
└── finance/    # Investing and markets
posts.json      # Auto-generated manifest — do not edit by hand
scripts/
└── build-manifest.mjs
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
   topic: "tech"           # tech | travel | finance
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
3. Commit + push to `main`. The GitHub Action regenerates `posts.json`
   automatically.
4. `coreyverse` will pick it up on the next request (30-minute cache TTL).

### Local manifest build

```bash
node scripts/build-manifest.mjs
```

## Contact

- Website: [coreyverse.dev](https://coreyverse.dev)
- GitHub: [@Coreychen4444](https://github.com/Coreychen4444)
