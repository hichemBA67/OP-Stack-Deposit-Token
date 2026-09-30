export type Hex = `0x${string}`;

/** The five columns of the architecture, left to right. */
export type Layer = "customer" | "osplus" | "gateway" | "l2" | "l1";

export const LAYERS: Layer[] = ["customer", "osplus", "gateway", "l2", "l1"];

/** Sub-components that light up in the architecture diagram. */
export type Component =
  | "channel"
  | "kyc"
  | "giro"
  | "hold"
  | "omnibus"
  | "journal"
  | "api"
  | "compliance"
  | "custody"
  | "orchestrator"
  | "recon"
  | "sequencer"
  | "token"
  | "batcher"
  | "proposer"
  | "batchInbox"
  | "disputeGame"
  | "portal";

export type Level = "info" | "success" | "warn" | "error";

export interface TraceEvent {
  id: number;
  ts: number;
  step?: StepId;
  from: Layer;
  to: Layer;
  components: Component[];
  title: string;
  /** Plain-language explanation of what this message means. */
  explain?: string;
  protocol?: string;
  endpoint?: string;
  payload?: unknown;
  level: Level;
  link?: { label: string; url: string };
}

export type StepId =
  | "onboard"
  | "fund"
  | "tokenize"
  | "transfer"
  | "batch"
  | "finality"
  | "proposal"
  | "redeem"
  | "reconcile";

export type SettlementStage = "unsafe" | "safe" | "finalized";
