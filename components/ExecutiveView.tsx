"use client";

import { ArrowLeft, ArrowRight, Building2, Check, ChevronRight, Clock, Cpu, FlaskConical, Landmark, Layers, Loader2, Play, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useDemo } from "@/lib/store";
import { BOND, COUPON_PER_UNIT } from "@/lib/bond";
import { CHAPTERS, INVESTOR, ISSUER, TRADE, type Chapter } from "@/lib/explain";
import { fmtDuration, fmtEur, short } from "@/lib/format";
import { explorerUrl } from "@/lib/gateway/gateway";
import type { Layer } from "@/lib/types";
import { ExplorerLink, TxLinks, TxList } from "./TxList";
import { Button, Card, cn } from "./ui";

const SYSTEMS: { layer: Layer; name: string; role: string; icon: ReactNode; tone: string }[] = [
  { layer: "osplus", name: "OSPlus", role: "Core banking. Keeps clients, accounts, Depots and euros.", icon: <Building2 className="size-5" />, tone: "text-red-700 bg-red-50 border-red-200" },
  { layer: "gateway", name: "Abstraction layer", role: "Connects OSPlus to the blockchain, acts as registrar, holds the keys.", icon: <Layers className="size-5" />, tone: "text-violet-700 bg-violet-50 border-violet-200" },
  { layer: "l2", name: "OP Stack L2", role: "Settlement network for bond and cash. A new block every 2 seconds.", icon: <Cpu className="size-5" />, tone: "text-orange-700 bg-orange-50 border-orange-200" },
  { layer: "l1", name: "RL1", role: "Regulated Layer One (EVM-based). Makes settlement final and verifiable.", icon: <Landmark className="size-5" />, tone: "text-indigo-700 bg-indigo-50 border-indigo-200" },
];

export function ExecutiveView() {
  const s = useDemo();
  const states = s.stepStates();
  const chapter = CHAPTERS.find((c) => c.steps.includes(s.selected)) ?? CHAPTERS[0];
  const idx = CHAPTERS.indexOf(chapter);

  const trade = s.engine().gateway.tracked.find((t) => t.kind === "dvp");
  const chapterState = (c: Chapter) => {
    // "Final on RL1" follows the DvP trade: RL1 finalizes on inclusion, so it's done once the trade is anchored.
    if (c.id === "final") return trade?.safeAt ? "done" : trade ? "active" : "todo";
    if (c.steps.every((id) => states[id] === "done")) return "done";
    if (c.steps.some((id) => states[id] === "active")) return "active";
    return "todo";
  };

  return (
    <div className="flex flex-col gap-4">
      <Hero />

      <Card className="p-4 md:p-5">
        <div className="grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          {SYSTEMS.map((sys, i) => {
            const on = chapter.systems.includes(sys.layer);
            return (
              <div key={sys.layer} className="contents">
                <div className={cn("rounded-xl border p-3 transition", sys.tone, on ? "opacity-100 shadow-sm ring-2 ring-current/30" : "opacity-45")}>
                  <div className="flex items-center gap-2 font-semibold">
                    {sys.icon}
                    {sys.name}
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-slate-700">{sys.role}</p>
                  {sys.layer === "osplus" && <p className="mt-1 text-[11px] text-slate-500">simulated in this demo</p>}
                  {sys.layer === "l2" && <p className="mt-1 text-[11px] text-slate-500">{s.mode === "live" ? "live: OP Sepolia" : "simulated"}</p>}
                  {sys.layer === "l1" && <p className="mt-1 text-[11px] text-slate-500">{s.mode === "live" ? "live: Sepolia" : "simulated"}</p>}
                </div>
                {i < SYSTEMS.length - 1 && (
                  <div className="flex items-center justify-center text-slate-300">
                    <ChevronRight className="size-6 rotate-90 md:rotate-0" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 md:p-6">
        <ol className="mb-5 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {CHAPTERS.map((c, i) => {
            const st = chapterState(c);
            const sel = c.id === chapter.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => s.select(c.steps[0])}
                  className={cn("flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-center transition", sel ? "bg-slate-900 text-white" : "hover:bg-slate-100")}
                >
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-sm font-bold",
                      st === "done" ? "bg-emerald-600 text-white" : st === "active" ? "bg-amber-500 text-white" : sel ? "bg-white/20" : "bg-slate-200 text-slate-600",
                    )}
                  >
                    {st === "done" ? <Check className="size-4" /> : st === "active" ? <Loader2 className="size-4 animate-spin" /> : i + 1}
                  </span>
                  <span className="text-[12px] leading-tight font-medium sm:text-[13px]">{c.title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mx-auto max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Step {idx + 1} of {CHAPTERS.length}
          </div>
          <h2 className="mt-1 text-2xl leading-tight font-semibold text-slate-900 md:text-[28px]">{chapter.headline}</h2>
          <p className="mt-3 text-[16px] leading-relaxed text-slate-700">{chapter.text}</p>
          <div className="mt-4 flex gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">For the Sparkasse</div>
              <p className="text-[15px] text-emerald-950">{chapter.benefit}</p>
            </div>
          </div>

          <div className="mt-5">
            {chapter.auto ? <SettlementTimeline /> : <ChapterAction chapter={chapter} done={chapterState(chapter) === "done"} />}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
            <Button variant="ghost" disabled={idx === 0} onClick={() => s.select(CHAPTERS[idx - 1].steps[0])}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {idx < CHAPTERS.length - 1 ? (
              <Button variant={chapterState(chapter) === "done" ? "primary" : "secondary"} onClick={() => s.select(CHAPTERS[idx + 1].steps[0])}>
                Next: {CHAPTERS[idx + 1].title} <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => s.setView("tech")}>
                See the technical details <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4 md:p-6">
        <h3 className="text-lg font-semibold text-slate-900">Proof on the public explorers</h3>
        <p className="mb-3 text-[14px] text-slate-600">
          Every blockchain transaction of this story: deployments, issuance, DvP and coupon on the <b>OP Sepolia</b> explorer, and the batches and state
          proposals that anchor them on the <b>RL1 explorer</b> (Sepolia). Anyone can check them.
        </p>
        <TxList compact />
      </Card>
    </div>
  );
}

function Hero() {
  const s = useDemo();
  const g = s.engine().gateway;
  const live = s.mode === "live";
  const trade = g.tracked.find((t) => t.kind === "dvp");
  const r = g.lastRecon;

  const kpis = [
    {
      label: "DvP settled in",
      value: trade ? fmtSec(trade.confirmedAt - trade.submittedAt) : live ? "≈ 2 s" : "≈ 1 s",
      sub: trade ? `${live ? "measured on OP Sepolia" : "simulated"} · instead of T+2` : "expected · instead of T+2",
      measured: !!trade,
    },
    {
      label: "Final on RL1 in",
      value: trade?.safeAt ? fmtSec(trade.safeAt - trade.confirmedAt) : live ? "≈ 2 min" : "≈ 5 s",
      sub: trade?.safeAt ? `${live ? "measured" : "simulated"} · anchored = final on RL1` : live ? "expected · anchored = final" : "simulated (real ≈ 2 min)",
      measured: !!trade?.safeAt,
    },
    {
      label: "Settlement risk",
      value: trade ? "None" : "—",
      sub: trade ? `bond ⇄ cash in 1 transaction${g.failedTrade ? " · failing trade reverted ✓" : ""}` : "atomic DvP: all or nothing",
      measured: !!trade,
    },
    {
      label: "Books reconciled",
      value: r ? (r.ok ? "100 %" : "Break") : "—",
      sub: r ? (r.ok ? "✓ cash and securities" : "✗ see technical view") : "cash + securities vs. OSPlus",
      measured: !!r,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-white to-red-50/60 p-5 md:p-7">
        <h2 className="max-w-3xl text-2xl leading-tight font-semibold text-slate-900 md:text-3xl">
          A tokenized green bond, bought with tokenized deposits: delivery versus payment in seconds
        </h2>
        <p className="mt-2 max-w-3xl text-[16px] leading-relaxed text-slate-600">
          A municipal utility issues a digital bond under the German <b>eWpG</b>. A corporate investor pays with <b>tokenized deposits</b> from its Sparkasse.
          Bond and cash settle in one transaction on an <b>OP Stack</b> network, final on <b>RL1</b>, an EVM-based Regulated Layer One. <b>OSPlus</b> stays the
          system of record for accounts and Depots.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-[12px] font-medium text-slate-500">{k.label}</div>
              <div className={cn("mt-0.5 text-2xl font-semibold tabular-nums", k.measured ? "text-slate-900" : "text-slate-400")}>{k.value}</div>
              <div className="text-[11.5px] text-slate-500">{k.sub}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="primary" className="px-4 py-2 text-[15px]" onClick={s.runLifecycle} disabled={!!s.busy || s.autoplay || (live && !s.liveConfig?.available)}>
            <Play className="size-4" /> {s.autoplay ? "Playing the story…" : "Play the full story"}
          </Button>
          <span className="text-[13px] text-slate-500">or go step by step below</span>
        </div>
      </div>
    </Card>
  );
}

function fmtSec(ms: number) {
  if (ms < 100) return "< 0.1 s";
  return ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : fmtDuration(ms);
}

function ChapterAction({ chapter, done }: { chapter: Chapter; done: boolean }) {
  const s = useDemo();
  const e = s.engine();
  const g = e.gateway;
  const live = s.mode === "live";
  const blocked = !!s.busy || s.autoplay || (live && !s.liveConfig?.available);
  const issuer = e.osplus.state.kunden.find((k) => k.rolle === "Emittent");
  const investor = e.osplus.state.kunden.find((k) => k.rolle === "Investor");
  const pos = (k?: { kundennr: string }) => (k ? s.balances[k.kundennr] : undefined) ?? { cash: 0, bond: 0 };
  const trade = g.tracked.find((t) => t.kind === "dvp");

  const needs: Partial<Record<Chapter["id"], boolean>> = {
    issue: !issuer,
    cash: !investor,
    dvp: !issuer || !investor || pos(issuer).bond < TRADE.units || pos(investor).cash < TRADE.priceCents,
    coupon: pos(investor).bond === 0,
    close: !issuer,
  };
  const canTestFailure = chapter.id === "dvp" && !!issuer && !!investor && pos(issuer).bond >= TRADE.units;

  let result: ReactNode = null;
  if (done) {
    const r = g.lastRecon;
    const f = g.facts;
    result = {
      onboard: (
        <>
          <b>{ISSUER.name}</b> (Sparkasse Musterstadt) and <b>{INVESTOR.name}</b> (Sparkasse Beispielstadt) are verified, with a Depot in OSPlus and
          wallets allowlisted for the bond and for S-EUR.
        </>
      ),
      issue: f.issued && (
        <>
          <b>{f.issued.units} bonds</b> ({fmtEur(f.issued.units * BOND.nominalCents)} nominal, ISIN {BOND.isin}) were registered in the name of{" "}
          {f.issued.issuer}, and its OSPlus Depot shows the same position.
        </>
      ),
      cash: f.tokenized && (
        <>
          {f.tokenized.client} converted <b>{fmtEur(f.tokenized.cents)}</b> into S-EUR, backed 1:1 on the Sammelkonto of its Sparkasse.
        </>
      ),
      dvp: f.trade && (
        <>
          Settled{trade && <> in <b>{fmtSec(trade.confirmedAt - trade.submittedAt)}</b></>} in one transaction: <b>{f.trade.units} bonds</b> to{" "}
          {f.trade.buyer}, <b>{fmtEur(f.trade.price)}</b> to {f.trade.seller}. The cash backing moved between the two Sparkassen automatically.
        </>
      ),
      coupon: f.coupon && (
        <>
          {f.coupon.holders.map((h) => (
            <span key={h.name}>
              {h.name} received <b>{fmtEur(h.amount)}</b> ({h.units} × {fmtEur(COUPON_PER_UNIT)}).{" "}
            </span>
          ))}
          Calculated on the chain from the bond register.
        </>
      ),
      close: (
        <>
          {f.redeemed && (
            <>
              {f.redeemed.client} took <b>{fmtEur(f.redeemed.cents)}</b> back to its Geschäftskonto.{" "}
            </>
          )}
          {r &&
            (r.ok ? (
              <>
                Books match: cash <b>{fmtEur(r.cash.omnibusTotal)}</b> = S-EUR in circulation ✓, securities <b>{r.securities.registerTotal} bonds</b> = OSPlus
                Depots ✓
              </>
            ) : (
              <>Reconciliation found a mismatch.</>
            ))}
        </>
      ),
      final: null,
    }[chapter.id];
  }

  const chapterTxs = g.txs.filter((t) => chapter.steps.includes(t.step)).reverse();

  return (
    <div className="flex flex-col gap-3">
      {!done && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" className="px-4 py-2 text-[15px]" disabled={blocked} onClick={() => s.runChapter(chapter.id)}>
            {s.busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} {s.busy ? `${s.busy}…` : "Run this step"}
          </Button>
          {needs[chapter.id] && <span className="text-[13px] text-amber-700">Complete the previous steps first.</span>}
          {live && !s.busy && <span className="text-[13px] text-slate-500">Real transactions on OP Sepolia, a few seconds each.</span>}
        </div>
      )}
      {canTestFailure && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3">
          <Button disabled={blocked} onClick={() => s.run("Testing a failing trade", "dvp", (gw) => gw.dvpFailing(issuer!.kundennr, investor!.kundennr, TRADE.units), false)}>
            <FlaskConical className="size-4" /> What if the buyer can&apos;t pay?
          </Button>
          <span className="text-[13px] text-slate-600">
            {g.failedTrade ? (
              <>
                Tried to settle for {fmtEur(g.failedTrade.price)}: <b>reverted, nothing moved</b>, bonds stayed with the issuer.{" "}
                <ExplorerLink url={explorerUrl(g.explorers.l2, "tx", g.failedTrade.hash)}>failed tx {short(g.failedTrade.hash)}</ExplorerLink>
              </>
            ) : (
              "Sends a trade the investor can't afford: the contract reverts both legs."
            )}
          </span>
        </div>
      )}
      {result && (
        <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-[15px] text-slate-800">
          <Check className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>{result}</div>
        </div>
      )}
      {chapterTxs.length > 0 && (
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {live ? "The transactions on the OP Sepolia explorer" : "Transactions (simulated, no explorer)"}
          </div>
          <ul className="flex flex-col gap-1.5 text-[13.5px]">
            {chapterTxs.map((tx) => (
              <li key={tx.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-0.5">
                <span className={cn("text-slate-700", tx.failed && "text-amber-800")}>{tx.title}</span>
                <TxLinks tx={tx} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SettlementTimeline() {
  const s = useDemo();
  const e = s.engine();
  const live = s.mode === "live";
  const t = e.gateway.tracked.find((x) => x.kind === "dvp") ?? e.gateway.tracked[0];
  const st = s.status;
  const game = t?.proposalIndex !== undefined ? st?.proposals.find((p) => p.index === t.proposalIndex) : undefined;

  if (!t) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-4 text-[15px] text-slate-500">Settle the trade first (step 4). Then watch it move through the stages here.</p>;
  }
  const since = (at?: number) => (at ? `after ${fmtSec(at - t.confirmedAt)}` : undefined);
  const ex = e.gateway.explorers;
  const rows = [
    {
      label: "Confirmed on the OP Stack L2",
      sub: "bond and cash have changed hands",
      done: true,
      when: `in ${fmtSec(t.confirmedAt - t.submittedAt)}`,
      link: { url: explorerUrl(ex.l2, "tx", t.hash), text: `L2 tx ${short(t.hash)}` },
    },
    {
      label: "Anchored & final on RL1",
      sub: "published on RL1, which finalizes blocks on inclusion: from here the trade is irreversible",
      done: !!t.safeAt,
      when: since(t.safeAt),
      wait: live ? "usually 1–5 min" : "a few seconds",
      link: t.batchTx ? { url: explorerUrl(ex.l1, "tx", t.batchTx), text: `RL1 batch tx ${short(t.batchTx)} · block #${t.batchL1Block}` } : undefined,
    },
    {
      label: "State proof on RL1",
      sub: "needed only to move assets off the L2 (3.5-day challenge window)",
      done: !!t.resolved,
      when: t.resolved ? "accepted" : game ? `proposed, window ends in ${game.challengeEndsAt && st ? fmtDuration(game.challengeEndsAt - st.now) : "?"}` : undefined,
      wait: live ? "proposed within ~30 min, then 3.5 days" : "about 1 min",
      background: true,
      link: t.gameTx
        ? { url: explorerUrl(ex.l1, "tx", t.gameTx), text: `RL1 game tx ${short(t.gameTx)}` }
        : t.gameAddress
          ? { url: explorerUrl(ex.l1, "address", t.gameAddress), text: `game ${short(t.gameAddress)}` }
          : undefined,
    },
  ];
  return (
    <div>
      <div className="mb-2 text-[13px] text-slate-500">
        Tracking: <b className="text-slate-700">{t.label}</b>
      </div>
      <ol className="flex flex-col gap-2">
        {rows.map((r, i) => {
          // Background stages never block: they show when to expect them, not a spinner.
          const bg = "background" in r && r.background && !r.done && !!t.safeAt;
          const current = !r.done && !bg && (i === 0 || rows[i - 1].done);
          return (
            <li
              key={r.label}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                r.done ? "border-emerald-200 bg-emerald-50/60" : current ? "border-amber-200 bg-amber-50/60" : bg ? "border-sky-200 bg-sky-50/50" : "border-slate-200 opacity-60",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  r.done ? "bg-emerald-600 text-white" : current ? "bg-amber-500 text-white" : bg ? "bg-sky-100 text-sky-700" : "bg-slate-200 text-slate-500",
                )}
              >
                {r.done ? <Check className="size-4" /> : current ? <Loader2 className="size-4 animate-spin" /> : bg ? <Clock className="size-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-slate-900">{r.label}</div>
                <div className="text-[13px] text-slate-600">{r.sub}</div>
                {r.link && <ExplorerLink url={r.link.url} className="mt-0.5 text-[12.5px]">{r.link.text}</ExplorerLink>}
              </div>
              <div className="shrink-0 text-right text-[13px] font-medium text-slate-700">
                {r.when ??
                  (current ? (
                    <span className="text-amber-700">waiting · {r.wait}</span>
                  ) : bg ? (
                    <span className="text-sky-700">
                      in the background
                      <br />
                      <span className="font-normal">{r.wait}</span>
                    </span>
                  ) : (
                    ""
                  ))}
              </div>
            </li>
          );
        })}
      </ol>
      {t.safeAt && (
        <p className="mt-3 text-[13.5px] text-slate-600">
          ✓ The trade is final on RL1. <b>You can move on</b>: only the state proof continues in the background, and this page updates it
          automatically.
        </p>
      )}
      {live && (
        <p className="mt-2 text-[12px] text-slate-500">
          This live demo uses the public Sepolia test network as a stand-in for RL1. A Regulated Layer One with BFT consensus is final at inclusion;
          Sepolia itself confirms its own finality ~13 min later (see the technical view).
        </p>
      )}
    </div>
  );
}

