import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Marked, type Tokens } from "marked";

/**
 * The documentation in docs/*.md, rendered at build time for the /docs pages.
 * The same files render on GitHub, so links between them stay plain `*.md` links
 * and are rewritten to site routes here.
 */

export interface DocPage {
  /** URL segment under /docs ("" for the index). */
  slug: string;
  file: string;
  title: string;
}

export const DOC_PAGES: DocPage[] = [
  { slug: "", file: "README.md", title: "Introduction" },
  { slug: "getting-started", file: "getting-started.md", title: "Getting started" },
  { slug: "overview", file: "overview.md", title: "Overview" },
  { slug: "architecture", file: "architecture.md", title: "Architecture" },
  { slug: "lifecycle", file: "lifecycle.md", title: "Business lifecycle" },
  { slug: "osplus-simulator", file: "osplus-simulator.md", title: "OSPlus simulator" },
  { slug: "gateway", file: "gateway.md", title: "Abstraction layer" },
  { slug: "smart-contracts", file: "smart-contracts.md", title: "Smart contracts" },
  { slug: "chain-adapters", file: "chain-adapters.md", title: "Chain adapters & API" },
  { slug: "settlement-finality", file: "settlement-finality.md", title: "Settlement & finality" },
  { slug: "reconciliation", file: "reconciliation.md", title: "Reconciliation" },
  { slug: "frontend", file: "frontend.md", title: "Frontend" },
  { slug: "deployment", file: "deployment.md", title: "Configuration & deployment" },
  { slug: "security", file: "security.md", title: "Security model" },
  { slug: "limitations", file: "limitations.md", title: "Limitations & gaps" },
  { slug: "glossary", file: "glossary.md", title: "Glossary" },
];

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DOCS_DIR = join(process.cwd(), "docs");

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** GitHub-style heading anchor, so in-page links work the same on GitHub and on the site. */
export function headingId(text: string) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

/** `architecture.md#runtime-topology` -> `/docs/architecture#runtime-topology` (with the base path). */
function rewriteHref(href: string) {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#") || href.startsWith("/")) return href;
  const m = href.match(/^(?:\.\/)?([\w-]+)\.md(#.*)?$/);
  if (!m) return href;
  const page = DOC_PAGES.find((p) => p.file === `${m[1]}.md`);
  if (!page) return href;
  // The static export uses trailingSlash, so link straight to the directory and skip a redirect.
  const slash = process.env.STATIC_EXPORT === "true" ? "/" : "";
  return `${BASE}/docs${page.slug ? `/${page.slug}` : ""}${slash}${m[2] ?? ""}`;
}

export interface RenderedDoc {
  title: string;
  html: string;
  toc: { id: string; text: string }[];
}

export function renderDoc(page: DocPage): RenderedDoc {
  const md = readFileSync(join(DOCS_DIR, page.file), "utf8");
  const toc: RenderedDoc["toc"] = [];
  let title = page.title;

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        const id = headingId(text.replace(/`/g, ""));
        if (depth === 1) title = text.replace(/`/g, "");
        if (depth === 2) toc.push({ id, text: text.replace(/`/g, "") });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${inner}</h${depth}>\n`;
      },
      code({ text, lang }: Tokens.Code) {
        if (lang === "mermaid") return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`;
        const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
        return `<pre class="code"><code${cls}>${escapeHtml(text)}</code></pre>\n`;
      },
      link({ href, title: t, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const target = rewriteHref(href);
        const external = /^https?:/i.test(target);
        return `<a href="${escapeHtml(target)}"${t ? ` title="${escapeHtml(t)}"` : ""}${external ? ' target="_blank" rel="noreferrer"' : ""}>${inner}</a>`;
      },
      table(token: Tokens.Table) {
        // Default table markup, wrapped so wide tables scroll inside their own box.
        const header = token.header
          .map((c, i) => `<th${token.align[i] ? ` align="${token.align[i]}"` : ""}>${this.parser.parseInline(c.tokens)}</th>`)
          .join("");
        const rows = token.rows
          .map(
            (r) =>
              `<tr>${r.map((c, i) => `<td${token.align[i] ? ` align="${token.align[i]}"` : ""}>${this.parser.parseInline(c.tokens)}</td>`).join("")}</tr>`,
          )
          .join("\n");
        return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });

  const html = marked.parse(md, { async: false });
  return { title, html, toc };
}

export function pageBySlug(slug: string) {
  return DOC_PAGES.find((p) => p.slug === slug);
}
