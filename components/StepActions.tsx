"use client";

import { FlaskConical, Play } from "lucide-react";
import { useState } from "react";
import { useDemo } from "@/lib/store";
import { BOND } from "@/lib/bond";
import { INVESTOR, ISSUER, TRADE } from "@/lib/explain";
import { fmtEur } from "@/lib/format";
import { INSTITUTE, type Kunde } from "@/lib/osplus/simulator";
import type { StepId } from "@/lib/types";
import { Button, cn, inputCls } from "./ui";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Num({ value, onChange, suffix, step = 1 }: { value: number; onChange: (v: number) => void; suffix: string; step?: number }) {
  return (
    <div className="relative">
      <input
        type="number"
        min={1}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(inputCls, "pr-10 text-right tabular-nums")}
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>
    </div>
  );
}

/** The input form + button for the steps the user triggers (technical view). */
export function StepActions({ step }: { step: StepId }) {
  const s = useDemo();
  const engine = s.engine();
  const kunden = engine.osplus.state.kunden.filter((k) => engine.gateway.wallets.has(k.kundennr));
  const issuers = kunden.filter((k) => k.rolle === "Emittent");
  const investors = kunden.filter((k) => k.rolle === "Investor");
  const blocked = !!s.busy || s.autoplay || (s.mode === "live" && !s.liveConfig?.available);

  const all = engine.osplus.state.kunden;
  const nextDefault = !all.some((k) => k.rolle === "Emittent")
    ? { name: ISSUER.name, inst: ISSUER.institutId, rolle: "Emittent" as const, balance: ISSUER.balance / 100 }
    : !all.some((k) => k.rolle === "Investor")
      ? { name: INVESTOR.name, inst: INVESTOR.institutId, rolle: "Investor" as const, balance: INVESTOR.balance / 100 }
      : { name: "Weber Maschinenbau GmbH", inst: INSTITUTE[0].id, rolle: "Investor" as const, balance: 150_000 };

  const [form, setForm] = useState<Partial<{ name: string; inst: string; rolle: Kunde["rolle"]; balance: number }>>({});
  const [pick, setPick] = useState<Record<string, string>>({});
  const [nums, setNums] = useState<Record<"issue" | "tokenize" | "units" | "price" | "redeem", number>>({
    issue: BOND.issueUnits,
    tokenize: TRADE.priceCents / 100,
    units: TRADE.units,
    price: TRADE.priceCents / 100,
    redeem: 0,
  });

  const f = { ...nextDefault, ...form };
  const sel = (key: string, list: Kunde[]) => pick[key] || list[0]?.kundennr || "";
  const issuer = sel("issuer", issuers);
  const investor = sel("investor", investors);
  const anyClient = sel("client", kunden);
  const redeemClient = pick.redeem || issuer || anyClient;
  const redeemDefault = s.balances[redeemClient]?.cash ?? 0;

  const choose = (key: string, list: Kunde[], label: string) => (
    <Field label={label} className="flex-1">
      <select className={inputCls} value={sel(key, list)} onChange={(e) => setPick({ ...pick, [key]: e.target.value })} disabled={!list.length}>
        {!list.length && <option>Complete step 1 first</option>}
        {list.map((k) => (
          <option key={k.kundennr} value={k.kundennr}>
            {k.name} ({INSTITUTE.find((i) => i.id === k.institutId)!.name})
          </option>
        ))}
      </select>
    </Field>
  );
  const go = (label: string, fn: Parameters<typeof s.run>[2]) => s.run(label, step, fn);

  let body: React.ReactNode;
  let action: { label: string; run: () => unknown; disabled?: boolean };
  let extra: React.ReactNode = null;
  switch (step) {
    case "onboard":
      body = (
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <Field label="Company">
            <input className={inputCls} value={f.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Sparkasse">
            <select className={inputCls} value={f.inst} onChange={(e) => setForm({ ...form, inst: e.target.value })}>
              {INSTITUTE.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select className={inputCls} value={f.rolle} onChange={(e) => setForm({ ...form, rolle: e.target.value as Kunde["rolle"] })}>
              <option value="Emittent">Issuer (Emittent)</option>
              <option value="Investor">Investor</option>
            </select>
          </Field>
          <Field label="Existing deposits">
            <Num value={f.balance} onChange={(v) => setForm({ ...form, balance: v })} suffix="€" step={1000} />
          </Field>
        </div>
      );
      action = {
        label: "Onboard client",
        disabled: !f.name.trim(),
        run: async () => {
          if (await go(`Onboarding ${f.name}`, (g) => g.onboard(f.name.trim(), f.inst, f.rolle, Math.round(f.balance * 100)))) setForm({});
        },
      };
      break;
    case "issue":
      body = (
        <>
          {choose("issuer", issuers, "Issuer")}
          <Field label={`Bonds of ${fmtEur(BOND.nominalCents)}`} className="w-36">
            <Num value={nums.issue} onChange={(v) => setNums({ ...nums, issue: v })} suffix="pcs" />
          </Field>
        </>
      );
      action = { label: "Issue bonds", disabled: !issuer, run: () => go("Issuing", (g) => g.issue(issuer, nums.issue)) };
      break;
    case "tokenize":
      body = (
        <>
          {choose("client", kunden, "Client")}
          <Field label="Tokenize" className="w-40">
            <Num value={nums.tokenize} onChange={(v) => setNums({ ...nums, tokenize: v })} suffix="€" step={1000} />
          </Field>
        </>
      );
      action = { label: "Mint S-EUR", disabled: !anyClient, run: () => go("Tokenizing", (g) => g.tokenize(anyClient, Math.round(nums.tokenize * 100))) };
      break;
    case "dvp":
      body = (
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          {choose("issuer", issuers, "Seller (delivers bonds)")}
          {choose("investor", investors, "Buyer (pays cash)")}
          <Field label="Bonds">
            <Num value={nums.units} onChange={(v) => setNums({ ...nums, units: v })} suffix="pcs" />
          </Field>
          <Field label="Price">
            <Num value={nums.price} onChange={(v) => setNums({ ...nums, price: v })} suffix="€" step={1000} />
          </Field>
        </div>
      );
      action = {
        label: "Settle DvP",
        disabled: !issuer || !investor,
        run: () => go("Settling DvP", (g) => g.dvp(issuer, investor, nums.units, Math.round(nums.price * 100))),
      };
      extra = (
        <Button disabled={blocked || !issuer || !investor} onClick={() => s.run("Testing a failing trade", step, (g) => g.dvpFailing(issuer, investor, nums.units), false)}>
          <FlaskConical className="size-3.5" /> Test: buyer can&apos;t pay
        </Button>
      );
      break;
    case "coupon":
      body = choose("issuer", issuers, "Issuer (pays the coupon to all holders)");
      action = {
        label: `Pay ${BOND.couponBps / 100}% coupon`,
        disabled: !issuer,
        run: () => go("Paying the coupon", (g) => g.coupon(issuer, kunden.map((k) => k.kundennr))),
      };
      break;
    case "redeem":
      body = (
        <>
          <Field label="Client" className="flex-1">
            <select className={inputCls} value={redeemClient} onChange={(e) => setPick({ ...pick, redeem: e.target.value })} disabled={!kunden.length}>
              {!kunden.length && <option>Complete step 1 first</option>}
              {kunden.map((k) => (
                <option key={k.kundennr} value={k.kundennr}>
                  {k.name} (holds {fmtEur(s.balances[k.kundennr]?.cash ?? 0)} S-EUR)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Redeem" className="w-40">
            <Num value={nums.redeem || redeemDefault / 100} onChange={(v) => setNums({ ...nums, redeem: v })} suffix="€" step={100} />
          </Field>
        </>
      );
      action = {
        label: "Burn & pay out",
        disabled: !redeemClient,
        run: () => go("Redeeming", (g) => g.redeem(redeemClient, Math.round((nums.redeem || redeemDefault / 100) * 100))),
      };
      break;
    case "reconcile":
      body = <p className="flex-1 self-center text-sm text-slate-600">No input needed. The gateway compares cash and securities in both ledgers.</p>;
      action = { label: "Run reconciliation", run: () => go("Reconciling", (g) => g.reconcile()) };
      break;
    default:
      return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Try it</div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        {body}
        <Button variant="primary" onClick={action.run} disabled={blocked || action.disabled} className="shrink-0">
          <Play className="size-3.5" /> {s.busy ?? action.label}
        </Button>
      </div>
      {extra && <div className="mt-2 flex justify-end">{extra}</div>}
    </div>
  );
}
