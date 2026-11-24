"use client";

import { useEffect, useRef } from "react";

/**
 * Renders a documentation page's HTML (produced at build time from docs/*.md)
 * and draws its ```mermaid blocks in the browser. mermaid is loaded only on
 * pages that have a diagram.
 */
export function DocContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nodes = ref.current ? Array.from(ref.current.querySelectorAll<HTMLElement>("pre.mermaid:not([data-processed])")) : [];
    if (!nodes.length) return;
    let cancelled = false;
    import("mermaid").then(({ default: mermaid }) => {
      if (cancelled) return;
      mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict", flowchart: { wrappingWidth: 440 }, sequence: { useMaxWidth: false }, fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" });
      mermaid.run({ nodes }).catch((e: unknown) => console.error("mermaid", e));
    });
    return () => {
      cancelled = true;
    };
  }, [html]);

  return <article ref={ref} className="doc-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
