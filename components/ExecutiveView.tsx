"use client";

import { ArrowLeft, ArrowRight, Building2, Check, ChevronRight, Clock, Cpu, Landmark, Layers, Loader2, Play, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useDemo } from "@/lib/store";
import { CHAPTERS, type Chapter } from "@/lib/explain";
import { fmtDuration, fmtEur, short } from "@/lib/format";
import type { Layer } from "@/lib/types";
import { explorerUrl } from "@/lib/gateway/gateway";
import { ExplorerLink, TxLinks, TxList } from "./TxList";
import { Button, Card, cn } from "./ui";

const SYSTEMS: { layer: Layer; name: string; role: string; icon: ReactNode; tone: string }[] = [
  { layer: "osplus", name: "OSPlus", role: "Core banking. Keeps customers, accounts and euros.", icon: <Building2 className="size-5" />, tone: "text-red-700 bg-red-50 border-red-200" },
  { layer: "gateway", name: "Abstraction layer", role: "Connects OSPlus to the blockchain and holds the keys.", icon: <Layers className="size-5" />, tone: "text-violet-700 bg-violet-50 border-violet-200" },
  { layer: "l2", name: "OP Stack L2", role: "Fast payment network. A new block every 2 seconds.", icon: <Cpu className="size-5" />, tone: "text-orange-700 bg-orange-50 border-orange-200" },
  { layer: "l1", name: "RL1 · Ethereum", role: "Settlement layer. Makes payments final and verifiable.", icon: <Landmark className="size-5" />, tone: "text-indigo-700 bg-indigo-50 border-indigo-200" },
];

export function ExecutiveView() {
  const s = useDemo();
  const states = s.stepStates();
  const chapter = CHAPTERS.find((c) => c.steps.includes(s.selected)) ?? CHAPTERS[0];
  const idx = CHAPTERS.indexOf(chapter);

  const chapterState = (c: Chapter) => {
    // Finality and the state proof run in the background; the chapter is done once anchored on RL1.
    const core = c.id === "secure" ? (["batch"] as const) : c.steps;
    if (core.every((id) => states[id] === "done")) return "done";
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
                  {sys.layer === "l1" && <p className="mt-1 text-[11px] text-slate-500">{s.mode === "live" ? "live: Ethereum Sepolia" : "simulated"}</p>}
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
        <ol className="mb-5 grid grid-cols-5 gap-1.5">
          {CHAPTERS.map((c, i) => {
            const st = chapterState(c);
            const sel = c.id === chapter.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => s.select(c.steps[0])}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-center transition",
                    sel ? "bg-slate-900 text-white" : "hover:bg-slate-100",
                  )}
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
          Every blockchain transaction of this story, on the <b>OP Sepolia</b> explorer (payments) and the <b>Sepolia Etherscan</b> for RL1 (batches
          and state proposals that anchor the payments). Anyone can check them.
        </p>
        <TxList compact />
      </Card>
    </div>
  );
}

function Hero() {
  const s = useDemo();
  const g = s.engine().gateway;
  const st = s.status;
  const pay = g.tracked.find((t) => t.label.startsWith("Transfer")) ?? g.tracked.find((t) => t.label.startsWith("Mint"));
  const anchored = g.tracked.find((t) => t.safeAt);
  const final = g.tracked.find((t) => t.finalizedAt);
  const supply = st?.token?.totalSupply;
  const omnibus = g.osplus.state.konten.filter((k) => k.produkt !== "Girokonto").reduce((a, k) => a + k.saldo, 0);
  const backing = supply ? Math.round((omnibus / supply) * 100) : undefined;
  const live = s.mode === "live";

  const kpis = [
    {
      label: "Payment settled in",
      value: pay ? fmtSec(pay.confirmedAt - pay.submittedAt) : live ? "≈ 2 s" : "≈ 1 s",
      sub: pay ? (live ? "measured on OP Sepolia" : "simulated") : "expected: one L2 block",
      measured: !!pay,
    },
    {
      label: "Anchored on RL1 in",
      value: anchored ? fmtSec(anchored.safeAt! - anchored.confirmedAt) : live ? "≈ 2 min" : "≈ 5 s",
      sub: final
        ? `final after ${fmtDuration(final.finalizedAt! - final.confirmedAt)}${live ? "" : " (simulated)"}`
        : anchored
          ? `${live ? "measured" : "simulated"} · final ≈ 15 min later, in background`
          : live
            ? "expected · published on Ethereum"
            : "simulated (real ≈ 2 min)",
      measured: !!anchored,
    },
    { label: "Digital euros in circulation", value: supply !== undefined ? fmtEur(supply) : "—", sub: "S-EUR on the L2", measured: supply !== undefined },
    {
      label: "Backed by OSPlus deposits",
      value: backing !== undefined ? `${backing} %` : "—",
      sub: g.lastRecon ? (g.lastRecon.ok ? "✓ verified by reconciliation" : "✗ mismatch") : "Sammelkonten ÷ S-EUR supply",
      measured: backing !== undefined,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-white to-red-50/60 p-5 md:p-7">
        <h2 className="max-w-3xl text-2xl leading-tight font-semibold text-slate-900 md:text-3xl">
          Sparkasse customers pay each other in seconds with digital euros
        </h2>
        <p className="mt-2 max-w-3xl text-[16px] leading-relaxed text-slate-600">
          Tokenized deposits: backed 1:1 by customer deposits in <b>OSPlus</b>, moved on an <b>OP Stack</b> network, and made final and verifiable on{" "}
          <b>RL1 (Ethereum)</b>. Five steps below show the full lifecycle.
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
  const k = e.osplus.state.kunden;
  const live = s.mode === "live";
  const blocked = !!s.busy || s.autoplay || (live && !s.liveConfig?.available);
  const bal = (i: number) => (k[i] ? fmtEur(s.balances[k[i].kundennr] ?? 0) : "—");
  const giro = (i: number) => (k[i] ? fmtEur(e.osplus.konto(k[i].girokonto).saldo) : "—");
  const needs: Partial<Record<Chapter["id"], boolean>> = {
    convert: !k[0] || e.osplus.verfuegbar(k[0].girokonto) < 2_500_00,
    pay: !k[1] || (s.balances[k[0]?.kundennr] ?? 0) < 1_000_00,
    redeem: !k[1] || (s.balances[k[1]?.kundennr] ?? 0) < 400_00,
  };

  let result: ReactNode = null;
  if (done) {
    const pay = e.gateway.tracked.find((t) => t.label.startsWith("Transfer"));
    const r = e.gateway.lastRecon;
    result = {
      account: <>Anna and Ben are verified customers with bank-managed wallets. Anna has <b>{giro(0)}</b> on her Girokonto.</>,
      convert: <>Anna now holds <b>{bal(0)} S-EUR</b>. OSPlus moved the same amount to the backing account (Sammelkonto).</>,
      pay: (
        <>
          Ben received the payment{pay && <> in <b>{fmtSec(pay.confirmedAt - pay.submittedAt)}</b></>}. Current balances: Anna <b>{bal(0)}</b>, Ben <b>{bal(1)}</b> S-EUR. The backing moved
          from Sparkasse Musterstadt to Sparkasse Beispielstadt automatically.
        </>
      ),
      redeem: (
        <>
          Ben has <b>{giro(1)}</b> on his Girokonto.{" "}
          {r && (r.ok ? <>Books balance: <b>{fmtEur(r.totalSupply)}</b> digital euros = <b>{fmtEur(r.omnibusTotal)}</b> on the backing accounts ✓</> : <>Reconciliation found a mismatch.</>)}
        </>
      ),
      secure: null,
    }[chapter.id];
  }

  const chapterTxs = e.gateway.txs.filter((t) => chapter.steps.includes(t.step)).reverse();

  return (
    <div className="flex flex-col gap-3">
      {!done && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" className="px-4 py-2 text-[15px]" disabled={blocked} onClick={() => s.runChapter(chapter.id)}>
            {s.busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} {s.busy ? `${s.busy}…` : "Run this step"}
          </Button>
          {needs[chapter.id] && <span className="text-[13px] text-amber-700">Complete the previous step first.</span>}
          {live && !s.busy && <span className="text-[13px] text-slate-500">Real transactions on OP Sepolia, a few seconds each.</span>}
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
                <span className="text-slate-700">{tx.title}</span>
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
  const t = e.gateway.tracked.find((x) => x.label.startsWith("Transfer")) ?? e.gateway.tracked[0];
  const st = s.status;
  const game = t?.proposalIndex !== undefined ? st?.proposals.find((p) => p.index === t.proposalIndex) : undefined;

  if (!t) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-4 text-[15px] text-slate-500">Make a payment first (step 3). Then watch it move through the stages here.</p>;
  }
  const since = (at?: number) => (at ? `after ${fmtSec(at - t.confirmedAt)}` : undefined);
  const ex = e.gateway.explorers;
  const batchFinal = t.batchL1Block !== undefined && st && t.batchL1Block <= st.l1.finalized;
  const rows = [
    {
      label: "Confirmed on the OP Stack L2",
      sub: "the customer sees the payment",
      done: true,
      when: `in ${fmtSec(t.confirmedAt - t.submittedAt)}`,
      link: { url: explorerUrl(ex.l2, "tx", t.hash), text: `L2 tx ${short(t.hash)}` },
    },
    {
      label: "Published on RL1",
      sub: "anyone can verify it from Ethereum data",
      done: !!t.safeAt,
      when: since(t.safeAt),
      wait: live ? "usually 1–5 min" : "a few seconds",
      link: t.batchTx ? { url: explorerUrl(ex.l1, "tx", t.batchTx), text: `RL1 batch tx ${short(t.batchTx)}` } : undefined,
    },
    {
      label: "Final on RL1",
      sub: "irreversible, the settlement-finality point",
      done: !!t.finalizedAt,
      when: since(t.finalizedAt),
      wait: t.safeAt ? `expected ≈ ${clock(t.safeAt + (live ? 13 * 60_000 : 18_000))}` : live ? "≈ 15 min after publishing" : "a few seconds",
      background: true,
      link: t.batchL1Block !== undefined && (t.finalizedAt || batchFinal) ? { url: explorerUrl(ex.l1, "block", t.batchL1Block), text: `RL1 block #${t.batchL1Block}` } : undefined,
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
      {t.safeAt && !t.finalizedAt && (
        <p className="mt-3 text-[13.5px] text-slate-600">
          ✓ The payment is anchored on RL1. <b>You can move on</b>: finality and the state proof complete on their own, and this page updates them
          automatically.
        </p>
      )}
    </div>
  );
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
