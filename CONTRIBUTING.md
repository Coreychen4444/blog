# Contributing

Thanks for taking the time. This is a personal writing repo, so the
contribution surface is narrower than a typical software project — but there
are real ways to help, and they're genuinely appreciated.

## What I welcome

### Typos, grammar, broken links (PR directly)

If you spot a typo, awkward phrasing, factual slip, or a dead link, please
open a PR. No issue needed. Small PRs get merged fast.

- Keep the diff focused — one issue per PR if possible.
- Don't rewrite paragraphs for "style" unless the original is wrong.

### Translations (open an issue first)

If you'd like to translate a post, open an issue first so we can coordinate.
Translations live as separate files (e.g., `posts/tech/foo.zh.md`) with a
`translatedFrom` field in the frontmatter. Once accepted, translations are
linked from the original post.

### Content suggestions (open an issue)

If you think a topic is worth covering, open an issue describing what you'd
want to read and why. I don't promise to write anything, but good prompts
often become posts.

## What I don't accept

- **Ghost-written posts or AI-generated filler.** This blog is a personal
  voice; drafts authored by anyone other than me (or an invited guest, with
  explicit credit) won't be merged.
- **Paid placements, affiliate links, or undisclosed sponsored content.**
- **Unilateral rewrites** of an existing post's argument or conclusion.

## Licensing of your contribution

By submitting a PR, you agree that:

- **Prose contributions** (edits to `posts/**/*.md`, `README.md`, etc.) are
  licensed under **CC BY-SA 4.0**, same as the rest of the repo.
- **Code contributions** (edits to `scripts/`, `.github/workflows/`, etc.)
  are licensed under **MIT**, same as `LICENSE-CODE`.

Small typo fixes don't typically require a credit line in the post, but if
your contribution is substantive (e.g., adding a worked example, correcting
an error with a citation), feel free to add yourself to an `acknowledgments`
section at the bottom of the post.

## Local development

To regenerate `posts.json` locally after editing posts:

```bash
node scripts/build-manifest.mjs
```

You don't strictly need to commit `posts.json` — the GitHub Action will
regenerate it on push — but running the script locally is a quick way to
validate your frontmatter (missing fields will error out).

## Style notes

- Post bodies are CommonMark Markdown. Fenced code blocks with language hints
  (` ```go `, ` ```ts `) are syntax-highlighted via Shiki on the rendered
  site.
- Prefer plain prose over bullet lists where the ideas flow.
- Link to primary sources when citing numbers or quotes.
