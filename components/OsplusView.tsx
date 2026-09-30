"use client";

import { useDemo } from "@/lib/store";
import { fmtEur, fmtIban, fmtTime, short } from "@/lib/format";
import { INSTITUTE } from "@/lib/osplus/simulator";
import { cn } from "./ui";

export function OsplusView() {
  const s = useDemo();
  const { osplus, gateway } = s.engine();
  const { konten, kunden, journal, sperren, depots, wpJournal } = osplus.state;

  return (
    <div className="scroll-thin h-full space-y-4 overflow-y-auto p-3">
      <div className="grid gap-3 lg:grid-cols-2">
        {INSTITUTE.map((inst) => (
          <div key={inst.id} className="rounded-lg border border-red-100">
            <div className="flex items-baseline justify-between rounded-t-lg bg-red-50 px-3 py-1.5">
              <span className="text-sm font-semibold text-red-800">{inst.name}</span>
              <span className="font-mono text-[11px] text-red-700/70">
                Mandant {inst.id} · BLZ {inst.blz} · {inst.bic}
              </span>
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-1 font-medium">Konto</th>
                  <th className="px-2 py-1 font-medium">Inhaber / Wallet</th>
                  <th className="px-3 py-1 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {konten
                  .filter((k) => k.institutId === inst.id)
                  .map((k) => {
                    const kunde = kunden.find((c) => c.kundennr === k.kundennr);
                    const verf = osplus.verfuegbar(k.iban);
                    const wallet = kunde && gateway.wallets.get(kunde.kundennr);
                    return (
                      <tr key={k.iban} className={cn(k.produkt !== "Geschäftskonto" && "bg-slate-50")}>
                        <td className="px-3 py-1.5">
                          <div className="font-mono text-[11px]">{fmtIban(k.iban)}</div>
                          <div className="text-[10.5px] text-slate-500">{k.produkt}</div>
                        </td>
                        <td className="px-2 py-1.5">
                          {kunde ? (
                            <>
                              <div>
                                {kunde.name} <span className="text-slate-400">#{kunde.kundennr}</span>
                              </div>
                              <div className="font-mono text-[10.5px] text-violet-700">{short(wallet)}</div>
                            </>
                          ) : (
                            <span className="text-slate-500">Backs S-EUR 1:1</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          <div className="font-medium">{fmtEur(k.saldo)}</div>
                          {verf !== k.saldo && <div className="text-[10.5px] text-amber-700">verfügbar {fmtEur(verf)}</div>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {sperren.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Sperren / Vormerkungen</h4>
          <div className="flex flex-wrap gap-1.5">
            {sperren.map((sp) => (
              <span
                key={sp.id}
                className={cn(
                  "rounded-md border px-2 py-0.5 font-mono text-[11px]",
                  sp.status === "aktiv" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-400 line-through",
                )}
              >
                {sp.id} {fmtEur(sp.betrag)} · {sp.grund}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Depots (securities accounts)</h4>
        {!depots.length ? (
          <p className="text-sm text-slate-500">No securities positions yet.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="py-1 pr-2 font-medium">Depot</th>
                  <th className="py-1 pr-2 font-medium">Client</th>
                  <th className="py-1 pr-2 font-medium">ISIN</th>
                  <th className="py-1 text-right font-medium">Stück</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {depots.map((d) => (
                  <tr key={d.depot + d.isin}>
                    <td className="py-1 pr-2 font-mono text-[11px]">{d.depot}</td>
                    <td className="py-1 pr-2">{kunden.find((k) => k.kundennr === d.kundennr)?.name}</td>
                    <td className="py-1 pr-2 font-mono text-[11px]">{d.isin}</td>
                    <td className="py-1 text-right font-medium tabular-nums">{d.stueck}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="py-1 pr-2 font-medium">Buchung</th>
                  <th className="py-1 pr-2 font-medium">Depot</th>
                  <th className="py-1 pr-2 font-medium">Text</th>
                  <th className="py-1 text-right font-medium">Stück</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {wpJournal.map((b) => (
                  <tr key={b.id} className="row-in">
                    <td className="py-1 pr-2 font-mono text-[11px]">{b.id}</td>
                    <td className="py-1 pr-2 font-mono text-[11px]">{b.depot}</td>
                    <td className="py-1 pr-2">{b.text}</td>
                    <td className={cn("py-1 text-right font-medium tabular-nums", b.stueck < 0 ? "text-red-700" : "text-emerald-700")}>
                      {b.stueck > 0 ? `+${b.stueck}` : b.stueck}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Buchungsjournal</h4>
        {!journal.length ? (
          <p className="text-sm text-slate-500">No bookings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="py-1 pr-2 font-medium">Zeit</th>
                  <th className="py-1 pr-2 font-medium">Buchung</th>
                  <th className="py-1 pr-2 font-medium">IBAN</th>
                  <th className="py-1 pr-2 font-medium">GV</th>
                  <th className="py-1 pr-2 font-medium">Buchungstext</th>
                  <th className="py-1 pr-2 font-medium">EndToEndId</th>
                  <th className="py-1 text-right font-medium">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {journal.map((b) => (
                  <tr key={b.id} className="row-in">
                    <td className="py-1 pr-2 font-mono text-[11px] text-slate-400">{fmtTime(b.ts)}</td>
                    <td className="py-1 pr-2 font-mono text-[11px]">{b.id}</td>
                    <td className="py-1 pr-2 font-mono text-[11px]">{b.iban.slice(0, 4)}…{b.iban.slice(-6)}</td>
                    <td className="py-1 pr-2 font-mono">{b.gvCode}</td>
                    <td className="py-1 pr-2">{b.buchungstext}</td>
                    <td className="py-1 pr-2 font-mono text-[11px] text-slate-500">{b.ref}</td>
                    <td className={cn("py-1 text-right font-medium tabular-nums", b.betrag < 0 ? "text-red-700" : "text-emerald-700")}>
                      {fmtEur(b.betrag)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
