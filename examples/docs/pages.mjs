/**
 * Which files under `docs/` the documentation site publishes, and how a file becomes a Starlight page.
 * `sync.mjs` writes the pages into `src/content/docs/` (generated, not committed), `astro.config.mjs`
 * builds the sidebar from `sidebar`, and `tests/unit/docs-site.unit.test.mjs` checks the rules.
 *
 * `docs/` stays the single source and keeps reading well on GitHub: its files have no frontmatter, the
 * title is the `# H1`, and links are relative file paths. `toPage` turns the H1 into the `title`, the first
 * paragraph into the `description`, and each relative link into a site URL when the target is published
 * here, or into a GitHub URL when it is not (contributor docs, the archive, source files).
 */
import { posix } from "node:path";

/** The canonical origin and the base path the site is served under (underglass.dev/docs). */
export const site = "https://underglass.dev";
export const base = "/docs/";
export const repository = "https://github.com/RaananW/underglass";

/**
 * The sidebar: each group lists `docs/`-relative sources and the route each one gets. A third element sets the
 * page's `title` and `description` where the file's own H1 and first paragraph are working titles and notes
 * (the names follow `docs/README.md`).
 */
export const sidebar = [
  { label: "Guide", pages: [
    ["guide/getting-started.md", "guide/getting-started"],
    ["guide/concepts.md", "guide/concepts"],
    ["guide/motion.md", "guide/motion"],
    ["guide/effects.md", "guide/effects"],
    ["guide/components.md", "guide/components"],
    ["guide/troubleshooting.md", "guide/troubleshooting"],
    ["guide/frameworks.md", "guide/frameworks"],
  ] },
  { label: "Reference", pages: [
    ["api.md", "reference/api", { title: "API reference", description: "Every export, option and contract of Underglass." }],
    ["effects.md", "reference/effects", { title: "Effects contract", description: "Effect validation, time and fallback rules in detail." }],
    ["worker.md", "reference/worker"],
    ["distribution.md", "reference/distribution", { title: "Distribution", description: "Packing and installing the Underglass packages." }],
  ] },
  { label: "Strata UI", pages: [
    ["ui-library/design-language.md", "strata/design-language"],
    ["ui-library/components/README.md", "strata/components"],
  ] },
];

/** The route of the docs home page, from `docs/README.md`. */
export const home = ["README.md", ""];

/** Every component page in `docs/ui-library/components/` is published under `strata/components/`. */
const componentDirectory = "ui-library/components/";

/** Maps each published `docs/`-relative source to its route (no base, no leading slash; `""` is the home). */
export function routes(componentFiles) {
  const map = new Map([home, ...sidebar.flatMap(group => group.pages.map(([source, route]) => [source, route]))]);
  for (const file of componentFiles) {
    if (file !== "README.md" && file.endsWith(".md")) map.set(`${componentDirectory}${file}`, `strata/components/${file.slice(0, -3)}`);
  }
  return map;
}

/** The `title` and `description` set in `sidebar`, by source. */
export const overrides = new Map(sidebar.flatMap(group => group.pages.filter(page => page[2]).map(([source, , override]) => [source, override])));

/** The site URL of a route, under the base path. */
export const url = route => `${base}${route}`.replace(/\/$/, "") || "/";

/**
 * Rewrites one link target found in `source` (a `docs/`-relative file). Absolute URLs, `mailto:` and
 * same-page anchors stay as they are. A relative target becomes the site URL of a published page, with its
 * anchor, or else the file's GitHub URL (`tree` for a directory).
 */
export function rewriteLink(target, source, map) {
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) return target;
  const [path, anchor] = target.split(/(?=#)/);
  const docsPath = posix.normalize(posix.join(posix.dirname(source), decodeURI(path)));
  const route = map.get(docsPath);
  if (route !== undefined) return `${url(route)}${anchor ?? ""}`;
  const repoPath = posix.normalize(posix.join("docs", docsPath));
  if (repoPath.startsWith("..")) throw new Error(`${source}: link ${target} leaves the repository`);
  // `normalize` keeps a directory's trailing slash.
  return `${repository}/${path.endsWith("/") ? "tree" : "blob"}/main/${repoPath}${anchor ?? ""}`;
}

/** Rewrites every inline link target outside code (fenced blocks and inline code spans stay untouched). */
export function rewriteLinks(markdown, source, map) {
  let fenced = false;
  return markdown.split("\n").map(line => {
    if (/^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; return line; }
    if (fenced) return line;
    return line.replace(/(`+)[\s\S]*?\1|\]\(([^)\s]+)\)/g, (match, code, target) => code ? match : `](${rewriteLink(target, source, map)})`);
  }).join("\n");
}

/** Plain text of a Markdown paragraph: links keep their text, emphasis and code marks go. */
const plain = text => text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

/** The first paragraph after the title, as a meta description of at most 160 characters. */
export function description(body) {
  const paragraph = body.split(/\n\s*\n/).map(block => block.trim())
    .find(block => block && !/^(?:#|```|~~~|\||[-*] |\d+\. |>|<)/.test(block));
  if (!paragraph) return undefined;
  const text = plain(paragraph);
  return text.length <= 160 ? text : `${text.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

/**
 * Turns a `docs/` file into a Starlight page: frontmatter from its H1 and first paragraph (or `override`, by
 * default the source's entry in `overrides`), links rewritten.
 */
export function toPage(markdown, source, map, override = overrides.get(source)) {
  const text = markdown.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const match = text.match(/^# (.+)\n/);
  if (!match) throw new Error(`${source}: a published page must start with a # title`);
  const body = rewriteLinks(text.slice(match[0].length), source, map);
  const summary = override?.description ?? description(body);
  // JSON strings are valid YAML scalars, so titles with colons or quotes need no further escaping.
  const frontmatter = [
    `title: ${JSON.stringify(override?.title ?? match[1].trim())}`,
    ...(summary ? [`description: ${JSON.stringify(summary)}`] : []),
    `editUrl: ${JSON.stringify(`${repository}/edit/main/docs/${source}`)}`,
  ];
  return `---\n${frontmatter.join("\n")}\n---\n${body}`;
}

/** The generated file of a route inside `src/content/docs/`. */
export const outputFile = route => `${route || "index"}.md`;
