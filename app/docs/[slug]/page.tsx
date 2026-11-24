import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsShell } from "@/components/DocsShell";
import { DOC_PAGES, pageBySlug } from "@/lib/docs";

// Every chapter is generated at build time; nothing else exists under /docs.
export const dynamicParams = false;

export function generateStaticParams() {
  return DOC_PAGES.filter((p) => p.slug).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = pageBySlug(slug);
  return { title: page ? `${page.title} · Documentation` : "Documentation" };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pageBySlug(slug);
  if (!page || !page.slug) notFound();
  return <DocsShell page={page} />;
}
