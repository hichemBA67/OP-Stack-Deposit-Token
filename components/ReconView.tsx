"use client";

import { useDemo } from "@/lib/store";
import { fmtEur, fmtTime } from "@/lib/format";
import { Button, cn } from "./ui";

export function ReconView() {
  const s = useDemo();
  const g = s.engine().gateway;
  const r = g.lastRecon;
  const supply = s.status?.token?.totalSupply;

  return (
    <div className="scroll-thin h-full space-y-4 overflow-y-auto p-3 text-[13px]">
      <p className="text-slate-600">
        Every S-EUR on the L2 must be backed by euros on an OSPlus Sammelkonto. The gateway reads token balances and{" "}
        <code>totalSupply</code> on the L2 and compares them with the OSPlus balances per Sparkasse (Tagesabschluss-style).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!!s.busy || s.autoplay} onClick={() => s.run("Reconcile", "reconcile", (x) => x.reconcile())}>
          Run reconciliation
        </Button>
        {supply !== undefined && <span className="text-slate-500">Live S-EUR totalSupply: <b className="text-slate-900">{fmtEur(supply)}</b></span>}
      </div>
      {r && (
        <div className={cn("rounded-lg border p-3", r.ok ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50")}>
          <div className="mb-2 flex items-baseline justify-between">
            <span className={cn("font-semibold", r.ok ? "text-emerald-800" : "text-red-800")}>{r.ok ? "✓ Ledgers reconciled" : "✗ Reconciliation break"}</span>
            <span className="font-mono text-[11px] text-slate-500">{fmtTime(r.ts)}</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                <th className="py-1 font-medium">Sparkasse</th>
                <th className="py-1 text-right font-medium">OSPlus Sammelkonto</th>
                <th className="py-1 text-right font-medium">S-EUR held by its customers</th>
                <th className="py-1 text-right font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {r.perInstitut.map((p) => (
                <tr key={p.institutId} className="border-t border-black/5">
                  <td className="py-1">{p.name}</td>
                  <td className="py-1 text-right tabular-nums">{fmtEur(p.omnibus)}</td>
                  <td className="py-1 text-right tabular-nums">{fmtEur(p.onChain)}</td>
                  <td className={cn("py-1 text-right tabular-nums", p.omnibus === p.onChain ? "text-emerald-700" : "text-red-700")}>
                    {fmtEur(p.omnibus - p.onChain)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-black/10 font-semibold">
                <td className="py-1">Total</td>
                <td className="py-1 text-right tabular-nums">{fmtEur(r.omnibusTotal)}</td>
                <td className="py-1 text-right tabular-nums">{fmtEur(r.totalSupply)} <span className="font-normal text-slate-500">(supply)</span></td>
                <td className="py-1 text-right tabular-nums">{fmtEur(r.omnibusTotal - r.totalSupply)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
