/**
 * In-browser simulation of an OP Stack rollup and its L1, used when no live chain
 * is configured (e.g. the default Vercel deployment).
 *
 * It models the pieces that matter for the settlement lifecycle:
 *  - sequencer (op-geth + op-node): orders txs into L2 blocks -> "unsafe" head
 *  - batcher (op-batcher): posts compressed L2 batches to L1 as blobs; once the
 *    L1 block containing a batch exists, the L2 blocks in it become "safe"
 *  - RL1 finality: RL1 is a Regulated Layer One with BFT consensus, so the block that includes
 *    a batch is final immediately -> L2 "safe" and "finalized" advance together
 *  - proposer (op-proposer): creates a dispute game with an output root on L1
 *  - challenge window: the game resolves DEFENDER_WINS if nobody challenges
 *
 * Timings are compressed (see SIM_PARAMS) so the whole lifecycle fits in a demo.
 */
import type { Hex } from "../types";
import { randomHex } from "../format";
import { COUPON_PER_UNIT } from "../bond";
import { deriveCustodyAccount } from "./custody";
import type {
  Contracts,
  BatchInfo,
  ChainAdapter,
  ChainStatus,
  L2BlockInfo,
  ProposalInfo,
  TxReceipt,
} from "./types";

export const SIM_PARAMS = {
  l2BlockMs: 1_000, // real OP Stack: 2s
  l1BlockMs: 3_000, // real RL1 (Sepolia): 12s
  batchEveryL1Blocks: 2, // real: batcher max-channel-duration, typically minutes
  l1FinalityDepth: 0, // RL1 (BFT consensus): final at inclusion. The Sepolia stand-in needs ~64 blocks.
  proposalIntervalMs: 10_000, // real: typically ~1h
  challengeWindowMs: 45_000, // real: 3.5 days
};

const CUSTODY_SEED = "sparkassen-demo-hsm";
const GATEWAY: Hex = "0x5a4e7aa7e6a7e2a1c0de5ba4cca55e0000000001";

type TxKind = "onboard" | "issue" | "mint" | "burn" | "dvp" | "coupon";

interface PendingTx {
  hash: Hex;
  kind: TxKind;
  apply: () => void; // throws -> revert (all effects of the tx are rolled back)
  allowRevert?: boolean;
  resolve: (r: TxReceipt) => void;
  reject: (e: Error) => void;
}

interface SimL1Block {
  number: number;
  ts: number;
}

const GAS: Record<TxKind, number> = { onboard: 76_000, issue: 74_000, mint: 71_000, burn: 38_000, dvp: 96_000, coupon: 64_000 };

export class SimulatedOpStack implements ChainAdapter {
  kind = "simulated" as const;
  now = Date.now();

  private l1Blocks: SimL1Block[] = [{ number: 7_300_000, ts: this.now }];
  private l2Blocks: L2BlockInfo[] = [{ number: 1_000, hash: randomHex(32), ts: this.now, txCount: 0 }];
  private l2Safe = 1_000;
  private l2Finalized = 1_000;
  private lastBatchedL2 = 1_000;
  private pendingBatch?: { l2From: number; l2To: number; txs: number };
  private batches: BatchInfo[] = [];
  private proposals: ProposalInfo[] = [];
  private lastProposalAt = this.now;
  private lastL1At = this.now;
  private lastL2At = this.now;
  private mempool: PendingTx[] = [];

  private contracts?: Contracts;
  private cash = new Map<Hex, number>();
  private bond = new Map<Hex, number>();
  private allowed = new Set<Hex>();
  private cashSupply = 0;
  private bondSupply = 0;
  private issuer?: Hex;
  private settledTrades = new Set<string>();

  /** Advance simulated time. Called by the UI clock; `dtMs` already includes the speed factor. */
  advance(dtMs: number) {
    const target = this.now + dtMs;
    while (true) {
      const nextL2 = this.lastL2At + SIM_PARAMS.l2BlockMs;
      const nextL1 = this.lastL1At + SIM_PARAMS.l1BlockMs;
      const next = Math.min(nextL2, nextL1);
      if (next > target) break;
      this.now = next;
      if (next === nextL2) this.produceL2Block();
      else this.produceL1Block();
    }
    this.now = target;
    this.runProposer();
  }

  private l1Head() {
    return this.l1Blocks[this.l1Blocks.length - 1];
  }
  private l2Head() {
    return this.l2Blocks[this.l2Blocks.length - 1];
  }

  private produceL2Block() {
    this.lastL2At = this.now;
    const number = this.l2Head().number + 1;
    const txs = this.mempool.splice(0);
    let included = 0;
    for (const tx of txs) {
      const receipt = {
        hash: tx.hash,
        l2Block: number,
        l2Timestamp: this.now,
        gasUsed: GAS[tx.kind],
        l1FeeWei: String(Math.round(1.8e10 + Math.random() * 6e9)),
      };
      // Snapshot so a revert undoes every effect of the tx, like the EVM does.
      const snap = [new Map(this.cash), new Map(this.bond), this.cashSupply, this.bondSupply, this.issuer, new Set(this.settledTrades)] as const;
      try {
        tx.apply();
        included++;
        tx.resolve({ ...receipt, status: "success" });
      } catch (e) {
        [this.cash, this.bond, this.cashSupply, this.bondSupply, this.issuer, this.settledTrades] = [
          snap[0], snap[1], snap[2], snap[3], snap[4], snap[5],
        ];
        if (tx.allowRevert) {
          included++;
          tx.resolve({ ...receipt, gasUsed: Math.round(GAS[tx.kind] * 0.6), status: "reverted" });
        } else tx.reject(e as Error);
      }
    }
    this.l2Blocks.push({ number, hash: randomHex(32), ts: this.now, txCount: included + 1, l1Origin: this.l1Head().number });
    if (this.l2Blocks.length > 60) this.l2Blocks.shift();
  }

  private produceL1Block() {
    this.lastL1At = this.now;
    const number = this.l1Head().number + 1;
    this.l1Blocks.push({ number, ts: this.now });
    if (this.l1Blocks.length > 60) this.l1Blocks.shift();

    // 1) a batch submitted in the previous slot lands in this block -> L2 safe head advances
    if (this.pendingBatch) {
      const b = this.pendingBatch;
      this.batches.unshift({
        l1TxHash: randomHex(32),
        l1Block: number,
        l2From: b.l2From,
        l2To: b.l2To,
        blobs: 1,
        bytes: 420 + b.txs * 190 + Math.floor(Math.random() * 120),
        finalized: false,
        ts: this.now,
      });
      if (this.batches.length > 30) this.batches.pop();
      this.l2Safe = b.l2To;
      this.pendingBatch = undefined;
    }

    // 2) L1 finality: batches deep enough become final -> L2 finalized head advances
    const l1Finalized = number - SIM_PARAMS.l1FinalityDepth;
    for (const b of this.batches) {
      if (!b.finalized && b.l1Block <= l1Finalized) {
        b.finalized = true;
        this.l2Finalized = Math.max(this.l2Finalized, b.l2To ?? 0);
      }
    }

    // 3) batcher: every N L1 blocks, submit everything not yet batched
    const head = this.l2Head().number;
    if (number % SIM_PARAMS.batchEveryL1Blocks === 0 && head > this.lastBatchedL2) {
      const from = this.lastBatchedL2 + 1;
      const txs = this.l2Blocks.filter((b) => b.number >= from).reduce((a, b) => a + b.txCount, 0);
      this.pendingBatch = { l2From: from, l2To: head, txs };
      this.lastBatchedL2 = head;
    }
  }

  private runProposer() {
    for (const p of this.proposals) {
      if (p.status === "IN_PROGRESS" && p.challengeEndsAt && this.now >= p.challengeEndsAt) p.status = "DEFENDER_WINS";
    }
    if (this.now - this.lastProposalAt < SIM_PARAMS.proposalIntervalMs) return;
    this.lastProposalAt = this.now;
    const lastProposed = this.proposals[0]?.l2Block ?? 1_000;
    if (this.l2Finalized <= lastProposed) return;
    this.proposals.unshift({
      index: (this.proposals[0]?.index ?? -1) + 1,
      gameType: 1,
      gameAddress: randomHex(20),
      l2Block: this.l2Finalized,
      rootClaim: randomHex(32),
      createdAt: this.now,
      challengeEndsAt: this.now + SIM_PARAMS.challengeWindowMs,
      status: "IN_PROGRESS",
    });
    if (this.proposals.length > 12) this.proposals.pop();
  }

  private submit(kind: TxKind, apply: () => void, allowRevert = false): Promise<TxReceipt> {
    return new Promise((resolve, reject) => {
      this.mempool.push({ hash: randomHex(32), kind, apply, allowRevert, resolve, reject });
    });
  }

  private need(cond: boolean, err: string) {
    if (!cond) throw new Error(`revert ${err}`);
  }

  private move(ledger: Map<Hex, number>, from: Hex, to: Hex, v: number) {
    this.need(this.allowed.has(from), `NotAllowed(${from})`);
    this.need(this.allowed.has(to), `NotAllowed(${to})`);
    this.need((ledger.get(from) ?? 0) >= v, "InsufficientBalance()");
    ledger.set(from, (ledger.get(from) ?? 0) - v);
    ledger.set(to, (ledger.get(to) ?? 0) + v);
  }

  // ------------------------------------------------------------- adapter

  async init() {
    this.contracts = { cash: randomHex(20), bond: randomHex(20), dvp: randomHex(20) };
    const c = this.contracts;
    return {
      contracts: c,
      txs: [
        { label: "Deploy the S-EUR cash token", hash: randomHex(32), address: c.cash },
        { label: "Deploy the bond register (BondToken)", hash: randomHex(32), address: c.bond },
        { label: "Deploy the DvP settlement contract", hash: randomHex(32), address: c.dvp },
        { label: "Authorise DvP contract on the cash token", hash: randomHex(32) },
        { label: "Authorise DvP contract on the bond register", hash: randomHex(32) },
      ],
    };
  }

  async provisionWallet(id: string) {
    return deriveCustodyAccount(CUSTODY_SEED, id).address as Hex;
  }

  onboard(account: Hex) {
    return this.submit("onboard", () => {
      this.allowed.add(account);
    });
  }

  issueBond(issuer: Hex, units: number) {
    return this.submit("issue", () => {
      this.need(!this.issuer || this.issuer === issuer, "IssuerMismatch()");
      this.need(this.allowed.has(issuer), `NotAllowed(${issuer})`);
      this.issuer = issuer;
      this.bond.set(issuer, (this.bond.get(issuer) ?? 0) + units);
      this.bondSupply += units;
    });
  }

  mintCash(to: Hex, cents: number) {
    return this.submit("mint", () => {
      this.need(this.allowed.has(to), `NotAllowed(${to})`);
      this.cash.set(to, (this.cash.get(to) ?? 0) + cents);
      this.cashSupply += cents;
    });
  }

  burnCash(from: Hex, cents: number) {
    return this.submit("burn", () => {
      this.need((this.cash.get(from) ?? 0) >= cents, "InsufficientBalance()");
      this.cash.set(from, (this.cash.get(from) ?? 0) - cents);
      this.cashSupply -= cents;
    });
  }

  settleDvP(tradeId: string, seller: Hex, buyer: Hex, units: number, priceCents: number, allowRevert = false) {
    return this.submit(
      "dvp",
      () => {
        this.need(!this.settledTrades.has(tradeId), "AlreadySettled()");
        this.settledTrades.add(tradeId);
        this.move(this.bond, seller, buyer, units); // delivery
        this.move(this.cash, buyer, seller, priceCents); // payment
      },
      allowRevert,
    );
  }

  payCoupon(holders: Hex[]) {
    return this.submit("coupon", () => {
      const issuer = this.issuer;
      this.need(!!issuer, "NoIssuer()");
      for (const h of holders) {
        const units = this.bond.get(h) ?? 0;
        if (!units || h === issuer) continue;
        this.move(this.cash, issuer!, h, units * COUPON_PER_UNIT);
      }
    });
  }

  async cashBalance(account: Hex) {
    return this.cash.get(account) ?? 0;
  }

  async bondBalance(account: Hex) {
    return this.bond.get(account) ?? 0;
  }

  async status(): Promise<ChainStatus> {
    const l1Head = this.l1Head().number;
    return {
      kind: "simulated",
      now: this.now,
      l1: {
        name: "RL1 (simulated)",
        chainId: 11155111,
        head: l1Head,
        safe: l1Head,
        finalized: l1Head - SIM_PARAMS.l1FinalityDepth,
      },
      l2: {
        name: "Simulated OP Stack L2",
        chainId: 4_206_942,
        unsafe: this.l2Head().number,
        safe: this.l2Safe,
        finalized: this.l2Finalized,
      },
      cash: this.contracts ? { address: this.contracts.cash, totalSupply: this.cashSupply } : undefined,
      bond: this.contracts ? { address: this.contracts.bond, totalSupply: this.bondSupply } : undefined,
      gateway: { address: GATEWAY, balanceEth: "10.0" },
      batches: this.batches.map((b) => ({ ...b })),
      proposals: this.proposals.map((p) => ({ ...p })),
      l2Blocks: this.l2Blocks.slice(-24).reverse(),
    };
  }
}
