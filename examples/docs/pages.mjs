/**
 * Which files under `docs/` the documentation site publishes, and how a file becomes a Starlight page.
 * `sync.mjs` writes the pages into `src/content/docs/` (generated, not committed), `astro.config.mjs`
 * builds the sidebar from `sidebar`, and `tests/unit/docs-site.unit.test.mjs` checks the rules.
 *
 * `docs/` stays the single source and keeps reading well on GitHub: its files have no frontmatter, the
 * title is the `# H1`, and links are relative file paths. `toPage` turns the H1 into the `title`, the first
 * paragraph into the `description`, and each relative link into a site URL when the target is published
 * here, or into a GitHub URL when it is not (contributor docs, the archive, source files).
 *
 * For AI agents and other tools that read Markdown, `sync.mjs` also writes a Markdown copy of every page
 * (`/docs/guide/concepts.md` next to `/docs/guide/concepts`, `/docs/index.md` for the home page), `llms.txt`
 * (https://llmstxt.org) and `llms-full.txt`, the Guide and Reference in one file. Each HTML page names its copy in a
 * `<link rel="alternate" type="text/markdown">`.
 */
import { posix } from "node:path";

/** The canonical origin and the base path the site is served under (underglass.dev/docs). */
export const site = "https://underglass.dev";
export const base = "/docs/";
export const repository = "https://github.com/RaananW/underglass";

/** What Underglass is, in one sentence: the summary line of `llms.txt`. */
export const summary = "Underglass is a GPU-first React framework: it draws your original React DOM into one shared WebGPU compositor with Chrome's HTML-in-Canvas API, while inputs, focus and clicks stay native.";

/** The sidebar: each group lists `docs/`-relative sources and the route each one gets. */
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
    ["api.md", "reference/api"],
    ["effects.md", "reference/effects"],
    ["worker.md", "reference/worker"],
    ["distribution.md", "reference/distribution"],
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
  const map = new Map([home, ...sidebar.flatMap(group => group.pages)]);
  for (const file of componentFiles) {
    if (file !== "README.md" && file.endsWith(".md")) map.set(`${componentDirectory}${file}`, `strata/components/${file.slice(0, -3)}`);
  }
  return map;
}

/** The site URL of a route, under the base path. */
export const url = route => `${base}${route}`.replace(/\/$/, "") || "/";

/** The generated file of a route, inside `src/content/docs/` and, for its Markdown copy, inside `public/`. */
export const outputFile = route => `${route || "index"}.md`;

/** The site URL of a route's Markdown copy. */
export const markdownUrl = route => `${base}${outputFile(route)}`;

/**
 * Rewrites one link target found in `source` (a `docs/`-relative file). Absolute URLs, `mailto:` and
 * same-page anchors stay as they are. A relative target becomes the site URL of a published page, with its
 * anchor and after `origin` (empty for a site-relative URL), or else the file's GitHub URL (`tree` for a
 * directory).
 */
export function rewriteLink(target, source, map, origin = "") {
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) return target;
  const [path, anchor] = target.split(/(?=#)/);
  const docsPath = posix.normalize(posix.join(posix.dirname(source), decodeURI(path)));
  const route = map.get(docsPath);
  if (route !== undefined) return `${origin}${url(route)}${anchor ?? ""}`;
  const repoPath = posix.normalize(posix.join("docs", docsPath));
  if (repoPath.startsWith("..")) throw new Error(`${source}: link ${target} leaves the repository`);
  // `normalize` keeps a directory's trailing slash.
  return `${repository}/${path.endsWith("/") ? "tree" : "blob"}/main/${repoPath}${anchor ?? ""}`;
}

/** Rewrites every inline link target outside code (fenced blocks and inline code spans stay untouched). */
export function rewriteLinks(markdown, source, map, origin = "") {
  let fenced = false;
  return markdown.split("\n").map(line => {
    if (/^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; return line; }
    if (fenced) return line;
    return line.replace(/(`+)[\s\S]*?\1|\]\(([^)\s]+)\)/g, (match, code, target) => code ? match : `](${rewriteLink(target, source, map, origin)})`);
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
 * Reads a `docs/` file as a page: the H1 is its `title`, the first paragraph its `description`, and the rest
 * its `body`, with links rewritten (site links after `origin`).
 */
export function readPage(markdown, source, map, origin = "") {
  // A leading byte order mark (U+FEFF) is dropped.
  const text = (markdown.charCodeAt(0) === 0xfeff ? markdown.slice(1) : markdown).replace(/\r\n/g, "\n");
  const match = text.match(/^# (.+)\n/);
  if (!match) throw new Error(`${source}: a published page must start with a # title`);
  const body = rewriteLinks(text.slice(match[0].length), source, map, origin);
  return { title: match[1].trim(), description: description(body), body };
}

/** Turns a `docs/` file into a Starlight page: frontmatter from its H1 and first paragraph, links rewritten. */
export function toPage(markdown, source, map) {
  const { title, description: about, body } = readPage(markdown, source, map);
  const alternate = { tag: "link", attrs: { rel: "alternate", type: "text/markdown", href: markdownUrl(map.get(source)) } };
  // JSON is valid YAML, so titles with colons or quotes need no further escaping.
  const frontmatter = [
    `title: ${JSON.stringify(title)}`,
    ...(about ? [`description: ${JSON.stringify(about)}`] : []),
    `editUrl: ${JSON.stringify(`${repository}/edit/main/docs/${source}`)}`,
    `head: ${JSON.stringify([alternate])}`,
  ];
  return `---\n${frontmatter.join("\n")}\n---\n${body}`;
}

/** The Markdown copy of a page that `readPage` read with the site origin, so its links are absolute. */
export const toMarkdown = page => `# ${page.title}\n${page.body}`;

/**
 * The pages `llms.txt` lists: the sidebar groups in order, then every component page. The home page is left
 * out; it only links the others.
 */
function llmsSections(map) {
  return [
    ...sidebar.map(group => [group.label, group.pages.map(([, route]) => route)]),
    ["Strata components", [...map.values()].filter(route => route.startsWith("strata/components/"))],
  ];
}

/**
 * The sections `llms-full.txt` holds: the framework. The Strata pages are left out; at about 700 KB they are
 * four times the rest, more than an agent can read in one fetch, and only needed with `@underglass/ui`.
 */
const fullSections = new Set(["Guide", "Reference"]);

/**
 * `llms.txt` (https://llmstxt.org): the summary, then a link to each page's Markdown copy with its description.
 * `pages` maps each route to what `readPage` returned for it.
 */
export function llmsIndex(map, pages) {
  const entry = route => {
    const { title, description: about } = pages.get(route);
    return `- [${title}](${site}${markdownUrl(route)})${about ? `: ${about}` : ""}`;
  };
  return [
    "# Underglass",
    "",
    `> ${summary}`,
    "",
    "Install `@underglass/react` (React 18.3 or 19), or `@underglass/vue` for Vue 3.5; both bring the framework-neutral runtime `@underglass/core`. GPU mode needs Chrome Canary with HTML-in-Canvas enabled, and every other browser runs the same app as ordinary DOM.",
    "",
    `Each link below is the Markdown copy of a page at ${site}${url("")}. The Guide and Reference pages are also in one file, [llms-full.txt](${site}${base}llms-full.txt) (${Math.round(Buffer.byteLength(llmsFull(map, pages)) / 1024)} KB).`,
    "",
    ...llmsSections(map).flatMap(([label, routes]) => [`## ${label}`, "", ...routes.map(entry), ""]),
    "## Optional",
    "",
    `- [Live examples](${site}/): the showcase, which needs JavaScript, and Chrome Canary for GPU mode`,
    `- [Source code](${repository}): the repository; the examples are in \`examples/showcase\``,
    "",
  ].join("\n");
}

/** `llms-full.txt`: the Guide and Reference pages in sidebar order, each headed by its title and URL. */
export function llmsFull(map, pages) {
  return llmsSections(map).filter(([label]) => fullSections.has(label)).flatMap(([, routes]) => routes).map(route => {
    const { title, body } = pages.get(route);
    return `# ${title}\n\nURL: ${site}${url(route)}\n${body}`;
  }).join("\n");
}
