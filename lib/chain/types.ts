import type { Hex } from "../types";

export interface TxReceipt {
  hash: Hex;
  l2Block: number;
  /** L2 block timestamp (ms) - needed because newer dispute games commit to a timestamp. */
  l2Timestamp: number;
  gasUsed: number;
  /** L1 data fee the sequencer charged for posting this tx to L1 (OP Stack receipt field). */
  l1FeeWei?: string;
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
  /** L1 transaction that created the game (DisputeGameFactory.create), when found. */
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

export interface ChainStatus {
  kind: "simulated" | "live";
  /** The chain's notion of "now" (ms). Simulation time can run faster than the wall clock. */
  now: number;
  l1: { name: string; chainId: number; head: number; safe: number; finalized: number; explorer?: string };
  l2: { name: string; chainId: number; unsafe: number; safe: number; finalized: number; explorer?: string };
  token?: { address: Hex; totalSupply: number };
  gateway?: { address: Hex; balanceEth: string };
  batches: BatchInfo[];
  proposals: ProposalInfo[];
  l2Blocks: L2BlockInfo[];
  notes?: string[];
}

/**
 * The seam between the abstraction layer and the ledger. The gateway only ever
 * talks to this interface, so the same lifecycle runs against the in-browser
 * simulation, a local OP Stack devnet, OP Sepolia, or a production chain.
 */
export interface ChainAdapter {
  kind: "simulated" | "live";
  init(): Promise<{ tokenAddress: Hex; deployed: boolean; txHash?: Hex }>;
  provisionWallet(iban: string): Promise<Hex>;
  setAllowed(account: Hex, ref: string): Promise<TxReceipt>;
  mint(to: Hex, cents: number, ref: string): Promise<TxReceipt>;
  burn(from: Hex, cents: number, ref: string): Promise<TxReceipt>;
  transfer(from: Hex, to: Hex, cents: number, ref: string): Promise<TxReceipt>;
  balanceOf(account: Hex): Promise<number>;
  status(): Promise<ChainStatus>;
}
