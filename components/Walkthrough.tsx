"use client";

import { ArrowLeft, ArrowRight, Check, Clock, ExternalLink, Eye, Loader2, MousePointerClick } from "lucide-react";
import { useDemo } from "@/lib/store";
import { STEPS, STEP_BY_ID } from "@/lib/explain";
import { fmtDuration, fmtTime } from "@/lib/format";
import { LAYERS, type StepId } from "@/lib/types";
import { StepActions } from "./StepActions";
import { Button, Card, LayerBadge, StageBadge, cn } from "./ui";

/** Steps that complete on their own after the payment is final on RL1; the story never waits for them. */
const BACKGROUND: StepId[] = ["proposal"];

export function Walkthrough() {
  return (
    <div className="grid gap-3 lg:grid-cols-[270px_minmax(0,1fr)]">
      <StepNav />
      <StepDetail />
    </div>
  );
}

function StepNav() {
  const s = useDemo();
  const states = s.stepStates();
  return (
    <Card className="h-fit p-2">
      <div className="px-2 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">The lifecycle in 9 steps</div>
      <ol className="flex flex-col gap-0.5">
        {STEPS.map((step, i) => {
          const st = states[step.id];
          const selected = s.selected === step.id;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => s.select(step.id)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition",
                  selected ? "bg-slate-900 text-white" : "hover:bg-slate-100",
                )}
              >
                <span
                  className={cn(
                    "mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    st === "done" ? "bg-emerald-600 text-white" : st === "active" ? "bg-amber-500 text-white" : selected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600",
                  )}
                >
                  {st === "done" ? <Check className="size-3" /> : st === "active" ? <Loader2 className="size-3 animate-spin" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] leading-tight font-medium">{step.title}</span>
                  <span className={cn("text-[11px]", selected ? "text-white/60" : "text-slate-400")}>
                    {step.kind === "action" ? "you trigger this" : BACKGROUND.includes(step.id) ? "in the background, no need to wait" : "happens automatically"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function StepDetail() {
  const s = useDemo();
  const step = STEP_BY_ID[s.selected];
  const idx = STEPS.findIndex((x) => x.id === step.id);
  const state = s.stepStates()[step.id];
  const live = s.mode === "live";

  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Step {idx + 1} of {STEPS.length}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            step.kind === "action" ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-700",
          )}
        >
          {step.kind === "action" ? <MousePointerClick className="size-3" /> : <Eye className="size-3" />}
          {step.kind === "action"
            ? "You trigger this step"
            : BACKGROUND.includes(step.id)
              ? "Runs in the background: you can continue with the next steps"
              : "Happens automatically, just watch"}
        </span>
        {state === "done" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">✓ done</span>}
        {state === "active" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">in progress…</span>}
      </div>

      <div>
        <h2 className="text-xl font-semibold text-slate-900">{step.title}</h2>
        <p className="mt-1 text-[15px] font-medium text-slate-700">{step.summary}</p>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{step.story}</p>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Who does what</h3>
        <ul className="flex flex-col gap-1.5">
          {LAYERS.filter((l) => step.who[l]).map((l) => (
            <li key={l} className="grid grid-cols-[130px_minmax(0,1fr)] items-start gap-2 text-[13.5px] text-slate-700">
              <span className="pt-0.5">
                <LayerBadge layer={l} />
              </span>
              <span>{step.who[l]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
          <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">Why it matters for the Sparkasse</div>
          <p className="text-[13.5px] leading-relaxed text-emerald-950">{step.why}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-0.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <Clock className="size-3" /> How long
          </div>
          <p className="text-[13.5px] text-slate-800">{live ? step.timing.live : step.timing.simulated}</p>
          <p className="mt-1 text-[11px] text-slate-500">{live ? `Simulation: ${step.timing.simulated}` : `On OP Sepolia: ${step.timing.live}`}</p>
        </div>
      </div>

      {step.kind === "action" ? <StepActions key={step.id} step={step.id} /> : <SettlementProgress step={step.id} />}

      <StepTimeline step={step.id} />

      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <Button variant="ghost" disabled={idx === 0} onClick={() => s.select(STEPS[idx - 1].id)}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button variant={state === "done" ? "primary" : "secondary"} disabled={idx === STEPS.length - 1} onClick={() => s.select(STEPS[idx + 1].id)}>
          Next: {STEPS[idx + 1]?.title ?? "done"} <ArrowRight className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

/** Live view of the automatic steps: where each business transaction is in the settlement pipeline. */
function SettlementProgress({ step }: { step: StepId }) {
  const s = useDemo();
  const st = s.status;
  const tracked = s.engine().gateway.tracked;
  if (!st) return null;
  const l2BlockSec = st.kind === "simulated" ? 1 : 2;
  const lag = (n: number) => `${st.l2.unsafe - n} blocks ≈ ${fmtDuration((st.l2.unsafe - n) * l2BlockSec * 1000)}`;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-800">Live status</div>
      <div className="mb-3 grid gap-2 text-[13px] sm:grid-cols-3">
        <div>
          <div className="text-[11px] text-slate-500">Newest L2 block (unsafe)</div>
          <div className="font-mono font-semibold text-amber-700">#{st.l2.unsafe}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-500">Safe head (data on RL1)</div>
          <div className="font-mono font-semibold text-sky-700">#{st.l2.safe}</div>
          <div className="text-[11px] text-slate-500">{lag(st.l2.safe)} behind</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-500">Finalized head (RL1 final)</div>
          <div className="font-mono font-semibold text-emerald-700">#{st.l2.finalized}</div>
          <div className="text-[11px] text-slate-500">{lag(st.l2.finalized)} behind</div>
        </div>
      </div>
      {!tracked.length ? (
        <p className="text-[13px] text-slate-600">
          No transactions yet. Complete steps 1–4 first, then come back here and watch them move from <b>unsafe</b> to <b>safe</b> to <b>finalized</b>.
        </p>
      ) : (
        <ul className="divide-y divide-sky-100">
          {tracked.map((t) => {
            const game = t.proposalIndex !== undefined ? st.proposals.find((p) => p.index === t.proposalIndex) : undefined;
            return (
              <li key={t.hash} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-[13px]">
                <span className="min-w-0 flex-1 text-slate-800">{t.label}</span>
                <span className="font-mono text-[11px] text-slate-500">L2 #{t.l2Block}</span>
                <StageBadge stage={t.stage} />
                {step === "proposal" && (
                  <span className="text-[12px] text-slate-600">
                    {t.resolved
                      ? `game #${t.proposalIndex} ✓ accepted`
                      : game
                        ? `game #${game.index} · challenge ends in ${game.challengeEndsAt ? fmtDuration(game.challengeEndsAt - st.now) : "?"}`
                        : "waiting for a proposal…"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StepTimeline({ step }: { step: StepId }) {
  const events = useDemo((s) => s.events).filter((e) => e.step === step);
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        What happened in this step {events.length > 0 && <span className="font-normal normal-case">({events.length} messages, oldest first)</span>}
      </h3>
      {!events.length ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-3 text-[13px] text-slate-500">
          Nothing yet. {STEP_BY_ID[step].kind === "action" ? "Use the form above, and each message between the systems will appear here with an explanation." : "Messages appear here as soon as the chain reaches this stage."}
        </p>
      ) : (
        <ol className="relative flex flex-col gap-2 border-l-2 border-slate-100 pl-4">
          {[...events].reverse().map((e) => (
            <li key={e.id} className="row-in relative">
              <span
                className={cn(
                  "absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-2 ring-white",
                  e.level === "error" ? "bg-red-600" : e.level === "warn" ? "bg-amber-500" : e.level === "success" ? "bg-emerald-500" : "bg-slate-400",
                )}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <LayerBadge layer={e.from} />
                {e.to !== e.from && (
                  <>
                    <ArrowRight className="size-3 text-slate-400" />
                    <LayerBadge layer={e.to} />
                  </>
                )}
                <span className="font-mono text-[10.5px] text-slate-400">{fmtTime(e.ts)}</span>
              </div>
              <div className={cn("mt-0.5 text-[13.5px] font-medium", e.level === "error" ? "text-red-700" : "text-slate-900")}>{e.title}</div>
              {e.explain && <p className="text-[13px] leading-snug text-slate-600">{e.explain}</p>}
              <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-slate-400">
                {e.protocol && <span>{e.protocol}</span>}
                {e.endpoint && <span>{e.endpoint}</span>}
                {e.link && (
                  <a href={e.link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-sans text-[11.5px] text-sky-700 hover:underline">
                    {e.link.label} <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
