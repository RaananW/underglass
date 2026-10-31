/**
 * The documentation site at underglass.dev/docs: Astro Starlight over the pages that `sync.mjs` generates
 * from the repository's `docs/` folder (`pages.mjs` lists them). `npm run build:site` builds it after the
 * showcase and copies `dist/` to the showcase's `dist/docs/`, which Vercel serves. See `docs/showcase.md`.
 */
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { base, repository, sidebar, site } from "./pages.mjs";

export default defineConfig({
  site,
  base,
  // Links without a trailing slash, as Vercel serves the site (`trailingSlash: false` in `vercel.json`).
  trailingSlash: "never",
  devToolbar: { enabled: false },
  integrations: [starlight({
    title: "Underglass",
    description: "Documentation for Underglass, the GPU-first React framework: real DOM controls presented through one shared WebGPU compositor.",
    logo: { src: "./public/favicon.svg" },
    social: [{ icon: "github", label: "GitHub", href: repository }],
    editLink: { baseUrl: `${repository}/edit/main/docs/` },
    customCss: ["./src/styles/theme.css"],
    // The site's 404 page is the showcase's root `404.html`.
    disable404Route: true,
    // Vercel builds (`VERCEL=1`) load Vercel Web Analytics like the showcase (docs/showcase.md#analytics): page
    // views only, no cookies, served from the deployment's own `/_vercel/insights/`.
    head: process.env.VERCEL === "1" ? [
      { tag: "script", content: "window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };" },
      { tag: "script", attrs: { defer: true, src: "/_vercel/insights/script.js" } },
    ] : [],
    sidebar: [
      { label: "Live showcase", link: `${site}/` },
      ...sidebar.map(group => ({ label: group.label, items: [
        ...group.pages.map(([, slug]) => ({ slug })),
        ...(group.label === "Strata UI" ? [{ label: "Components", collapsed: true, items: [{ autogenerate: { directory: "strata/components" } }] }] : []),
      ] })),
    ],
  })],
});
