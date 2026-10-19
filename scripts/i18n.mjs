#!/usr/bin/env node
// Translation helper for the blog repo (zero deps).
//
//   node scripts/i18n.mjs status [--all]   table of originals × languages:
//                                           ok / STALE / missing (published posts only unless --all)
//   node scripts/i18n.mjs hash <posts/…md>  print the sourceHash to put in a translation
//   node scripts/i18n.mjs stamp <i18n/…md>  set the translation's sourceHash to its original's
//                                           current hash (only after re-checking the translation!)
//
// Layout and frontmatter rules: posts/README.md.

import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, parseFrontmatter, sourceHash, originalLang } from "./lib/posts.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const posix = (p) => p.split(sep).join("/");

async function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.name.endsWith(".md") && !/^readme\.md$/i.test(e.name)) out.push(full);
  }
  return out;
}

async function status(all) {
  const rows = [];
  for (const file of (await walk(join(REPO_ROOT, "posts"))).sort()) {
    const raw = await readFile(file, "utf8");
    const parsed = parseFrontmatter(raw);
    if (!parsed) continue;
    const slug = posix(relative(join(REPO_ROOT, "posts"), file)).replace(/\.md$/, "");
    const { data } = parsed;
    if (!all && data.status === "draft") continue;
    const orig = originalLang(data);
    const hash = sourceHash(raw);
    const cells = {};
    for (const lang of LANGS) {
      if (lang === orig) { cells[lang] = "original"; continue; }
      const tr = join(REPO_ROOT, "i18n", lang, `${slug}.md`);
      if (!existsSync(tr)) { cells[lang] = "missing"; continue; }
      const t = parseFrontmatter(await readFile(tr, "utf8"));
      cells[lang] = t?.data.sourceHash === hash ? "ok" : "STALE";
    }
    rows.push({ slug, status: data.status, ...cells });
  }
  const cols = ["slug", "status", ...LANGS];
  const width = Object.fromEntries(cols.map((c) => [c, Math.max(c.length, ...rows.map((r) => String(r[c]).length))]));
  const line = (r) => cols.map((c) => String(r[c]).padEnd(width[c])).join("  ");
  console.log(line(Object.fromEntries(cols.map((c) => [c, c]))));
  for (const r of rows) console.log(line(r));
  const todo = rows.flatMap((r) => LANGS.filter((l) => r[l] === "missing" || r[l] === "STALE").map((l) => `${r.slug} [${l}] ${r[l]}`));
  console.log(todo.length ? `\n${todo.length} translation(s) to write or refresh` : "\nAll translations present and current.");
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "status" || !cmd) {
  await status(arg === "--all");
} else if (cmd === "hash" && arg) {
  console.log(sourceHash(await readFile(resolve(arg), "utf8")));
} else if (cmd === "stamp" && arg) {
  const file = resolve(arg);
  const raw = await readFile(file, "utf8");
  const from = parseFrontmatter(raw)?.data.translatedFrom;
  if (!from) throw new Error(`${arg}: no translatedFrom`);
  const hash = sourceHash(await readFile(join(REPO_ROOT, "posts", `${from}.md`), "utf8"));
  const next = /^sourceHash:.*$/m.test(raw)
    ? raw.replace(/^sourceHash:.*$/m, `sourceHash: "${hash}"`)
    : raw.replace(/^(---\r?\n[\s\S]*?)(\r?\n---)/, `$1\nsourceHash: "${hash}"$2`);
  await writeFile(file, next, "utf8");
  console.log(`${arg}: sourceHash = ${hash}`);
} else {
  console.error("usage: node scripts/i18n.mjs status [--all] | hash <posts/…md> | stamp <i18n/…md>");
  process.exit(2);
}
