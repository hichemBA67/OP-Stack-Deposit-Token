/**
 * All plain-language explanations shown in the guided walkthrough live here, so
 * the wording can be reviewed and edited in one place.
 */
import type { Component, Layer, StepId } from "./types";

export interface StepExplain {
  id: StepId;
  title: string;
  kind: "action" | "wait";
  /** One sentence: what happens in this step. */
  summary: string;
  /** A short paragraph for non-technical readers. */
  story: string;
  /** What each system does in this step. */
  who: Partial<Record<Layer, string>>;
  /** Why a Sparkasse cares about this step. */
  why: string;
  /** How long it takes in the simulation and on OP Sepolia / Sepolia (RL1). */
  timing: { simulated: string; live: string };
}

export const STEPS: StepExplain[] = [
  {
    id: "onboard",
    title: "Open an account & verify the customer",
    kind: "action",
    summary: "A new customer opens a Girokonto; the bank gives them a blockchain wallet and puts it on the list of approved wallets.",
    story:
      "Nothing changes for the customer: they open a normal account at their Sparkasse and are identified (KYC) as usual. " +
      "Behind the scenes the gateway creates a wallet for them. The bank holds the key for that wallet, just like it holds the customer's account. " +
      "Then the gateway adds the wallet to an allowlist on the token contract, so only verified customers can ever hold the bank's digital euros.",
    who: {
      customer: "Opens a Girokonto in the app or branch and is identified (Legitimation / KYC).",
      osplus: "Creates the customer and the IBAN account, then publishes a 'customer created' event.",
      gateway: "Checks KYC and sanctions, derives a wallet from the IBAN (key kept in the bank's HSM), and sends the allowlist transaction.",
      l2: "The S-EUR contract records the wallet as 'allowed'. On the first run the gateway also deploys this contract.",
    },
    why: "The ledger is permissioned: a wallet that the bank has not verified cannot receive or send tokens. This is how AML/KYC rules carry over to the blockchain.",
    timing: { simulated: "about 1 second", live: "about 2–4 seconds (one OP Sepolia block)" },
  },
  {
    id: "fund",
    title: "Money arrives on the Girokonto",
    kind: "action",
    summary: "A normal SEPA transfer credits the customer's account. There's no blockchain involved yet.",
    story:
      "Before anything can be tokenized there must be real euros on the account. Here an employer's salary payment arrives via SEPA and is booked in OSPlus, " +
      "exactly as today. This step shows that the existing core banking system remains the source of truth for euros.",
    who: {
      customer: "Receives a SEPA credit transfer (e.g. salary).",
      osplus: "Books the credit in the Buchungsjournal (GV code 166 = SEPA credit). The balance goes up.",
    },
    why: "Tokenized deposits don't replace the core banking system. They sit on top of it, and every token will be backed by euros that OSPlus holds.",
    timing: { simulated: "instant", live: "instant (OSPlus is simulated in both modes)" },
  },
  {
    id: "tokenize",
    title: "Turn euros into digital euros (mint S-EUR)",
    kind: "action",
    summary: "Euros move from the customer's Girokonto to a special backing account, and the same amount of S-EUR tokens is created in the customer's wallet.",
    story:
      "The customer asks to convert, say, 2,500 € into S-EUR. The gateway runs this as a 'saga', a sequence of steps that is either completed in full or rolled back: " +
      "(1) OSPlus reserves the amount on the Girokonto (a Sperre), (2) the token contract creates (mints) 2,500 S-EUR in the customer's wallet, and " +
      "(3) OSPlus books the euros from the Girokonto to the Sammelkonto and lifts the reservation. If the mint fails, the reservation is released and no money moves.",
    who: {
      customer: "Requests the conversion in the app.",
      osplus: "Places a hold (Sperre), then books Girokonto → Sammelkonto 'Tokenisierte Einlagen'.",
      gateway: "Checks limits and AML rules, coordinates the three steps, and undoes the hold if anything fails.",
      l2: "The S-EUR contract mints the tokens. The OSPlus reference is stored in the transaction, so both ledgers can be matched later.",
    },
    why: "Every S-EUR is backed 1:1 by euros on the Sammelkonto. The ordering (reserve → mint → book) means the bank never creates tokens without the euros being secured first.",
    timing: { simulated: "about 1 second", live: "about 2–4 seconds" },
  },
  {
    id: "transfer",
    title: "Pay another customer on the blockchain",
    kind: "action",
    summary: "S-EUR moves from one wallet to another in seconds. If the customers bank with different Sparkassen, the two backing accounts are rebalanced.",
    story:
      "Anna pays Ben 1,000 S-EUR. The transfer settles on OP Sepolia in one block (about 2 seconds), 24/7. " +
      "Anna banks with Sparkasse Musterstadt and Ben with Sparkasse Beispielstadt, so the euros backing Ben's new tokens must also move: " +
      "the gateway books 1,000 € from Musterstadt's Sammelkonto to Beispielstadt's Sammelkonto in OSPlus.",
    who: {
      customer: "Anna sends a payment order in the app.",
      gateway: "Checks Anna's token balance and compliance, then signs the transfer with Anna's custodial key.",
      l2: "The S-EUR contract moves the tokens between the two allowlisted wallets.",
      osplus: "If the Sparkassen differ, it books the interbank rebalancing between the two Sammelkonten.",
    },
    why: "This is the core benefit: an instant, programmable payment that stays within the Sparkassen's regulated perimeter, with backing kept correct for each institute.",
    timing: { simulated: "about 1 second", live: "about 2–4 seconds" },
  },
  {
    id: "batch",
    title: "The L2 writes its data to RL1 (safe)",
    kind: "wait",
    summary: "The OP Stack 'batcher' bundles recent L2 blocks and publishes them on RL1 Sepolia. From then on the transactions are 'safe'.",
    story:
      "So far, our transactions are only confirmed by the sequencer, the single server that orders OP Sepolia transactions. That's fast, but it relies on one operator. " +
      "Every few minutes a component called op-batcher compresses the latest L2 blocks and publishes them on RL1 as a 'blob' (a cheap data attachment). " +
      "Once that happens, anyone can rebuild the L2 from RL1 data alone, and the transaction status changes from 'unsafe' to 'safe'.",
    who: {
      l2: "op-batcher compresses the L2 blocks and sends them to RL1 as a blob transaction.",
      l1: "The blob transaction to the BatchInbox address is included in an RL1 block.",
      gateway: "Sees the L2 'safe' head move past our transaction and marks it as safe.",
    },
    why: "The bank no longer depends on the sequencer's word: the payment data is anchored on RL1 and can be checked by any auditor or supervisor.",
    timing: { simulated: "about 5–10 seconds", live: "usually 1–5 minutes on OP Sepolia" },
  },
  {
    id: "finality",
    title: "RL1 finalizes (in the background)",
    kind: "wait",
    summary: "RL1's own consensus makes the block containing our batch irreversible. The L2 transaction is now final.",
    story:
      "An RL1 block can in theory still be reorganised shortly after it is created. After two 'epochs' (about 13 minutes) RL1's validators finalize it, " +
      "and reverting it would require destroying a huge amount of staked ETH. When the RL1 block holding our batch is finalized, the L2 transaction is final too.",
    who: {
      l1: "RL1 validators finalize the epoch that contains the batch.",
      l2: "The L2 'finalized' head moves past our transaction.",
      gateway: "Marks the transaction as finalized. This is the natural point to treat the booking as irrevocable ('endgültig gebucht').",
    },
    why: "This gives the bank a clear, objective settlement-finality moment, comparable to settlement finality in a payment system.",
    timing: { simulated: "about 20 seconds", live: "about 15–20 minutes (RL1 finality ≈ 13 min + batch delay)" },
  },
  {
    id: "proposal",
    title: "State proof on RL1 (in the background)",
    kind: "wait",
    summary: "A 'proposer' publishes a fingerprint of the entire L2 state on RL1. Anyone can challenge it for 3.5 days.",
    story:
      "Separately from the data, an op-proposer regularly publishes a cryptographic fingerprint (output root) of the whole L2 state on RL1, " +
      "inside a 'dispute game' contract. For 3.5 days anyone can prove that the fingerprint is wrong. If no one does, it's accepted, " +
      "and RL1 then 'knows' the L2 balances. This is only needed for moving assets from the L2 back to RL1. Payments between customers don't wait for it.",
    who: {
      l2: "op-proposer computes the output root and creates a dispute game on RL1 (on OP Sepolia every ~10–15 minutes).",
      l1: "The DisputeGameFactory stores the game. The challenge clock runs for 3.5 days, then the game resolves.",
      gateway: "Links each transaction to the first game that covers it and shows the remaining challenge time.",
    },
    why: "This is what makes the L2 a 'rollup' secured by RL1 rather than a separate chain: even the operator can't publish a false state without being challenged.",
    timing: { simulated: "about 10 s to propose, 45 s challenge window (compressed)", live: "~10–30 min until a game covers the tx, then 3.5 days of challenge window" },
  },
  {
    id: "redeem",
    title: "Turn digital euros back into euros (burn)",
    kind: "action",
    summary: "The customer returns S-EUR; the tokens are destroyed and the euros are booked back to the Girokonto.",
    story:
      "Ben wants 400 € back on his normal account. The gateway first burns 400 S-EUR on the L2 and only then books 400 € from the Sammelkonto back to Ben's Girokonto. " +
      "Burning first means the bank never pays out euros for tokens that still exist.",
    who: {
      customer: "Requests the redemption in the app.",
      gateway: "Checks the token balance, sends the burn, and books the euros after it succeeds.",
      l2: "The S-EUR contract destroys the tokens (total supply goes down).",
      osplus: "Books Sammelkonto → Girokonto (GV code 802).",
    },
    why: "Redemption at par, 1 S-EUR = 1 €, at any time: this is what makes it a tokenized deposit rather than a new currency.",
    timing: { simulated: "about 1 second", live: "about 2–4 seconds" },
  },
  {
    id: "reconcile",
    title: "Check that both ledgers match",
    kind: "action",
    summary: "The gateway compares the euros on the Sammelkonten in OSPlus with the S-EUR in circulation on the L2, per Sparkasse.",
    story:
      "Like an end-of-day reconciliation (Tagesabschluss), the gateway reads the total S-EUR supply and every customer's token balance from the L2, " +
      "and compares them with the Sammelkonto balances in OSPlus. If anything doesn't match, it raises a break for operations to investigate.",
    who: {
      gateway: "Reads balances from the L2 and from OSPlus, then compares them.",
      l2: "Answers read-only queries (totalSupply, balanceOf). No transaction is needed.",
      osplus: "Receives the reconciliation result.",
    },
    why: "This proves the 1:1 backing at any time, which auditors, BaFin and the deposit guarantee scheme will ask for.",
    timing: { simulated: "instant", live: "a few seconds" },
  },
];

export const STEP_BY_ID = Object.fromEntries(STEPS.map((s) => [s.id, s])) as Record<StepId, StepExplain>;

export const COMPONENT_EXPLAIN: Record<Component, string> = {
  channel: "How the customer interacts with the bank: the S-App, online banking or the branch. Customers never deal with keys or gas.",
  kyc: "Customer master data and identification status (Legitimation / KYC) in OSPlus.",
  giro: "The customer's normal current account (Girokonto) with IBAN and balance.",
  hold: "A reservation (Sperre) that blocks part of the balance while a process is running, so the money can't be spent twice.",
  omnibus: "One 'Sammelkonto Tokenisierte Einlagen' per Sparkasse. It holds the euros that back all S-EUR issued to that Sparkasse's customers.",
  journal: "The booking journal (Buchungsjournal): every movement of euros with a GV code and an EndToEndId reference.",
  api: "How OSPlus talks to other systems: business events out (outbox → event stream) and booking requests in (REST API).",
  compliance: "Rule checks before anything is sent to the chain: KYC status, sanctions lists, limits, AML velocity.",
  custody: "Key management. Each customer's wallet key is derived and held in the bank's HSM, so the bank signs on the customer's behalf.",
  orchestrator: "Runs each business process as a saga: a fixed sequence of steps with a compensating action if a later step fails.",
  recon: "Compares the blockchain ledger with OSPlus and flags any difference.",
  sequencer: "The node (op-geth + op-node) that orders transactions into L2 blocks every 2 seconds. Fast, but on its own a single operator's word.",
  token: "The S-EUR smart contract: a permissioned token with mint, burn, transfer and an allowlist. Every call carries the OSPlus reference.",
  batcher: "op-batcher: compresses L2 blocks and publishes them on RL1 as blobs. This is what makes transactions 'safe'.",
  proposer: "op-proposer: regularly publishes a fingerprint (output root) of the L2 state on RL1.",
  batchInbox: "The RL1 address that receives the batcher's blob transactions. The L2's complete history can be rebuilt from here.",
  disputeGame: "The RL1 contract that stores proposed L2 states and lets anyone challenge a wrong one during the challenge window.",
  portal: "OptimismPortal: the RL1 contract for deposits into the L2 and withdrawals out of it. Withdrawals need a resolved dispute game.",
};

export const LAYER_EXPLAIN: Record<Layer, string> = {
  customer: "The end customer. They see a normal banking app, with no crypto wallet to manage.",
  osplus: "The core banking system of the Sparkassen (operated by Finanz Informatik). Simulated here. It stays the system of record for euros and customers.",
  gateway: "The abstraction layer between OSPlus and the blockchain. It translates banking events into blockchain transactions and back, and is the only component holding chain keys.",
  l2: "OP Sepolia: a public test network built with the OP Stack (Optimism's rollup software). Fast and cheap, with blocks every 2 seconds.",
  l1: "RL1, the Regulated Layer One: an EVM-based settlement layer (here the public Sepolia test network). The L2 publishes its data and state here, which is where its security comes from.",
};

export const GLOSSARY: { term: string; text: string }[] = [
  { term: "RL1", text: "Regulated Layer One: the EVM-based settlement layer of this architecture (the public Sepolia test network in this demo). The L2 writes its data and state to RL1 and inherits its security from it." },
  { term: "L2", text: "A faster chain on top of RL1 that bundles many transactions and publishes them on RL1. Here: OP Sepolia, built with the OP Stack." },
  { term: "OP Stack", text: "Open-source software from Optimism for running L2 rollups. OP Mainnet, Base and OP Sepolia all run on it." },
  { term: "Rollup", text: "An L2 that 'rolls up' many transactions and publishes them on the L1, so anyone can verify the L2 from L1 data." },
  { term: "Unsafe", text: "Confirmed by the L2 sequencer only. Fast (2 s), but it relies on the sequencer." },
  { term: "Safe", text: "The transaction's data has been published on RL1. Anyone can re-derive it." },
  { term: "Finalized", text: "The RL1 block holding that data is final. The transaction can no longer be reversed." },
  { term: "Blob", text: "A cheap data attachment for RL1 transactions (EIP-4844), designed for rollups. Kept by RL1 nodes for ~18 days." },
  { term: "Dispute game", text: "An RL1 contract where a proposed L2 state can be challenged for 3.5 days before it's accepted." },
  { term: "S-EUR", text: "The demo's tokenized deposit: 1 S-EUR = 1 € on a Sparkasse's Sammelkonto. Permissioned and redeemable at par." },
  { term: "Sammelkonto", text: "The omnibus account in OSPlus holding the euros that back the tokens." },
  { term: "Saga", text: "A multi-step business process where each step has an 'undo' if a later step fails." },
  { term: "Gas", text: "The fee for running a transaction. The gateway pays it in OP Sepolia ETH, and customers never see it." },
];

// ------------------------------------------------------------------ executive view

export type ChapterId = "account" | "convert" | "pay" | "secure" | "redeem";

export interface Chapter {
  id: ChapterId;
  title: string;
  headline: string;
  text: string;
  benefit: string;
  steps: StepId[];
  /** Systems involved, highlighted in the executive diagram. */
  systems: Layer[];
  auto?: boolean;
}

export const CHAPTERS: Chapter[] = [
  {
    id: "account",
    title: "Open accounts",
    headline: "Anna and Ben become customers of two different Sparkassen",
    text: "They open a normal Girokonto in OSPlus and are identified as usual. In the background, each gets a bank-managed wallet that is approved for digital euros. Anna then receives €5,000 by SEPA transfer.",
    benefit: "No change for customers or branches. Only verified customers can ever hold digital euros.",
    steps: ["onboard", "fund"],
    systems: ["osplus", "gateway", "l2"],
  },
  {
    id: "convert",
    title: "Convert to digital euro",
    headline: "Anna turns €2,500 into digital euros (S-EUR)",
    text: "OSPlus moves €2,500 from her Girokonto to a backing account, and exactly 2,500 S-EUR are created in her wallet. If anything fails, the whole step is rolled back.",
    benefit: "Every digital euro is backed 1:1 by a deposit in OSPlus. It is still a Sparkasse deposit, not a new currency.",
    steps: ["tokenize"],
    systems: ["osplus", "gateway", "l2"],
  },
  {
    id: "pay",
    title: "Pay instantly",
    headline: "Anna pays Ben €1,000, settled in seconds",
    text: "The payment settles on the OP Stack network in about 2 seconds, 24/7. Because Ben banks with another Sparkasse, the backing is moved between the two Sparkassen automatically.",
    benefit: "Instant, programmable payments within the Sparkassen's regulated perimeter, across institutes.",
    steps: ["transfer"],
    systems: ["gateway", "l2", "osplus"],
  },
  {
    id: "secure",
    title: "Anchored on RL1",
    headline: "The payment is anchored on RL1 in about 2 minutes",
    text: "The OP Stack network publishes the payment data on RL1 within a few minutes. From then on anyone can verify it from RL1 data. Nobody has to wait for anything after that: RL1 finality (~15 min) and the state proof (3.5-day challenge window) complete in the background.",
    benefit: "Customers and branches get instant payments. The bank gets an auditable anchor on RL1 within minutes, and irrevocable finality follows automatically.",
    steps: ["batch", "finality", "proposal"],
    systems: ["l2", "l1"],
    auto: true,
  },
  {
    id: "redeem",
    title: "Redeem & audit",
    headline: "Ben takes €400 back to his Girokonto, and the books balance",
    text: "Ben's 400 S-EUR are destroyed and €400 is booked back to his normal account. Then the gateway checks that the digital euros in circulation exactly match the backing accounts in OSPlus.",
    benefit: "Redeemable at par at any time, with continuous proof of 1:1 backing for auditors and supervisors.",
    steps: ["redeem", "reconcile"],
    systems: ["l2", "gateway", "osplus"],
  },
];
