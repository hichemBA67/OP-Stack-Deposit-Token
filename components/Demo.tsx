"use client";

import { ChevronDown, Copy, ExternalLink, Landmark, Pause, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDemo, type Mode } from "@/lib/store";
import { GLOSSARY } from "@/lib/explain";
import { fmtEur, short } from "@/lib/format";
import { AboutView } from "./AboutView";
import { ExecutiveView } from "./ExecutiveView";
import { ArchitectureDiagram } from "./ArchitectureDiagram";
import { LedgerView } from "./LedgerView";
import { OsplusView } from "./OsplusView";
import { ReconView } from "./ReconView";
import { TraceLog } from "./TraceLog";
import { TxList } from "./TxList";
import { Walkthrough } from "./Walkthrough";
import { Button, Card, Stat, cn, inputCls } from "./ui";

const TABS = [
  { id: "txs", label: "Transactions & explorer links" },
  { id: "trace", label: "All messages" },
  { id: "osplus", label: "OSPlus accounts & bookings" },
  { id: "chain", label: "L2 → RL1 settlement" },
  { id: "recon", label: "Reconciliation" },
  { id: "glossary", label: "Glossary" },
  { id: "about", label: "Architecture notes" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function Demo() {
  const [mounted, setMounted] = useState(false);
  const start = useDemo((s) => s.start);
  const stop = useDemo((s) => s.stop);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- render only on the client (engine uses Date/crypto)
    setMounted(true);
    start();
    return stop;
  }, [start, stop]);
  if (!mounted) return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  return <DemoInner />;
}

function DemoInner() {
  const s = useDemo();
  const live = s.mode === "live";

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-3 md:p-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-spk text-white shadow-sm">
            <Landmark className="size-5" />
          </span>
          <div>
            <h1 className="text-[15px] leading-tight font-semibold text-slate-900">Tokenized deposits for Sparkassen</h1>
            <p className="text-xs text-slate-500">OSPlus → abstraction layer → OP Stack L2 → RL1 (Ethereum)</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ViewSwitch />
          <ModeSwitch />
          {!live && s.view === "tech" && (
            <div className="flex items-center rounded-lg border border-slate-300 bg-white p-0.5" title="Simulation speed">
              <button type="button" onClick={s.togglePause} className="rounded-md p-1 text-slate-600 hover:bg-slate-100" title={s.paused ? "Resume" : "Pause"}>
                {s.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              </button>
              {[1, 2, 4].map((x) => (
                <button
                  type="button"
                  key={x}
                  onClick={() => s.setSpeed(x)}
                  className={cn("rounded-md px-2 py-0.5 text-xs font-medium", s.speed === x ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
                >
                  {x}×
                </button>
              ))}
            </div>
          )}
          <Button variant="ghost" onClick={s.reset} disabled={!!s.busy} title="Start over">
            <RotateCcw className="size-4" /> Start over
          </Button>
          {s.view === "tech" && (
            <Button variant="primary" onClick={s.runLifecycle} disabled={!!s.busy || s.autoplay || (live && !s.liveConfig?.available)}>
              <Sparkles className="size-4" /> {s.autoplay ? "Playing…" : "Play all steps"}
            </Button>
          )}
        </div>
      </header>

      {live && <LiveBanner />}

      {s.error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span className="flex-1">{s.error}</span>
          <button type="button" onClick={s.clearError} aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      )}

      {s.view === "exec" ? <ExecutiveView /> : <TechnicalView />}

      <footer className="pb-2 text-center text-[11px] text-slate-400">
        Independent technical demo · fictitious institutes and data · not affiliated with Finanz Informatik or the Sparkassen-Finanzgruppe
      </footer>
    </div>
  );
}

function TechnicalView() {
  const s = useDemo();
  const st = s.status;
  const live = s.mode === "live";
  return (
    <>
      <Intro />

      <Card className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Ledger" value={live ? "OP Sepolia (live)" : "Simulation"} sub={s.busy ? `⏳ ${s.busy}…` : s.autoplay ? "playing all steps" : "ready"} />
        <Stat label="Newest L2 block" value={st ? `#${st.l2.unsafe}` : "—"} sub="confirmed by sequencer" />
        <Stat label="On Ethereum up to" value={st ? `#${st.l2.safe}` : "—"} sub="L2 'safe' head" />
        <Stat label="Final up to" value={st ? `#${st.l2.finalized}` : "—"} sub="L2 'finalized' head" />
        <Stat label="S-EUR in circulation" value={st?.token ? fmtEur(st.token.totalSupply) : "—"} sub={st?.token ? `contract ${short(st.token.address)}` : "created in step 1"} />
        <Stat label="Gateway gas" value={st?.gateway ? `${Number(st.gateway.balanceEth).toFixed(4)} ETH` : "—"} sub="pays L2 fees" />
      </Card>

      <Card className="p-3">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">The architecture: five parties, left to right</h2>
        </div>
        <ArchitectureDiagram />
      </Card>

      <Walkthrough />

      <Details />
    </>
  );
}

function ViewSwitch() {
  const view = useDemo((s) => s.view);
  const setView = useDemo((s) => s.setView);
  return (
    <div className="flex rounded-lg border border-slate-300 bg-white p-0.5" role="radiogroup" aria-label="View">
      {(
        [
          ["exec", "Executive view"],
          ["tech", "Technical view"],
        ] as const
      ).map(([id, label]) => (
        <button
          type="button"
          role="radio"
          aria-checked={view === id}
          key={id}
          onClick={() => setView(id)}
          className={cn("rounded-md px-2.5 py-0.5 text-xs font-medium", view === id ? "bg-spk text-white" : "text-slate-600 hover:bg-slate-100")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Intro() {
  const [open, setOpen] = useState(true);
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-2.5 text-left">
        <span className="text-sm font-semibold text-slate-900">What is this demo?</span>
        <ChevronDown className={cn("size-4 text-slate-500 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-slate-100 px-4 py-3 text-[13.5px] leading-relaxed text-slate-700 md:grid-cols-3">
          <div>
            <div className="mb-1 font-semibold text-slate-900">The idea</div>
            A Sparkasse issues <b>digital euros (S-EUR)</b> on a blockchain. Each token is a normal bank deposit: backed 1:1 by euros on a special account in
            OSPlus and redeemable at any time. Payments between customers settle in seconds, 24/7.
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-900">The systems</div>
            <b>OSPlus</b> stays the core banking system (simulated here). An <b>abstraction layer</b> (the gateway) connects it to <b>OP Sepolia</b>, a
            real public test network built with the OP Stack. OP Sepolia in turn publishes its data and state to <b>Ethereum Sepolia</b>, which gives it
            its security.
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-900">How to use this page</div>
            Walk through the <b>9 steps</b> below one at a time. Each step explains what happens and why, and lets you trigger it. Or press{" "}
            <b>Play all steps</b>. Click any box in the architecture to learn what it does.
          </div>
        </div>
      )}
    </Card>
  );
}

function ModeSwitch() {
  const mode = useDemo((s) => s.mode);
  const setMode = useDemo((s) => s.setMode);
  const busy = useDemo((s) => !!s.busy || s.autoplay);
  const opts: { id: Mode; label: string; title: string }[] = [
    { id: "live", label: "OP Sepolia (live)", title: "Real transactions on OP Sepolia, settling on RL1 Sepolia" },
    { id: "simulated", label: "Simulation", title: "Everything runs in your browser with sped-up timings" },
  ];
  return (
    <div className="flex rounded-lg border border-slate-300 bg-white p-0.5" role="radiogroup" aria-label="Ledger">
      {opts.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={mode === o.id}
          key={o.id}
          title={o.title}
          disabled={busy}
          onClick={() => setMode(o.id)}
          className={cn("rounded-md px-2.5 py-0.5 text-xs font-medium", mode === o.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const FAUCETS = [
  { label: "Superchain faucet", url: "https://console.optimism.io/faucet" },
  { label: "Alchemy faucet", url: "https://www.alchemy.com/faucets/optimism-sepolia" },
];

function LiveBanner() {
  const cfg = useDemo((s) => s.liveConfig);
  const st = useDemo((s) => s.status);
  const token = useDemo((s) => s.accessToken);
  const setToken = useDemo((s) => s.setAccessToken);
  const [copied, setCopied] = useState(false);

  if (!cfg?.available) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900">
        <b>OP Sepolia isn&apos;t configured on this deployment.</b> The server needs <code>L1_RPC_URL</code>, <code>L2_RPC_URL</code> and{" "}
        <code>GATEWAY_PRIVATE_KEY</code> (see README). Until then, switch to <b>Simulation</b>, which shows exactly the same flow.
      </div>
    );
  }
  if (!st) {
    return <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-[13.5px] text-slate-600">Connecting to {cfg.l2Name} and {cfg.l1Name}…</div>;
  }
  const balance = Number(st?.gateway?.balanceEth ?? "0");
  const needsGas = st?.gateway && balance < 0.0005;
  const addr = st?.gateway?.address;

  return (
    <div className={cn("rounded-lg border px-4 py-3 text-[13.5px]", needsGas ? "border-amber-300 bg-amber-50 text-amber-950" : "border-sky-200 bg-sky-50 text-sky-950")}>
      {needsGas ? (
        <>
          <div className="font-semibold">One-time setup: give the gateway some test ETH for fees</div>
          <p className="mt-1">
            Every transaction on OP Sepolia costs a tiny fee (gas), paid by the gateway, never by customers. The gateway&apos;s wallet is empty. Send it a
            small amount of <b>OP Sepolia ETH</b> (0.01 is plenty for hundreds of steps) from a free faucet. This page updates automatically.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-white px-2 py-1 font-mono text-[12.5px] ring-1 ring-amber-200">{addr}</code>
            <Button
              onClick={() => {
                navigator.clipboard?.writeText(addr ?? "").then(() => setCopied(true), () => undefined);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Copy className="size-3.5" /> {copied ? "Copied" : "Copy address"}
            </Button>
            {FAUCETS.map((f) => (
              <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:underline">
                {f.label} <ExternalLink className="size-3" />
              </a>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Live: every S-EUR action below is a <b>real transaction on {cfg.l2Name}</b>, settling on <b>{cfg.l1Name}</b>. OSPlus is still simulated. Links open
            the public block explorers.
          </span>
        </div>
      )}
      {cfg.requiresAccessToken && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs">Access token for this demo:</span>
          <input className={cn(inputCls, "w-56")} type="password" value={token ?? ""} onChange={(e) => setToken(e.target.value)} />
        </div>
      )}
    </div>
  );
}

function Details() {
  const [tab, setTab] = useState<Tab>("txs");
  return (
    <Card className="flex h-[560px] min-h-0 flex-col overflow-hidden">
      <div className="border-b border-slate-200 px-4 pt-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Technical details (for architects)</h2>
        <nav className="scroll-thin mt-1 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-1.5 text-sm font-medium",
                tab === t.id ? "border-spk text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "txs" && <TxList />}
        {tab === "trace" && <TraceLog />}
        {tab === "osplus" && <OsplusView />}
        {tab === "chain" && <LedgerView />}
        {tab === "recon" && <ReconView />}
        {tab === "glossary" && <Glossary />}
        {tab === "about" && <AboutView />}
      </div>
    </Card>
  );
}

function Glossary() {
  return (
    <dl className="scroll-thin grid h-full gap-x-6 gap-y-3 overflow-y-auto p-4 text-[13.5px] md:grid-cols-2">
      {GLOSSARY.map((g) => (
        <div key={g.term}>
          <dt className="font-semibold text-slate-900">{g.term}</dt>
          <dd className="text-slate-600">{g.text}</dd>
        </div>
      ))}
    </dl>
  );
}
