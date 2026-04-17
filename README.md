# Corey's Blog

Personal writing — tech essays, travel notes, and investment thinking.
Rendered on [coreyverse.dev/blog](https://coreyverse.dev/blog) via GitHub-as-CMS.

## Structure

```
posts/
├── tech/       # Backend engineering, distributed systems, Go
├── travel/     # Travel essays and food notes
└── finance/    # Investing and market thinking
posts.json      # Auto-generated manifest (do not edit by hand)
scripts/
└── build-manifest.mjs
.github/workflows/manifest.yml
```

## Writing a new post

1. Create `posts/<topic>/<slug>.md` with frontmatter:

   ```yaml
   ---
   title: "Post title"
   topic: "tech"          # tech | travel | finance
   type: "essay"          # essay | note | case-note
   status: "published"    # published | draft | updated
   date: "2026-04-17"
   excerpt: "One-sentence hook."
   tags: ["Go", "Kafka"]
   readTime: 8
   featured: false        # optional
   ---
   ```

2. Write the body in standard Markdown.
3. Commit + push. The GitHub Action regenerates `posts.json` automatically.
4. `coreyverse` will pick it up on next request (30-min cache).

## Local manifest build

```bash
node scripts/build-manifest.mjs
```
