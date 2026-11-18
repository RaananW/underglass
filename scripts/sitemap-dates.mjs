/**
 * The dates in `sitemap.xml` (`<lastmod>`): for each page, the day its indexed text last changed. A search engine
 * reads the date to decide what to fetch again, and stops trusting dates that move when nothing did, so a page's
 * date changes only when the page does.
 *
 * The deployment has no history to ask (Vercel builds without `.git`), so the site carries its own: each build
 * publishes `sitemap-dates.json` beside the sitemap, with a fingerprint and a date per URL. The next build reads
 * the published file, keeps the date of every page whose fingerprint is the same, and gives today's date to the
 * others. `scripts/assemble-site.mjs` calls this in `npm run build:site`.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * What a search engine indexes of a page: its title, its description and the text of its main content (the whole
 * body where there is no `<main>`). Markup, scripts, styles and the hashed names of assets are left out, so a build
 * that only changed code or styling gives the same text. The documentation's sidebar is outside `<main>`, so a new
 * page does not change every other one.
 */
export function indexedText(html) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const description = /\bcontent="([^"]*)"/i.exec(/<meta\b[^>]*\bname="description"[^>]*>/i.exec(html)?.[0] ?? "")?.[1] ?? "";
  const main = /<main\b[\s\S]*<\/main>/i.exec(html)?.[0] ?? /<body\b[\s\S]*<\/body>/i.exec(html)?.[0] ?? html;
  const text = main.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return `${title.replace(/\s+/g, " ").trim()}\n${description}\n${text}`;
}

/** A short fingerprint of a page's indexed text. */
export const fingerprint = html => createHash("sha256").update(indexedText(html)).digest("hex").slice(0, 16);

const day = /^\d{4}-\d{2}-\d{2}$/;
/**
 * The record to publish: for each `[url, html]`, its fingerprint and its date. A page keeps the date `previous`
 * has for it while its fingerprint is the same; a new or changed page, or one whose earlier record is not usable,
 * gets `today` (`YYYY-MM-DD`).
 */
export function datePages(entries, previous, today) {
  return Object.fromEntries(entries.map(([url, html]) => {
    const hash = fingerprint(html), before = previous?.[url];
    const kept = before && before.hash === hash && typeof before.date === "string" && day.test(before.date) && before.date <= today;
    return [url, { hash, date: kept ? before.date : today }];
  }));
}

/**
 * Reads the record an earlier build published: from an `http(s)` URL (three tries, ten seconds each) or a file.
 * Resolves to `{ dates }`, or to `{ why }` when there is none to read (a first deployment, a site that cannot be
 * reached, a file that is not such a record).
 */
export async function publishedDates(source) {
  try {
    let text;
    if (/^https?:\/\//.test(source)) {
      let failure;
      for (let attempt = 0; attempt < 3 && text === undefined; attempt++) {
        try {
          const response = await fetch(source, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } });
          if (response.status === 404) return { why: "none is published yet" };
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          text = await response.text();
        } catch (error) { failure = error; }
      }
      if (text === undefined) throw failure;
    } else text = await readFile(source, "utf8");
    const dates = JSON.parse(text);
    if (!dates || typeof dates !== "object" || Array.isArray(dates)) throw new Error("not a record of dates");
    return { dates };
  } catch (error) { return { why: String(error?.message ?? error) }; }
}

/** `sitemap.xml` for these URLs, each with its date where `dates` has one. */
export const sitemapXml = (urls, dates) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
  urls.map(url => `  <url><loc>${url}</loc>${dates?.[url] ? `<lastmod>${dates[url].date}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
