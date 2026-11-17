/**
 * Browser entry of the preview home page (`next.html`). The build has already rendered `Page` into `#app`
 * (`prerender.tsx`), so this hydrates it; the dev server renders it here when the markup is missing. It then marks the
 * section in view on the side scale.
 */
import { createRoot, hydrateRoot } from "react-dom/client";
import { Page, sections } from "./page";
import "./next.css";

const app = document.getElementById("app")!;
const page = <Page base={import.meta.env.BASE_URL} />;
if (app.firstElementChild) hydrateRoot(app, page); else createRoot(app).render(page);

// The side scale shows where the reader is: the section that covers the middle of the window.
const marks = new Map(sections.map(section => [section.id as string, document.querySelector<HTMLAnchorElement>(`.rail a[href="#${section.id}"]`)]));
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    for (const [id, mark] of marks) {
      if (id === entry.target.id) mark?.setAttribute("aria-current", "true"); else mark?.removeAttribute("aria-current");
    }
  }
}, { rootMargin: "-50% 0px -50% 0px" });
// The sections exist once React has rendered or hydrated them.
requestAnimationFrame(() => { for (const section of sections) { const element = document.getElementById(section.id); if (element) observer.observe(element); } });
