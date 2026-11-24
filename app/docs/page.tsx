import type { Metadata } from "next";
import { DocsShell } from "@/components/DocsShell";
import { pageBySlug } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Documentation · Tokenized bond DvP on OP Stack",
  description: "Technical documentation: OSPlus → abstraction layer → OP Stack L2 → RL1.",
};

export default function DocsIndex() {
  return <DocsShell page={pageBySlug("")!} />;
}
