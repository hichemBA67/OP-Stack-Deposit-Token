import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, Landmark, Play } from "lucide-react";
import { DOC_PAGES, renderDoc, type DocPage } from "@/lib/docs";
import { DocContent } from "./DocContent";
import { cn } from "./ui";

const href = (p: DocPage) => (p.slug ? `/docs/${p.slug}` : "/docs");

/** Layout of a documentation page: chapter list, content, and the page's sections. */
export function DocsShell({ page }: { page: DocPage }) {
  const doc = renderDoc(page);
  const idx = DOC_PAGES.indexOf(page);
  const prev = DOC_PAGES[idx - 1];
  const next = DOC_PAGES[idx + 1];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-0 px-3 md:px-6">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 py-3">
        <Link href="/docs" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-spk text-white shadow-sm">
            <Landmark className="size-5" />
          </span>
          <span>
            <span className="block text-[15px] leading-tight font-semibold text-slate-900">Documentation</span>
            <span className="block text-xs text-slate-500">Tokenized bond DvP · OSPlus → OP Stack L2 → RL1</span>
          </span>
        </Link>
        <Link
          href="/"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          <Play className="size-4" /> Open the demo
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-8 py-6 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_200px]">
        <nav aria-label="Chapters" className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <BookOpen className="size-3.5" /> Chapters
          </div>
          <ol className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap lg:gap-0.5">
            {DOC_PAGES.map((p, i) => (
              <li key={p.file}>
                <Link
                  href={href(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={cn(
                    "flex gap-2 rounded-md px-2 py-1 text-[13.5px]",
                    p === page ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <span className={cn("w-5 shrink-0 text-right font-mono text-[11px] leading-5 tabular-nums", p === page ? "text-white/70" : "text-slate-400")}>
                    {i === 0 ? "" : i}
                  </span>
                  {p.title}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <main className="min-w-0">
          <DocContent html={doc.html} />
          <div className="mt-10 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-sm">
            <div>
              {prev && (
                <Link href={href(prev)} className="group inline-flex flex-col rounded-lg p-2 hover:bg-slate-100">
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <ChevronLeft className="size-3.5" /> Previous
                  </span>
                  <span className="font-medium text-slate-900">{prev.title}</span>
                </Link>
              )}
            </div>
            <div className="text-right">
              {next && (
                <Link href={href(next)} className="inline-flex flex-col items-end rounded-lg p-2 hover:bg-slate-100">
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    Next <ChevronRight className="size-3.5" />
                  </span>
                  <span className="font-medium text-slate-900">{next.title}</span>
                </Link>
              )}
            </div>
          </div>
          <p className="mt-8 pb-6 text-center text-[11px] text-slate-400">
            Independent technical demo · fictitious institutes and data · not affiliated with Finanz Informatik or the Sparkassen-Finanzgruppe
          </p>
        </main>

        {doc.toc.length > 1 && (
          <aside aria-label="On this page" className="hidden xl:sticky xl:top-4 xl:block xl:self-start">
            <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">On this page</div>
            <ul className="flex flex-col gap-1 border-l border-slate-200 text-[13px]">
              {doc.toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="-ml-px block border-l border-transparent py-0.5 pl-3 text-slate-600 hover:border-slate-400 hover:text-slate-900">
                    {t.text}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
