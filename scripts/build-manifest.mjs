#!/usr/bin/env node
// Scans posts/**/*.md (originals) and i18n/<lang>/**/*.md (translations),
// reads their YAML frontmatter and emits posts.json at the repo root.
// Zero deps: a tiny frontmatter parser that only handles the fields we own
// (scripts/lib/posts.mjs).
//
// posts.json shape (schemaVersion 2, backward-compatible with v1 readers,
// which ignore the extra keys):
//   { schemaVersion, generatedAt, count, posts: [ {
//       slug, path, title, topic, type, status, date, updatedDate, excerpt,
//       author, authorUrl, tags, readTime, featured,      // v1 fields
//       lang,                                              // language of the original
//       sourceHash,                                        // fingerprint of the original's text
//       translations: [ { lang, path, title, excerpt, readTime, sourceHash, stale } ]
//   } ] }
// Translations are never listed as posts of their own; `count` counts originals.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, INHERITED, parseFrontmatter, sourceHash, originalLang } from "./lib/posts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const POSTS_DIR = join(REPO_ROOT, "posts");
const I18N_DIR = join(REPO_ROOT, "i18n");
const OUTPUT = join(REPO_ROOT, "posts.json");

const REQUIRED = ["title", "topic", "type", "status", "date", "excerpt", "author", "tags", "readTime"];
const REQUIRED_TRANSLATION = ["translatedFrom", "lang", "title", "excerpt"];

async function walk(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile() && e.name.endsWith(".md") && !/^readme\.md$/i.test(e.name)) out.push(full);
  }
  return out;
}

const posix = (p) => p.split(sep).join("/");

function toSlug(relPath) {
  // posts/tech/foo.md -> tech/foo
  return posix(relPath).replace(/^posts\//, "").replace(/\.md$/, "");
}

async function main() {
  const errors = [];
  const warnings = [];
  const posts = [];
  const bySlug = new Map();

  for (const file of await walk(POSTS_DIR)) {
    const raw = await readFile(file, "utf8");
    const parsed = parseFrontmatter(raw);
    const rel = posix(relative(REPO_ROOT, file));
    if (!parsed) {
      errors.push(`${rel}: missing or invalid frontmatter`);
      continue;
    }
    const fm = parsed.data;
    const missing = REQUIRED.filter((k) => !(k in fm));
    if (missing.length) {
      errors.push(`${rel}: missing fields [${missing.join(", ")}]`);
      continue;
    }
    if ("translatedFrom" in fm) {
      errors.push(`${rel}: translations belong under i18n/<lang>/, not posts/`);
      continue;
    }
    if ("lang" in fm && !LANGS.includes(fm.lang)) {
      errors.push(`${rel}: lang "${fm.lang}" is not one of ${LANGS.join(", ")}`);
      continue;
    }
    const post = {
      slug: toSlug(rel),
      path: rel,
      title: fm.title,
      topic: fm.topic,
      type: fm.type,
      status: fm.status,
      date: fm.date,
      updatedDate: fm.updatedDate || null,
      excerpt: fm.excerpt,
      author: fm.author,
      authorUrl: fm.authorUrl || null,
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      readTime: fm.readTime,
      featured: fm.featured === true,
      lang: originalLang(fm),
      sourceHash: sourceHash(raw),
      translations: [],
    };
    posts.push(post);
    bySlug.set(post.slug, post);
  }

  for (const file of await walk(I18N_DIR)) {
    const raw = await readFile(file, "utf8");
    const parsed = parseFrontmatter(raw);
    const rel = posix(relative(REPO_ROOT, file));
    if (!parsed) {
      errors.push(`${rel}: missing or invalid frontmatter`);
      continue;
    }
    const fm = parsed.data;
    const m = rel.match(/^i18n\/([^/]+)\/(.+)\.md$/);
    const folderLang = m?.[1];
    if (!m || !LANGS.includes(folderLang)) {
      errors.push(`${rel}: translations must live at i18n/<${LANGS.join("|")}>/<topic>/<name>.md`);
      continue;
    }
    const missing = REQUIRED_TRANSLATION.filter((k) => !(k in fm) || fm[k] === "");
    if (missing.length) {
      errors.push(`${rel}: missing fields [${missing.join(", ")}]`);
      continue;
    }
    if (fm.lang !== folderLang) {
      errors.push(`${rel}: lang "${fm.lang}" disagrees with folder i18n/${folderLang}/`);
      continue;
    }
    if (fm.translatedFrom !== m[2]) {
      errors.push(`${rel}: translatedFrom "${fm.translatedFrom}" must equal its path under i18n/${folderLang}/ ("${m[2]}")`);
      continue;
    }
    const original = bySlug.get(fm.translatedFrom);
    if (!original) {
      errors.push(`${rel}: translatedFrom "${fm.translatedFrom}" does not resolve to posts/${fm.translatedFrom}.md`);
      continue;
    }
    if (original.lang === fm.lang) {
      errors.push(`${rel}: the original is already in "${fm.lang}"`);
      continue;
    }
    for (const k of INHERITED) {
      if (k in fm) warnings.push(`${rel}: "${k}" is inherited from the original and ignored here`);
    }
    if (fm.readTime !== undefined && !(Number.isInteger(fm.readTime) && fm.readTime > 0)) {
      errors.push(`${rel}: readTime must be a positive integer`);
      continue;
    }
    const hash = typeof fm.sourceHash === "string" ? fm.sourceHash : "";
    const stale = hash !== original.sourceHash;
    if (stale) warnings.push(`${rel}: stale (sourceHash ${hash || "missing"} ≠ original ${original.sourceHash})`);
    original.translations.push({
      lang: fm.lang,
      path: rel,
      title: fm.title,
      excerpt: fm.excerpt,
      readTime: fm.readTime ?? original.readTime,
      sourceHash: hash || null,
      stale,
    });
  }

  if (errors.length) {
    console.error("Frontmatter errors:");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  for (const w of warnings) console.warn("warning: " + w);

  for (const p of posts) p.translations.sort((a, b) => LANGS.indexOf(a.lang) - LANGS.indexOf(b.lang));
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  const manifest = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    count: posts.length,
    posts,
  };

  await writeFile(OUTPUT, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const nTr = posts.reduce((n, p) => n + p.translations.length, 0);
  console.log(`Wrote ${OUTPUT} (${posts.length} posts, ${nTr} translations)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
