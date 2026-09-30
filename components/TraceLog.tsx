"use client";

import { ArrowRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useDemo } from "@/lib/store";
import { fmtTime } from "@/lib/format";
import { LAYERS, type Layer } from "@/lib/types";
import { LAYER_META, LayerBadge, STEP_LABEL, cn } from "./ui";

const LEVEL_BAR = {
  info: "bg-slate-300",
  success: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-600",
};

const json = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);

export function TraceLog() {
  const events = useDemo((s) => s.events);
  const [filter, setFilter] = useState<Layer | "all">("all");
  const shown = filter === "all" ? events : events.filter((e) => e.from === filter || e.to === filter);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-3 py-2">
        <span className="mr-1 text-xs text-slate-500">Filter</span>
        {(["all", ...LAYERS] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setFilter(l)}
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-medium",
              filter === l ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {l === "all" ? "All" : LAYER_META[l].label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">{events.length} messages</span>
      </div>
      {!shown.length ? (
        <div className="p-8 text-center text-sm text-slate-500">
          No messages yet. Start with <b>Run full lifecycle</b> or step 1 on the left.
        </div>
      ) : (
        <ul className="scroll-thin flex-1 divide-y divide-slate-100 overflow-y-auto">
          {shown.map((e) => (
            <li key={e.id} className="row-in relative pl-3">
              <span className={cn("absolute top-0 bottom-0 left-0 w-1", LEVEL_BAR[e.level])} />
              <details className="group px-2 py-1.5">
                <summary className="flex cursor-pointer list-none flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="w-[72px] font-mono text-[11px] text-slate-400 tabular-nums">{fmtTime(e.ts)}</span>
                    {e.step && (
                      <span className="w-[76px] truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {STEP_LABEL[e.step]}
                      </span>
                    )}
                    <LayerBadge layer={e.from} />
                    {e.to !== e.from && (
                      <>
                        <ArrowRight className="size-3 text-slate-400" />
                        <LayerBadge layer={e.to} />
                      </>
                    )}
                  </span>
                  <span className={cn("min-w-0 flex-1 text-[13px]", e.level === "error" ? "text-red-700" : "text-slate-800")}>
                    {e.title}
                    {e.endpoint && (
                      <span className="ml-2 font-mono text-[11px] text-slate-400">
                        {e.protocol ? `${e.protocol} · ` : ""}
                        {e.endpoint}
                      </span>
                    )}
                  </span>
                  {e.link && (
                    <a
                      href={e.link.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-sky-700 hover:underline"
                    >
                      {e.link.label} <ExternalLink className="size-3" />
                    </a>
                  )}
                </summary>
                {e.payload !== undefined && (
                  <pre className="scroll-thin mt-1.5 mb-1 max-h-64 overflow-auto rounded-md bg-slate-950 p-2 font-mono text-[11px] leading-relaxed text-slate-100">
                    {json(e.payload)}
                  </pre>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
