import type { Hex } from "../types";

export interface TxReceipt {
  hash: Hex;
  l2Block: number;
  /** L2 block timestamp (ms) - needed because newer dispute games commit to a timestamp. */
  l2Timestamp: number;
  gasUsed: number;
  /** L1 data fee the sequencer charged for posting this tx to RL1 (OP Stack receipt field). */
  l1FeeWei?: string;
  /** Only "reverted" when the caller explicitly allowed a revert (e.g. the failing-trade demo). */
  status?: "success" | "reverted";
}

export interface BatchInfo {
  l1TxHash: Hex;
  l1Block: number;
  l2From?: number;
  l2To?: number;
  blobs: number;
  bytes?: number;
  finalized: boolean;
  ts: number;
}

export type GameStatus = "IN_PROGRESS" | "CHALLENGER_WINS" | "DEFENDER_WINS";

export interface ProposalInfo {
  index: number;
  gameType: number;
  gameAddress: Hex;
  /** Classic games commit to an L2 block number ... */
  l2Block?: number;
  /** ... newer (super-root) games commit to an L2 timestamp (ms). */
  l2Timestamp?: number;
  rootClaim: Hex;
  /** RL1 transaction that created the game (DisputeGameFactory.create), when found. */
  txHash?: Hex;
  createdAt: number; // ms
  challengeEndsAt?: number; // ms, when known
  status: GameStatus;
}

export interface L2BlockInfo {
  number: number;
  hash: Hex;
  ts: number;
  txCount: number;
  l1Origin?: number;
}

/** The three contracts of one demo run. */
export interface Contracts {
  cash: Hex; // TokenizedDeposit (S-EUR)
  bond: Hex; // BondToken (eWpG crypto securities register)
  dvp: Hex; // DvPSettlement
}

export interface ChainStatus {
  kind: "simulated" | "live";
  /** The chain's notion of "now" (ms). Simulation time can run faster than the wall clock. */
  now: number;
  l1: { name: string; chainId: number; head: number; safe: number; finalized: number; explorer?: string };
  l2: { name: string; chainId: number; unsafe: number; safe: number; finalized: number; explorer?: string };
  cash?: { address: Hex; totalSupply: number };
  bond?: { address: Hex; totalSupply: number };
  gateway?: { address: Hex; balanceEth: string };
  batches: BatchInfo[];
  proposals: ProposalInfo[];
  l2Blocks: L2BlockInfo[];
  notes?: string[];
}

/**
 * The seam between the abstraction layer and the ledger. The gateway only ever
 * talks to this interface, so the same lifecycle runs against the in-browser
 * simulation or a live OP Stack chain.
 */
export interface ChainAdapter {
  kind: "simulated" | "live";
  /** Deploy the run's contracts: cash token, bond register, DvP contract (+ wiring). */
  init(): Promise<{ contracts: Contracts; txs: { label: string; hash: Hex; address?: Hex }[] }>;
  provisionWallet(id: string): Promise<Hex>;
  /** Allowlist a verified client on the bond register and the cash token. */
  onboard(account: Hex, ref: string): Promise<TxReceipt>;
  issueBond(issuer: Hex, units: number, ref: string): Promise<TxReceipt>;
  mintCash(to: Hex, cents: number, ref: string): Promise<TxReceipt>;
  burnCash(from: Hex, cents: number, ref: string): Promise<TxReceipt>;
  /** Atomic DvP. With allowRevert a failing trade resolves with status "reverted" instead of throwing. */
  settleDvP(tradeId: string, seller: Hex, buyer: Hex, units: number, priceCents: number, allowRevert?: boolean): Promise<TxReceipt>;
  payCoupon(holders: Hex[], ref: string): Promise<TxReceipt>;
  cashBalance(account: Hex): Promise<number>;
  bondBalance(account: Hex): Promise<number>;
  status(): Promise<ChainStatus>;
}
