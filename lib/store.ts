"use client";

import { create } from "zustand";
import { OsplusSimulator } from "./osplus/simulator";
import { SimulatedOpStack } from "./chain/simulated";
import { LiveChainClient } from "./chain/live-client";
import type { ChainStatus, L2BlockInfo } from "./chain/types";
import { Gateway } from "./gateway/gateway";
import type { StepId, TraceEvent } from "./types";
import { CHAPTERS, INVESTOR, ISSUER, TRADE, type ChapterId } from "./explain";
import { BOND } from "./bond";

export type Mode = "simulated" | "live";

/** True in the static export for GitHub Pages: no server, so Simulation mode only. */
export const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "true";
export type StepState = "todo" | "active" | "done";

export interface LiveConfig {
  available: boolean;
  l1Name: string;
  l2Name: string;
  l1Explorer?: string;
  l2Explorer?: string;
  requiresAccessToken: boolean;
}

interface Engine {
  osplus: OsplusSimulator;
  sim?: SimulatedOpStack;
  gateway: Gateway;
}

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

let engine: Engine | undefined;
let eventSeq = 0;
let clock: ReturnType<typeof setInterval> | undefined;
let lastTick = 0;
let lastPoll = 0;
let polling = false;
let liveBlocks: L2BlockInfo[] = [];

interface DemoState {
  mode: Mode;
  rev: number; // bumps when engine state mutates
  wallNow: number; // wall clock sampled by the UI clock (keeps render pure)
  events: TraceEvent[];
  status?: ChainStatus;
  speed: number;
  paused: boolean;
  busy?: string;
  error?: string;
  flags: Partial<Record<StepId, boolean>>;
  autoplay: boolean;
  liveConfig?: LiveConfig;
  accessToken?: string;
  bootstrapped: boolean;
  /** Step shown in the walkthrough. */
  selected: StepId;
  select: (s: StepId) => void;
  view: "exec" | "tech";
  setView: (v: "exec" | "tech") => void;
  /** On-chain positions per client (kundennr -> S-EUR cents and bonds), refreshed after each action. */
  balances: Record<string, { cash: number; bond: number }>;
  refreshBalances: () => Promise<void>;
  runChapter: (id: ChapterId) => Promise<void>;

  engine: () => Engine;
  start: () => void;
  stop: () => void;
  setMode: (m: Mode) => Promise<void>;
  setSpeed: (s: number) => void;
  togglePause: () => void;
  setAccessToken: (t: string) => void;
  reset: () => void;
  /** Run a gateway action. `completesStep: false` for side actions (e.g. the failing-trade test). */
  run: (label: string, step: StepId, fn: (g: Gateway) => Promise<unknown>, completesStep?: boolean) => Promise<boolean>;
  stepStates: () => Record<StepId, StepState>;
  runLifecycle: () => Promise<void>;
  clearError: () => void;
}

function makeEngine(mode: Mode, get: () => DemoState, set: (p: Partial<DemoState>) => void): Engine {
  const osplus = new OsplusSimulator();
  const emit = (e: Omit<TraceEvent, "id" | "ts">) => {
    const ev = { ...e, id: ++eventSeq, ts: Date.now() };
    set({ events: [ev, ...get().events].slice(0, 500), rev: get().rev + 1 });
  };
  if (mode === "simulated") {
    const sim = new SimulatedOpStack();
    return { osplus, sim, gateway: new Gateway(osplus, sim, emit) };
  }
  // Each run deploys its own contracts on the first action; the client keeps them for this engine.
  const client = new LiveChainClient(() => get().accessToken);
  const gateway = new Gateway(osplus, client, emit);
  const cfg = get().liveConfig;
  gateway.explorers = { l1: cfg?.l1Explorer, l2: cfg?.l2Explorer };
  return { osplus, gateway };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The executive storyline as gateway calls. Each chapter is idempotent where it matters
 * (e.g. onboarding skips clients that already exist). Returns false if a step failed.
 */
async function story(run: DemoState["run"], chapter: ChapterId): Promise<boolean> {
  const g = () => engine!.gateway;
  const client = (rolle: "Emittent" | "Investor") => g().osplus.state.kunden.find((k) => k.rolle === rolle)?.kundennr;
  const issuer = () => client("Emittent")!;
  const investor = () => client("Investor")!;
  switch (chapter) {
    case "onboard":
      if (!client("Emittent") && !(await run(`Onboarding ${ISSUER.name}`, "onboard", (gw) => gw.onboard(ISSUER.name, ISSUER.institutId, "Emittent", ISSUER.balance))))
        return false;
      if (!client("Investor") && !(await run(`Onboarding ${INVESTOR.name}`, "onboard", (gw) => gw.onboard(INVESTOR.name, INVESTOR.institutId, "Investor", INVESTOR.balance))))
        return false;
      return true;
    case "issue":
      return run(`Issuing ${BOND.issueUnits} bonds`, "issue", (gw) => gw.issue(issuer(), BOND.issueUnits));
    case "cash":
      return run("Tokenizing €100,000", "tokenize", (gw) => gw.tokenize(investor(), TRADE.priceCents));
    case "dvp":
      return run("Settling DvP", "dvp", (gw) => gw.dvp(issuer(), investor(), TRADE.units, TRADE.priceCents));
    case "final":
      return true;
    case "coupon":
      return run("Paying the coupon", "coupon", (gw) => gw.coupon(issuer(), [investor()]));
    case "close": {
      const ok = await run("Redeeming the proceeds", "redeem", async (gw) => gw.redeem(issuer(), await gw.chain.cashBalance(gw.wallets.get(issuer())!)));
      return ok && run("Reconciling", "reconcile", (gw) => gw.reconcile());
    }
  }
}

export const useDemo = create<DemoState>((set, get) => ({
  mode: "simulated",
  rev: 0,
  wallNow: 0,
  events: [],
  speed: 1,
  paused: false,
  flags: {},
  autoplay: false,
  bootstrapped: false,
  selected: "onboard",
  select: (selected) => set({ selected }),
  view: "exec",
  setView: (view) => {
    ls.set("view", view);
    set({ view });
  },
  balances: {},
  refreshBalances: async () => {
    const e = get().engine();
    if (!e.gateway.contracts) return;
    const out: DemoState["balances"] = {};
    for (const [kundennr, w] of e.gateway.wallets) {
      const [cash, bond] = await Promise.all([e.gateway.chain.cashBalance(w), e.gateway.chain.bondBalance(w)]);
      out[kundennr] = { cash, bond };
    }
    if (engine === e) set({ balances: out });
  },
  runChapter: async (id) => {
    const { run } = get();
    const next = (c: ChapterId) => {
      const i = CHAPTERS.findIndex((x) => x.id === c);
      if (CHAPTERS[i + 1]) set({ selected: CHAPTERS[i + 1].steps[0] });
    };
    if (await story(run, id)) next(id);
  },

  engine: () => {
    engine ??= makeEngine(get().mode, get, set);
    return engine;
  },

  start: () => {
    if (clock) return;
    set({ accessToken: ls.get("live.accessToken"), view: ls.get("view") === "tech" ? "tech" : "exec" });
    // The static GitHub Pages build has no server, so there is no /api/chain to ask.
    if (!STATIC_DEMO)
      fetch("/api/chain")
        .then((r) => r.json())
        .then((c: LiveConfig) => {
          set({ liveConfig: c });
          // Default to the live chain when the server is configured for it and nothing has happened yet.
          if (c.available && get().mode === "simulated" && !get().events.length) get().setMode("live");
        })
        .catch(() => set({ liveConfig: undefined }));
    lastTick = performance.now();
    clock = setInterval(async () => {
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      const { mode, paused, speed } = get();
      const e = get().engine();
      if (mode === "simulated" && !paused) e.sim!.advance(dt * speed);
      if (Date.now() - (get().events[0]?.ts ?? 0) < 2500) set({ wallNow: Date.now() });
      const pollEvery = mode === "simulated" ? 250 : 4000;
      if (polling || now - lastPoll < pollEvery || (mode === "live" && !get().liveConfig?.available)) return;
      polling = true;
      lastPoll = now;
      try {
        const st = await e.gateway.chain.status();
        if (engine !== e) return; // reset while polling
        if (st.kind === "live") {
          // Public RPCs are load-balanced; a lagging backend can report older heads. Never go backwards.
          const prev = get().status;
          if (prev?.kind === "live") {
            for (const k of ["unsafe", "safe", "finalized"] as const) st.l2[k] = Math.max(st.l2[k], prev.l2[k]);
            for (const k of ["head", "safe", "finalized"] as const) st.l1[k] = Math.max(st.l1[k], prev.l1[k]);
          }
          const head = st.l2Blocks[0];
          if (head && liveBlocks[0]?.number !== head.number) liveBlocks = [head, ...liveBlocks].slice(0, 24);
          st.l2Blocks = liveBlocks;
        }
        e.gateway.observe(st);
        set({ status: st, rev: get().rev + 1, wallNow: Date.now() });
      } catch (err) {
        if (mode === "live") set({ error: `Chain status: ${(err as Error).message}` });
      } finally {
        polling = false;
      }
    }, 250);
  },

  stop: () => {
    if (clock) clearInterval(clock);
    clock = undefined;
  },

  setMode: async (mode) => {
    if (mode === get().mode) return;
    set({ mode });
    get().reset();
  },

  setSpeed: (speed) => set({ speed }),
  togglePause: () => set({ paused: !get().paused }),
  setAccessToken: (t) => {
    ls.set("live.accessToken", t);
    set({ accessToken: t });
  },
  clearError: () => set({ error: undefined }),

  reset: () => {
    engine = undefined;
    liveBlocks = [];
    set({ events: [], status: undefined, flags: {}, error: undefined, busy: undefined, bootstrapped: false, autoplay: false, selected: "onboard", balances: {}, rev: get().rev + 1 });
    get().engine();
  },

  run: async (label, step, fn, completesStep = true) => {
    if (get().busy) return false;
    set({ busy: label, error: undefined });
    try {
      const g = get().engine().gateway;
      if (!get().bootstrapped) {
        await g.bootstrap();
        set({ bootstrapped: true });
      }
      await fn(g);
      if (completesStep) set({ flags: { ...get().flags, [step]: true } });
      await get().refreshBalances().catch(() => undefined);
      return true;
    } catch (e) {
      set({ error: (e as Error).message, autoplay: false });
      return false;
    } finally {
      set({ busy: undefined, rev: get().rev + 1 });
    }
  },

  stepStates: () => {
    const { flags, busy } = get();
    const g = get().engine().gateway;
    const t = g.tracked;
    const done: Record<StepId, boolean> = {
      onboard: g.wallets.size >= 2,
      issue: !!flags.issue,
      tokenize: !!flags.tokenize,
      dvp: !!flags.dvp,
      batch: t.some((x) => x.stage !== "unsafe"),
      finality: t.some((x) => x.stage === "finalized"),
      proposal: t.some((x) => x.resolved),
      coupon: !!flags.coupon,
      redeem: !!flags.redeem,
      reconcile: !!g.lastRecon?.ok,
    };
    const active: Partial<Record<StepId, boolean>> = {
      onboard: busy?.startsWith("Onboarding") || g.wallets.size === 1,
      batch: t.some((x) => x.stage === "unsafe"),
      finality: t.some((x) => x.stage === "safe"),
      proposal: t.some((x) => x.proposalIndex !== undefined && !x.resolved),
    };
    const out = {} as Record<StepId, StepState>;
    for (const k of Object.keys(done) as StepId[]) out[k] = done[k] ? "done" : active[k] ? "active" : "todo";
    return out;
  },

  runLifecycle: async () => {
    if (get().autoplay || get().busy) return;
    set({ autoplay: true });
    const run: DemoState["run"] = (label, step, fn) => {
      set({ selected: step });
      return get().run(label, step, fn);
    };
    const g = () => get().engine().gateway;
    const waitFor = async (cond: () => boolean, timeoutMs: number) => {
      const t0 = Date.now();
      while (get().autoplay && !cond() && Date.now() - t0 < timeoutMs) await sleep(300);
      return cond();
    };
    const pause = () => sleep(get().mode === "simulated" ? 900 / get().speed : 300);
    try {
      for (const c of ["onboard", "issue", "cash", "dvp"] as const) {
        if (!(await story(run, c))) return;
        await pause();
      }
      // Wait only until the trade is anchored on RL1, which is final on a Regulated Layer One. The
      // state proof (3.5-day challenge window) completes in the background and never blocks the story.
      set({ selected: "batch" });
      await waitFor(() => g().tracked.every((t) => t.stage !== "unsafe"), get().mode === "simulated" ? 60_000 : 10 * 60_000);
      await pause();
      if (!get().autoplay) return;
      if (!(await story(run, "coupon"))) return;
      await pause();
      await story(run, "close");
    } finally {
      set({ autoplay: false });
    }
  },
}));
