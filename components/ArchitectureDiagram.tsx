"use client";

import { Building2, Cpu, Info, Landmark, Layers, Smartphone, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { COMPONENT_EXPLAIN, LAYER_EXPLAIN } from "@/lib/explain";
import { useDemo } from "@/lib/store";
import { fmtEur } from "@/lib/format";
import { LAYERS, type Component, type Layer, type TraceEvent } from "@/lib/types";
import { COMPONENT_LABEL, LAYER_META, cn } from "./ui";

const COLUMN_COMPONENTS: Record<Layer, Component[]> = {
  customer: ["channel"],
  osplus: ["kyc", "giro", "hold", "omnibus", "journal", "api"],
  gateway: ["orchestrator", "compliance", "custody", "recon"],
  l2: ["sequencer", "token", "batcher", "proposer"],
  l1: ["batchInbox", "disputeGame", "portal"],
};

const ICON: Record<Layer, ReactNode> = {
  customer: <Smartphone className="size-4" />,
  osplus: <Building2 className="size-4" />,
  gateway: <Layers className="size-4" />,
  l2: <Cpu className="size-4" />,
  l1: <Landmark className="size-4" />,
};

const RECENT_MS = 1600;

export function ArchitectureDiagram() {
  const events = useDemo((s) => s.events);
  const status = useDemo((s) => s.status);
  useDemo((s) => s.rev);
  const engine = useDemo((s) => s.engine)();
  const [info, setInfo] = useState<{ layer: Layer; component?: Component }>();
  const now = useDemo((s) => s.wallNow);
  const recent = events.filter((e) => now - e.ts < RECENT_MS);

  const hot = new Map<Component, number>();
  for (const e of recent) for (const c of e.components) if (!hot.has(c)) hot.set(c, e.id);

  // latest event crossing each connector i (between LAYERS[i] and LAYERS[i+1])
  const crossings: (TraceEvent & { dir: 1 | -1 })[] = [];
  for (let i = 0; i < LAYERS.length - 1; i++) {
    const ev = recent.find((e) => {
      const a = LAYERS.indexOf(e.from);
      const b = LAYERS.indexOf(e.to);
      return a !== b && Math.min(a, b) <= i && Math.max(a, b) > i;
    });
    if (ev) crossings[i] = { ...ev, dir: LAYERS.indexOf(ev.to) > LAYERS.indexOf(ev.from) ? 1 : -1 };
  }

  const omnibus = engine.osplus.state.konten
    .filter((k) => k.produkt === "Sammelkonto Tokenisierte Einlagen")
    .reduce((a, k) => a + k.saldo, 0);
  const tracked = engine.gateway.tracked;

  const footer: Record<Layer, ReactNode> = {
    customer: <>{engine.osplus.state.kunden.length} customers</>,
    osplus: <>Σ Sammelkonten {fmtEur(omnibus)}</>,
    gateway: (
      <>
        {tracked.length} tx tracked · {tracked.filter((t) => t.stage === "finalized").length} final
      </>
    ),
    l2: status ? (
      <span className="font-mono">
        <span className="text-amber-700">{status.l2.unsafe}</span> / <span className="text-sky-700">{status.l2.safe}</span> /{" "}
        <span className="text-emerald-700">{status.l2.finalized}</span>
      </span>
    ) : (
      "—"
    ),
    l1: status ? (
      <span className="font-mono">
        #{status.l1.head} · fin #{status.l1.finalized}
      </span>
    ) : (
      "—"
    ),
  };

  return (
    <div>
    <div className="flex flex-col gap-0 md:flex-row md:items-stretch">
      {LAYERS.map((layer, i) => {
        const m = LAYER_META[layer];
        const cross = crossings[i];
        return (
          <div key={layer} className="contents">
            <div className={cn("flex min-w-0 flex-1 flex-col rounded-xl border p-2.5", m.border, m.bg, layer === "customer" && "md:max-w-[120px]")}>
              <button
                type="button"
                onClick={() => setInfo({ layer })}
                className={cn("flex items-center gap-1.5 text-left text-[13px] font-semibold hover:underline", m.text)}
              >
                {ICON[layer]}
                <span className="truncate">{m.label}</span>
              </button>
              <div className="mb-2 truncate text-[11px] text-slate-500">{layer === "l2" && status ? status.l2.name : layer === "l1" && status ? status.l1.name : m.sub}</div>
              <div className="flex flex-1 flex-wrap content-start gap-1">
                {COLUMN_COMPONENTS[layer].map((c) => {
                  const id = hot.get(c);
                  return (
                    <button
                      type="button"
                      key={`${c}-${id ?? "idle"}`}
                      onClick={() => setInfo({ layer, component: c })}
                      className={cn(
                        "rounded-md border bg-white px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors hover:border-slate-400",
                        id ? cn("chip-pulse font-semibold", m.text, m.border) : "border-slate-200 text-slate-600",
                        info?.component === c && "ring-2 ring-slate-900",
                      )}
                    >
                      {COMPONENT_LABEL[c]}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 truncate border-t border-black/5 pt-1.5 text-[11px] text-slate-600">{footer[layer]}</div>
            </div>
            {i < LAYERS.length - 1 && (
              <div className="relative mx-auto h-6 w-px md:mx-0 md:h-auto md:w-6">
                <div className="absolute inset-0 m-auto h-full w-px bg-slate-300 md:h-px md:w-full" />
                {cross && (
                  <>
                    <span
                      key={cross.id}
                      className={cn(
                        "absolute size-2.5 rounded-full shadow ring-2 ring-white",
                        LAYER_META[cross.from].dot,
                        "hidden md:block",
                        cross.dir === 1 ? "packet-r" : "packet-l",
                      )}
                      style={{ top: "50%" }}
                    />
                    <span
                      key={`m${cross.id}`}
                      className={cn(
                        "absolute left-1/2 size-2.5 -translate-x-1/2 rounded-full ring-2 ring-white md:hidden",
                        LAYER_META[cross.from].dot,
                        cross.dir === 1 ? "packet-d" : "packet-u",
                      )}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
    {info ? (
      <div className={cn("mt-3 flex items-start gap-2 rounded-lg border p-3 text-[13.5px]", LAYER_META[info.layer].border, LAYER_META[info.layer].bg)}>
        <Info className={cn("mt-0.5 size-4 shrink-0", LAYER_META[info.layer].text)} />
        <div className="min-w-0 flex-1">
          <div className={cn("font-semibold", LAYER_META[info.layer].text)}>
            {info.component ? `${COMPONENT_LABEL[info.component]} (${LAYER_META[info.layer].label})` : `${LAYER_META[info.layer].label}: ${LAYER_META[info.layer].sub}`}
          </div>
          <p className="text-slate-700">{info.component ? COMPONENT_EXPLAIN[info.component] : LAYER_EXPLAIN[info.layer]}</p>
        </div>
        <button type="button" onClick={() => setInfo(undefined)} aria-label="Close" className="text-slate-500 hover:text-slate-900">
          <X className="size-4" />
        </button>
      </div>
    ) : (
      <p className="mt-2 text-center text-[11.5px] text-slate-400">
        Click any box to see what it does. Boxes light up and dots travel along the lines whenever systems exchange a message.
      </p>
    )}
    </div>
  );
}
