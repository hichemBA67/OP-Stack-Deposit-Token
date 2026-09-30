import clsx from "clsx";
import type { ReactNode } from "react";
import type { Component, Layer, SettlementStage, StepId } from "@/lib/types";

export const cn = clsx;

export const LAYER_META: Record<Layer, { label: string; sub: string; text: string; bg: string; border: string; dot: string }> = {
  customer: { label: "Customer", sub: "S-App · Filiale", text: "text-slate-700", bg: "bg-slate-100", border: "border-slate-300", dot: "bg-slate-500" },
  osplus: { label: "OSPlus", sub: "Core banking (simulated)", text: "text-red-700", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-600" },
  gateway: { label: "Abstraction layer", sub: "Sparkassen Chain Gateway", text: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", dot: "bg-violet-600" },
  l2: { label: "OP Stack L2", sub: "OP Sepolia", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500" },
  l1: { label: "RL1", sub: "Regulated Layer One", text: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", dot: "bg-indigo-600" },
};

export const COMPONENT_LABEL: Record<Component, string> = {
  channel: "S-App / Filiale",
  kyc: "Kunden & KYC",
  giro: "Girokonten",
  hold: "Sperren",
  omnibus: "Sammelkonto",
  journal: "Buchungsjournal",
  api: "Outbox / API",
  compliance: "Compliance",
  custody: "Custody (HSM)",
  orchestrator: "Saga orchestrator",
  recon: "Reconciliation",
  sequencer: "Sequencer",
  token: "S-EUR contract",
  batcher: "op-batcher",
  proposer: "op-proposer",
  batchInbox: "BatchInbox (blobs)",
  disputeGame: "DisputeGameFactory",
  portal: "OptimismPortal",
};

export const STEP_LABEL: Record<StepId, string> = {
  onboard: "Onboarding",
  fund: "Funding",
  tokenize: "Tokenize",
  transfer: "Transfer",
  batch: "Batch → RL1",
  finality: "RL1 finality",
  proposal: "Output root",
  redeem: "Redeem",
  reconcile: "Reconcile",
};

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>{children}</div>;
}

export function LayerBadge({ layer }: { layer: Layer }) {
  const m = LAYER_META[layer];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium", m.bg, m.text)}>
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

const STAGE_STYLE: Record<SettlementStage, string> = {
  unsafe: "bg-amber-100 text-amber-800 ring-amber-300",
  safe: "bg-sky-100 text-sky-800 ring-sky-300",
  finalized: "bg-emerald-100 text-emerald-800 ring-emerald-300",
};

export function StageBadge({ stage }: { stage: SettlementStage }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1", STAGE_STYLE[stage])}>
      {stage}
    </span>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="truncate font-mono text-sm font-semibold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="truncate text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-spk text-white shadow-sm hover:bg-red-700",
        variant === "secondary" && "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

export const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";
