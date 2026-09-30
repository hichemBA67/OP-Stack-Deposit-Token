"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { useDemo } from "@/lib/store";
import { INSTITUTE } from "@/lib/osplus/simulator";
import type { StepId } from "@/lib/types";
import { Button, cn, inputCls } from "./ui";

const NAMES = ["Anna Schmidt", "Ben Müller", "Clara Weber", "David Nowak", "Eva Hoffmann", "Felix Braun"];

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Amount({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="relative">
      <input
        type="number"
        min={1}
        step={50}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(inputCls, "pr-6 text-right tabular-nums")}
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-slate-400">€</span>
    </div>
  );
}

/** The input form + button for the steps the user triggers. */
export function StepActions({ step }: { step: StepId }) {
  const s = useDemo();
  const engine = s.engine();
  const kunden = engine.osplus.state.kunden.filter((k) => engine.gateway.wallets.has(k.kundennr));
  const blocked = !!s.busy || s.autoplay || (s.mode === "live" && !s.liveConfig?.available);

  const [nameEdit, setName] = useState<string>();
  const [instEdit, setInst] = useState<string>();
  const [who, setWho] = useState("");
  const [to, setTo] = useState("");
  const [amounts, setAmounts] = useState({ fund: 5000, tokenize: 2500, transfer: 1000, redeem: 400 });

  const count = engine.osplus.state.kunden.length;
  const name = nameEdit ?? NAMES[count] ?? `Kunde ${count + 1}`;
  const inst = instEdit ?? INSTITUTE[count % INSTITUTE.length].id;
  const from = who || kunden[0]?.kundennr || "";
  const dest = to || kunden.find((k) => k.kundennr !== from)?.kundennr || "";
  const redeemer = to || kunden[1]?.kundennr || from;

  const customer = (value: string, set: (v: string) => void, exclude?: string) => (
    <select className={inputCls} value={value} onChange={(e) => set(e.target.value)} disabled={!kunden.length}>
      {!kunden.length && <option>Complete step 1 first</option>}
      {kunden
        .filter((k) => k.kundennr !== exclude)
        .map((k) => (
          <option key={k.kundennr} value={k.kundennr}>
            {k.name} ({INSTITUTE.find((i) => i.id === k.institutId)!.name})
          </option>
        ))}
    </select>
  );
  const amount = (k: keyof typeof amounts) => (
    <Amount value={amounts[k]} onChange={(v) => setAmounts({ ...amounts, [k]: v })} />
  );
  const go = (label: string, fn: Parameters<typeof s.run>[2]) => s.run(label, step, fn);
  const cents = (k: keyof typeof amounts) => Math.round(amounts[k] * 100);

  let form: React.ReactNode;
  let action: { label: string; run: () => unknown; disabled?: boolean };
  switch (step) {
    case "onboard":
      form = (
        <>
          <Field label="Customer name" className="flex-1">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Sparkasse" className="flex-1">
            <select className={inputCls} value={inst} onChange={(e) => setInst(e.target.value)}>
              {INSTITUTE.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
        </>
      );
      action = {
        label: "Open account",
        disabled: !name.trim(),
        run: async () => {
          if (await go(`Onboarding ${name}`, (g) => g.onboard(name.trim(), inst))) {
            setName(undefined);
            setInst(undefined);
          }
        },
      };
      break;
    case "fund":
      form = (
        <>
          <Field label="Customer" className="flex-1">{customer(from, setWho)}</Field>
          <Field label="SEPA credit" className="w-32">{amount("fund")}</Field>
        </>
      );
      action = { label: "Credit account", disabled: !from, run: () => go("SEPA credit", (g) => g.fund(from, cents("fund"))) };
      break;
    case "tokenize":
      form = (
        <>
          <Field label="Customer" className="flex-1">{customer(from, setWho)}</Field>
          <Field label="Tokenize" className="w-32">{amount("tokenize")}</Field>
        </>
      );
      action = { label: "Mint S-EUR", disabled: !from, run: () => go("Tokenizing", (g) => g.tokenize(from, cents("tokenize"))) };
      break;
    case "transfer":
      form = (
        <>
          <Field label="From" className="flex-1">{customer(from, setWho)}</Field>
          <Field label="To" className="flex-1">{customer(dest, setTo, from)}</Field>
          <Field label="Amount" className="w-32">{amount("transfer")}</Field>
        </>
      );
      action = { label: "Send payment", disabled: !from || !dest, run: () => go("Transferring", (g) => g.transfer(from, dest, cents("transfer"))) };
      break;
    case "redeem":
      form = (
        <>
          <Field label="Customer" className="flex-1">{customer(redeemer, setTo)}</Field>
          <Field label="Redeem" className="w-32">{amount("redeem")}</Field>
        </>
      );
      action = { label: "Burn & pay out", disabled: !redeemer, run: () => go("Redeeming", (g) => g.redeem(redeemer, cents("redeem"))) };
      break;
    case "reconcile":
      form = <p className="flex-1 self-center text-sm text-slate-600">No input needed. The gateway compares both ledgers.</p>;
      action = { label: "Run reconciliation", run: () => go("Reconciling", (g) => g.reconcile()) };
      break;
    default:
      return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Try it</div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        {form}
        <Button variant="primary" onClick={action.run} disabled={blocked || action.disabled} className="shrink-0">
          <Play className="size-3.5" /> {s.busy ?? action.label}
        </Button>
      </div>
    </div>
  );
}
