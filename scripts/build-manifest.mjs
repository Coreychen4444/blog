#!/usr/bin/env node
// Scans posts/**/*.md, reads YAML frontmatter, emits posts.json at repo root.
// Zero-deps: tiny frontmatter parser (only handles the fields we own).

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const POSTS_DIR = join(REPO_ROOT, "posts");
const OUTPUT = join(REPO_ROOT, "posts.json");

const REQUIRED = ["title", "topic", "type", "status", "date", "excerpt", "author", "tags", "readTime"];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (
      e.isFile() &&
      e.name.endsWith(".md") &&
      !/^readme\.md$/i.test(e.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

function parseFrontmatter(raw) {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) return null;
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = trimmed.slice(3, end).trim();
  const data = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    data[key] = parseValue(rawVal.trim());
  }
  return data;
}

function parseValue(v) {
  if (!v) return "";
  // String in quotes
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  // Array: [a, b, "c"]
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((x) => x.trim())
      .map((x) =>
        (x.startsWith('"') && x.endsWith('"')) || (x.startsWith("'") && x.endsWith("'"))
          ? x.slice(1, -1)
          : x
      );
  }
  // Boolean
  if (v === "true") return true;
  if (v === "false") return false;
  // Number
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function toSlug(relPath) {
  // posts/tech/foo.md -> tech/foo
  return relPath
    .split(sep)
    .join("/")
    .replace(/^posts\//, "")
    .replace(/\.md$/, "");
}

async function main() {
  const files = await walk(POSTS_DIR);
  const posts = [];
  const errors = [];

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const fm = parseFrontmatter(raw);
    const rel = relative(REPO_ROOT, file);
    if (!fm) {
      errors.push(`${rel}: missing or invalid frontmatter`);
      continue;
    }
    const missing = REQUIRED.filter((k) => !(k in fm));
    if (missing.length) {
      errors.push(`${rel}: missing fields [${missing.join(", ")}]`);
      continue;
    }
    posts.push({
      slug: toSlug(rel),
      path: rel.split(sep).join("/"),
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
    });
  }

  if (errors.length) {
    console.error("Frontmatter errors:");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }

  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const manifest = {
    generatedAt: new Date().toISOString(),
    count: posts.length,
    posts,
  };

  await writeFile(OUTPUT, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Wrote ${OUTPUT} (${posts.length} posts)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
