// Shared helpers for the blog scripts (zero dependencies).
//
// Layout (see posts/README.md):
//   posts/<topic>/<name>.md            the original, in any of LANGS
//   i18n/<lang>/<topic>/<name>.md      a translation of posts/<topic>/<name>.md
//
// A translation's frontmatter holds only what may differ from the original:
//   translatedFrom: "<topic>/<name>"   required, must resolve to an original
//   lang: "en" | "zh" | "zh-TW" | "ja" required, must match the folder
//   title, excerpt                     required, translated
//   readTime                           optional, defaults to the original's
//   sourceHash                         sourceHash() of the original when translated
// topic, type, status, date, updatedDate, tags, featured, author and authorUrl
// are inherited from the original and must not be contradicted.
//
// Keep LANGS and sourceHash() in sync with
// ~/Desktop/job-search/skills/blog-publish/scripts/check-post.mjs.

import { createHash } from "node:crypto";

/** Content languages. Same codes as the site's locales (coreyverse src/lib/i18n). */
export const LANGS = ["en", "zh", "zh-TW", "ja"];

/** Fields a translation inherits from its original. */
export const INHERITED = ["topic", "type", "status", "date", "updatedDate", "tags", "featured", "author", "authorUrl"];

/** Split a Markdown file into { data, body }. Returns null without a frontmatter block. */
export function parseFrontmatter(raw) {
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n").trimStart();
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const data = {};
  for (const line of text.slice(3, end).trim().split("\n")) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (m) data[m[1]] = parseValue(m[2].trim());
  }
  const body = text.slice(end + 4).replace(/^[^\n]*\n/, "");
  return { data, body };
}

function parseValue(v) {
  if (!v) return "";
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((x) => x.trim())
      .map((x) => ((x.startsWith('"') && x.endsWith('"')) || (x.startsWith("'") && x.endsWith("'")) ? x.slice(1, -1) : x));
  }
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

/**
 * Fingerprint of the translatable part of an original: title, excerpt and
 * body (frontmatter-only edits such as status or tags do not change it).
 * 16 hex chars of SHA-256 over "title\nexcerpt\n\nbody" with LF line endings.
 */
export function sourceHash(raw) {
  const parsed = parseFrontmatter(raw);
  if (!parsed) return "";
  const { data, body } = parsed;
  const text = `${data.title ?? ""}\n${data.excerpt ?? ""}\n\n${body.trim()}`;
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/** Language of an original: its `lang` field, else a guess from the title and excerpt. */
export function originalLang(data) {
  if (LANGS.includes(data.lang)) return data.lang;
  const text = `${data.title ?? ""} ${data.excerpt ?? ""}`;
  if (/[぀-ヿ]/.test(text)) return "ja";
  if (/[一-鿿]/.test(text)) return "zh";
  return "en";
}
