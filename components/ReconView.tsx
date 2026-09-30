"use client";

import { useDemo } from "@/lib/store";
import { BOND } from "@/lib/bond";
import { fmtEur, fmtTime } from "@/lib/format";
import { Button, cn } from "./ui";

const th = "py-1 text-[10px] font-medium uppercase tracking-wide text-slate-400";

export function ReconView() {
  const s = useDemo();
  const g = s.engine().gateway;
  const r = g.lastRecon;
  const st = s.status;

  return (
    <div className="scroll-thin h-full space-y-4 overflow-y-auto p-3 text-[13px]">
      <p className="text-slate-600">
        Two reconciliations, Tagesabschluss-style. <b>Cash:</b> every S-EUR on the L2 must be backed by euros on an OSPlus Sammelkonto, per Sparkasse.{" "}
        <b>Securities:</b> every bond in the crypto securities register must appear in exactly the right OSPlus Depot.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!!s.busy || s.autoplay} onClick={() => s.run("Reconciling", "reconcile", (x) => x.reconcile())}>
          Run reconciliation
        </Button>
        {st?.cash && (
          <span className="text-slate-500">
            Live: S-EUR supply <b className="text-slate-900">{fmtEur(st.cash.totalSupply)}</b> · bond register{" "}
            <b className="text-slate-900">{st.bond?.totalSupply ?? 0} bonds</b>
          </span>
        )}
      </div>
      {r && (
        <>
          <div className={cn("rounded-lg border p-3", r.cash.ok ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50")}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className={cn("font-semibold", r.cash.ok ? "text-emerald-800" : "text-red-800")}>{r.cash.ok ? "✓ Cash reconciled" : "✗ Cash break"}</span>
              <span className="font-mono text-[11px] text-slate-500">{fmtTime(r.ts)}</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className={th}>Sparkasse</th>
                  <th className={cn(th, "text-right")}>OSPlus Sammelkonto</th>
                  <th className={cn(th, "text-right")}>S-EUR held by its clients</th>
                  <th className={cn(th, "text-right")}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {r.cash.perInstitut.map((p) => (
                  <tr key={p.institutId} className="border-t border-black/5">
                    <td className="py-1">{p.name}</td>
                    <td className="py-1 text-right tabular-nums">{fmtEur(p.omnibus)}</td>
                    <td className="py-1 text-right tabular-nums">{fmtEur(p.onChain)}</td>
                    <td className={cn("py-1 text-right tabular-nums", p.omnibus === p.onChain ? "text-emerald-700" : "text-red-700")}>{fmtEur(p.omnibus - p.onChain)}</td>
                  </tr>
                ))}
                <tr className="border-t border-black/10 font-semibold">
                  <td className="py-1">Total</td>
                  <td className="py-1 text-right tabular-nums">{fmtEur(r.cash.omnibusTotal)}</td>
                  <td className="py-1 text-right tabular-nums">
                    {fmtEur(r.cash.totalSupply)} <span className="font-normal text-slate-500">(supply)</span>
                  </td>
                  <td className="py-1 text-right tabular-nums">{fmtEur(r.cash.omnibusTotal - r.cash.totalSupply)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className={cn("rounded-lg border p-3", r.securities.ok ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50")}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className={cn("font-semibold", r.securities.ok ? "text-emerald-800" : "text-red-800")}>
                {r.securities.ok ? "✓ Securities reconciled" : "✗ Securities break"}
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                {BOND.symbol} · {r.securities.isin}
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className={th}>Client</th>
                  <th className={th}>Depot</th>
                  <th className={cn(th, "text-right")}>OSPlus Depot</th>
                  <th className={cn(th, "text-right")}>Register (L2)</th>
                  <th className={cn(th, "text-right")}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {r.securities.perKunde.map((p) => (
                  <tr key={p.kundennr} className="border-t border-black/5">
                    <td className="py-1">{p.name}</td>
                    <td className="py-1 font-mono text-[11px]">{p.depot}</td>
                    <td className="py-1 text-right tabular-nums">{p.osplus}</td>
                    <td className="py-1 text-right tabular-nums">{p.onChain}</td>
                    <td className={cn("py-1 text-right tabular-nums", p.osplus === p.onChain ? "text-emerald-700" : "text-red-700")}>{p.osplus - p.onChain}</td>
                  </tr>
                ))}
                <tr className="border-t border-black/10 font-semibold">
                  <td className="py-1" colSpan={2}>
                    Total
                  </td>
                  <td className="py-1 text-right tabular-nums">{r.securities.osplusTotal}</td>
                  <td className="py-1 text-right tabular-nums">
                    {r.securities.registerTotal} <span className="font-normal text-slate-500">(issued)</span>
                  </td>
                  <td className="py-1 text-right tabular-nums">{r.securities.osplusTotal - r.securities.registerTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
