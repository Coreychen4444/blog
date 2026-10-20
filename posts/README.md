# Posts

Source markdown for [coreyverse.dev/blog](https://coreyverse.dev/blog).

Browse by topic:

- [`tech/`](tech) — backend engineering, Go, distributed systems
- [`travel/`](travel) — essays from trips, food and streets
- [`trading/`](trading) — markets, investing and trading systems
- [`ai/`](ai) — AI and agents

Each post is a standalone `.md` file with YAML frontmatter. See the repo
[README](../README.md#writing-a-new-post-for-future-contributors) for the
frontmatter schema.

## Languages and translations

Every post here is the **original**, in the language it was written in
(declared by `lang:` in its frontmatter: `en`, `zh`, `zh-TW` or `ja`).
Translations live outside `posts/`, in a parallel tree under
[`../i18n/`](../i18n), one folder per language:

```
posts/<topic>/<name>.md              original (e.g. lang: "zh")
i18n/en/<topic>/<name>.md            English translation
i18n/zh/<topic>/<name>.md            Simplified Chinese translation
i18n/zh-TW/<topic>/<name>.md         Traditional Chinese (Taiwan) translation
i18n/ja/<topic>/<name>.md            Japanese translation
```

A translation keeps the original's `<topic>/<name>`, so it never becomes a
post of its own and the URL stays the same in every language:
`coreyverse.dev/blog/<topic>/<name>` (English), `/zh/blog/…`, `/zh-tw/blog/…`
and `/ja/blog/…`. There is no translation file for the original's own
language.

Translation frontmatter carries only what can differ from the original:

```yaml
---
translatedFrom: "tech/gorm-preload-mechanism"   # <topic>/<name> of the original; must match the path
lang: "zh"                                       # en | zh | zh-TW | ja; must match the i18n/<lang>/ folder
title: "深入解析 GORM 的 Preload 机制"
excerpt: "…"
readTime: 8                                      # optional; defaults to the original's
sourceHash: "9ba715d6fe209335"                   # the original's hash when this was translated
---
```

`topic`, `type`, `status`, `date`, `updatedDate`, `tags`, `featured`,
`author` and `authorUrl` are inherited from the original. Don't repeat them;
if you do, they must be identical. A draft original keeps its translations
off the site too.

`sourceHash` is the first 16 hex characters of SHA-256 over the original's
title, excerpt and body (`scripts/lib/posts.mjs`). When the original's text
changes, its hash changes and the translation is reported as **stale** (by
`scripts/build-manifest.mjs`, `scripts/i18n.mjs status` and the site, which
shows a "the original has been revised" note) until it is updated and
re-stamped:

```bash
node scripts/i18n.mjs status                         # originals × languages: ok / STALE / missing
node scripts/i18n.mjs hash posts/tech/foo.md         # hash to put in a new translation
node scripts/i18n.mjs stamp i18n/ja/tech/foo.md      # set sourceHash after re-checking a translation
```

Translations are faithful: no added facts, numbers or opinions, code blocks
unchanged except prose comments. zh-TW is written for Taiwan readers (Taiwan
vocabulary, 「」 quotes), not converted character by character. If a post has
Simplified Chinese text but no zh-TW file, the site converts it with OpenCC at
build time and says so on the page; a locale with no version at all shows the
original with a "translation unavailable" note.

Content is licensed under [**CC BY-SA 4.0**](../LICENSE) — reuse is welcome
with attribution and the same license. Translations are covered by the same
license.
