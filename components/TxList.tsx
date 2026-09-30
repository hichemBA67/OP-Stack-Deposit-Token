"use client";

import { ExternalLink } from "lucide-react";
import { useDemo } from "@/lib/store";
import { fmtTime, short } from "@/lib/format";
import { explorerUrl, type ChainTx } from "@/lib/gateway/gateway";
import type { StepId } from "@/lib/types";
import { cn } from "./ui";

export function ExplorerLink({ url, children, className }: { url?: string; children: React.ReactNode; className?: string }) {
  if (!url) return <span className={cn("font-mono text-slate-500", className)}>{children}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 font-mono text-sky-700 hover:underline", className)}>
      {children}
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

function NetworkBadge({ chain }: { chain: ChainTx["chain"] }) {
  const live = useDemo((s) => s.mode === "live");
  return chain === "l2" ? (
    <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-orange-700">{live ? "OP Sepolia · L2" : "L2 (sim)"}</span>
  ) : (
    <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-indigo-700">{live ? "RL1 · Sepolia" : "RL1 (sim)"}</span>
  );
}

/** Explorer links for one real transaction. */
export function TxLinks({ tx }: { tx: ChainTx }) {
  const ex = useDemo((s) => s.engine().gateway.explorers);
  const base = tx.chain === "l2" ? ex.l2 : ex.l1;
  return (
    <span className="flex flex-col gap-0.5">
      {tx.hash && <ExplorerLink url={explorerUrl(base, "tx", tx.hash)}>tx {short(tx.hash)}</ExplorerLink>}
      {tx.address && <ExplorerLink url={explorerUrl(base, "address", tx.address)}>{tx.kind === "deploy" ? "contract" : "game"} {short(tx.address)}</ExplorerLink>}
      {tx.chain === "l1" && tx.block !== undefined && <ExplorerLink url={explorerUrl(base, "block", tx.block)}>block #{tx.block}</ExplorerLink>}
    </span>
  );
}

/** Every real transaction of the demo, on both networks, with explorer links. */
export function TxList({ steps, compact }: { steps?: StepId[]; compact?: boolean }) {
  const s = useDemo();
  const g = s.engine().gateway;
  const st = s.status;
  const live = s.mode === "live";
  const txs = steps ? g.txs.filter((t) => steps.includes(t.step)) : g.txs;

  return (
    <div className={cn(!compact && "scroll-thin h-full overflow-y-auto p-3")}>
      {!live && (
        <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          Simulation: these transactions aren&apos;t on a real network, so there are no explorer links. Switch to <b>OP Sepolia (live)</b> to get real
          transactions on the OP Sepolia and Sepolia explorers.
        </p>
      )}
      {!txs.length ? (
        <p className="text-[13px] text-slate-500">No transactions yet. They appear here as soon as a step sends one.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-3 font-medium">Time</th>
                <th className="py-1 pr-3 font-medium">Network</th>
                <th className="py-1 pr-3 font-medium">What</th>
                <th className="py-1 font-medium">Explorer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {txs.map((tx) => {
                const final = tx.chain === "l1" && tx.kind === "batch" && st && tx.block !== undefined && tx.block <= st.l1.finalized;
                return (
                  <tr key={tx.id} className="row-in align-top">
                    <td className="py-1.5 pr-3 font-mono text-[11px] whitespace-nowrap text-slate-400">{fmtTime(tx.ts)}</td>
                    <td className="py-1.5 pr-3">
                      <NetworkBadge chain={tx.chain} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <div className="text-slate-800">{tx.title}</div>
                      {tx.covers && <div className="text-[11.5px] text-slate-500">anchors: {tx.covers.join(" · ")}</div>}
                      {tx.kind === "batch" && <div className={cn("text-[11.5px]", final ? "text-emerald-700" : "text-sky-700")}>{final ? "✓ final on RL1" : "on RL1, not final yet"}</div>}
                    </td>
                    <td className="py-1.5">
                      <TxLinks tx={tx} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
