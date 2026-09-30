/**
 * All plain-language explanations shown in the walkthrough live here, so the wording can be
 * reviewed and edited in one place.
 *
 * The story: a municipal utility issues a tokenized green bond (an eWpG crypto security) and a
 * corporate investor buys it with tokenized deposits, delivery versus payment, on an OP Stack L2
 * that settles on RL1, an EVM-based Regulated Layer One.
 */
import { BOND } from "./bond";
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

export const ISSUER = { name: "Stadtwerke Musterstadt GmbH", institutId: "SPK-MS", balance: 20_000_00 } as const;
export const INVESTOR = { name: "Becker Logistik GmbH", institutId: "SPK-BS", balance: 250_000_00 } as const;
export const TRADE = { units: BOND.issueUnits, priceCents: BOND.issueUnits * BOND.nominalCents } as const; // placed at 100 %

export const STEPS: StepExplain[] = [
  {
    id: "onboard",
    title: "Onboard issuer and investor",
    kind: "action",
    summary: "Two corporate clients of two different Sparkassen are enabled for tokenized securities and get bank-managed wallets.",
    story:
      `${ISSUER.name} (a municipal utility, client of Sparkasse Musterstadt) wants to issue a green bond. ` +
      `${INVESTOR.name} (client of Sparkasse Beispielstadt) wants to invest surplus liquidity. Both are existing clients with a business account (Geschäftskonto) in OSPlus; ` +
      "they get a securities account (Depot), are identified as companies (KYB), and receive a wallet whose key the bank holds. The wallet is allowlisted on the bond register and the cash token.",
    who: {
      customer: "Client relationship manager enables the company for digital securities.",
      osplus: "Creates the client with Geschäftskonto and Depot, and publishes a 'client created' event.",
      gateway: "Checks KYB, sanctions and investor classification, creates the custodial wallet and sends the allowlisting.",
      l2: "One transaction allowlists the wallet on both contracts. On the first run the gateway also deploys the three contracts.",
    },
    why: "Only verified, eligible parties can ever hold the bond or the cash token: AML/KYB and MiFID rules carry over to the blockchain.",
    timing: { simulated: "about 1 second each", live: "about 2–4 seconds each (first run: + ~15 s to deploy the contracts)" },
  },
  {
    id: "issue",
    title: "Issue the tokenized bond (eWpG)",
    kind: "action",
    summary: `The issuer's ${BOND.name} (ISIN ${BOND.isin}) is entered into a crypto securities register on the L2.`,
    story:
      "Since 2021 the German Electronic Securities Act (eWpG) allows bonds to be issued without a paper certificate, as 'crypto securities' registered on a blockchain. " +
      `The registrar (here: the gateway) enters ${BOND.issueUnits} bonds of ${BOND.nominalCents / 100} € into the register in the issuer's name, ready to be placed with investors. ` +
      "OSPlus mirrors the entry in the issuer's Depot.",
    who: {
      customer: "The issuer mandates the issuance with its terms (coupon, maturity, volume).",
      gateway: "Acts as registrar: checks the terms and the issuer, then instructs the register entry.",
      l2: "The bond contract records the new bonds in the issuer's name. It is the crypto securities register.",
      osplus: "Books the bonds into the issuer's Depot, so core banking shows the same position as the register.",
    },
    why: "Issuance without paper, central securities depository or paying agent: faster, cheaper and possible for smaller volumes, which suits municipal and Mittelstand issuers.",
    timing: { simulated: "about 1 second", live: "about 2–4 seconds" },
  },
  {
    id: "tokenize",
    title: "Investor tokenizes cash",
    kind: "action",
    summary: "The investor turns account money into S-EUR, tokenized deposits backed 1:1 by its Geschäftskonto money.",
    story:
      "To pay on the chain, the investor needs cash on the chain. The gateway runs a saga: (1) OSPlus reserves the amount on the Geschäftskonto, " +
      "(2) the cash token creates (mints) the same amount of S-EUR in the investor's wallet, (3) OSPlus books the euros to the Sammelkonto that backs all S-EUR. " +
      "If the mint fails, the reservation is released and nothing moves.",
    who: {
      customer: "The investor's treasurer orders the conversion.",
      osplus: "Places a hold (Sperre), then books Geschäftskonto → Sammelkonto 'Tokenisierte Einlagen'.",
      gateway: "Checks limits and AML rules, coordinates the three steps, and undoes the hold if anything fails.",
      l2: "The cash token mints S-EUR. The OSPlus reference is stored with the transaction for reconciliation.",
    },
    why: "Commercial-bank money on the chain: it stays a Sparkasse deposit (with deposit protection), not a stablecoin or a new currency.",
    timing: { simulated: "about 1 second", live: "about 2–4 seconds" },
  },
  {
    id: "dvp",
    title: "Delivery versus payment (atomic)",
    kind: "action",
    summary: "Bonds go to the investor and cash goes to the issuer in one single transaction. Either both happen or neither.",
    story:
      "In traditional settlement, securities and cash move in separate systems and it takes two business days (T+2). In between, one side carries the risk that the other doesn't deliver. " +
      "Here the DvP contract moves both legs in one transaction: bonds to the investor and S-EUR to the issuer. If the investor can't pay, the whole transaction is undone, including the delivery. " +
      "Try the 'buyer can't pay' test to see it.",
    who: {
      customer: "Issuer and investor agree the trade (placement at 100 %).",
      gateway: "Checks positions and eligibility, then sends one settlement instruction to the DvP contract.",
      l2: "The DvP contract executes delivery and payment in one transaction, all or nothing.",
      osplus: "Mirrors the new positions in both Depots and moves the cash backing between the two Sparkassen.",
    },
    why: "No settlement risk, no T+2: settlement in seconds, 24/7, across Sparkassen.",
    timing: { simulated: "about 1 second", live: "about 2–4 seconds" },
  },
  {
    id: "batch",
    title: "The L2 writes its data to RL1",
    kind: "wait",
    summary: "The OP Stack 'batcher' bundles recent L2 blocks and publishes them on RL1. From then on the trade is anchored.",
    story:
      "So far the trade is only confirmed by the sequencer, the server that orders L2 transactions. That's fast, but it relies on one operator. " +
      "Every few minutes op-batcher compresses the latest L2 blocks and publishes them on RL1 as a 'blob' (a cheap data attachment). " +
      "From then on anyone can rebuild the L2, including our trade, from RL1 data alone.",
    who: {
      l2: "op-batcher compresses the L2 blocks and sends them to RL1 as a blob transaction.",
      l1: "The blob transaction to the BatchInbox address is included in an RL1 block.",
      gateway: "Sees the L2 'safe' head move past the trade and marks it as anchored.",
    },
    why: "The bank no longer depends on the sequencer's word: the trade is anchored on RL1 and can be checked by any auditor or supervisor.",
    timing: { simulated: "about 5–10 seconds", live: "usually 1–5 minutes on OP Sepolia" },
  },
  {
    id: "finality",
    title: "Final on RL1 (immediately)",
    kind: "wait",
    summary: "RL1 is a Regulated Layer One with BFT consensus: the block that anchors the trade is final the moment it is included.",
    story:
      "A Regulated Layer One is run by a known set of regulated validators that agree on each block before it is added. " +
      "There are no competing blocks and no reorganisations, so a block is irreversible as soon as it exists. " +
      "Anchoring on RL1 and settlement finality are therefore the same moment.",
    who: {
      l1: "The validators of the Regulated Layer One agree on the block that contains the batch. It is final on inclusion.",
      l2: "The L2 'finalized' head moves together with the 'safe' head.",
      gateway: "Marks the trade as final: the point for 'endgültig gebucht' in both ledgers.",
    },
    why: "One clear, objective settlement-finality moment within minutes, comparable to finality in a payment or securities settlement system.",
    timing: {
      simulated: "immediately, together with the anchoring",
      live: "immediately on a Regulated Layer One. The Sepolia test network used as a stand-in here confirms its own finality ~13 min later.",
    },
  },
  {
    id: "proposal",
    title: "State proof on RL1 (in the background)",
    kind: "wait",
    summary: "A 'proposer' publishes a fingerprint of the entire L2 state on RL1. Anyone can challenge it for 3.5 days.",
    story:
      "Separately from the data, op-proposer regularly publishes a cryptographic fingerprint (output root) of the whole L2 state on RL1, " +
      "inside a 'dispute game' contract. For 3.5 days anyone can prove that the fingerprint is wrong. If no one does, it's accepted, " +
      "and RL1 then 'knows' the L2 positions. This is only needed for moving assets from the L2 to RL1. Trades don't wait for it.",
    who: {
      l2: "op-proposer computes the output root and creates a dispute game on RL1 (on OP Sepolia every ~10–15 minutes).",
      l1: "The DisputeGameFactory stores the game. The challenge clock runs for 3.5 days, then the game resolves.",
      gateway: "Links each transaction to the first game that covers it and shows the remaining challenge time.",
    },
    why: "This is what makes the L2 a 'rollup' secured by RL1 rather than a separate chain: even the operator can't publish a false state without being challenged.",
    timing: { simulated: "about 10 s to propose, 45 s challenge window (compressed)", live: "~10–30 min until a game covers the trade, then 3.5 days of challenge window" },
  },
  {
    id: "coupon",
    title: "Pay the coupon (programmable)",
    kind: "action",
    summary: `The ${BOND.couponBps / 100}% coupon is calculated from the register and paid to every holder in one transaction.`,
    story:
      "On the coupon date the issuer pays interest to whoever holds the bonds. Here the DvP contract reads each holder's position straight from the bond register " +
      `and pays position × ${((BOND.nominalCents * BOND.couponBps) / 1_000_000).toFixed(2)} € from the issuer's S-EUR, in one transaction. ` +
      "No paying agent, no reconciliation of holder lists. In the demo we pay the first annual coupon right away.",
    who: {
      customer: "The coupon date triggers the payment (a corporate action).",
      gateway: "Checks the issuer's S-EUR and instructs the payment.",
      l2: "The DvP contract computes and pays every holder's coupon from the register, in one transaction.",
      osplus: "Moves the cash backing to the investor's Sparkasse.",
    },
    why: "Programmable corporate actions: coupons and later redemptions pay out automatically and exactly, from a single source of truth.",
    timing: { simulated: "about 1 second", live: "about 2–4 seconds" },
  },
  {
    id: "redeem",
    title: "Issuer takes its proceeds back to its account",
    kind: "action",
    summary: "The issuer returns its S-EUR; the tokens are destroyed and the euros are booked to its Geschäftskonto.",
    story:
      "The utility received the bond proceeds in S-EUR and now wants them on its normal account to finance its projects. " +
      "The gateway first burns the S-EUR on the L2 and only then books the euros from the Sammelkonto to the Geschäftskonto.",
    who: {
      customer: "The issuer's treasurer orders the redemption.",
      gateway: "Checks the S-EUR balance, sends the burn and books the euros after it succeeds.",
      l2: "The cash token destroys the S-EUR (total supply goes down).",
      osplus: "Books Sammelkonto → Geschäftskonto (GV code 802).",
    },
    why: "Redeemable at par at any time: S-EUR is a deposit, and leaving the chain is as easy as entering it.",
    timing: { simulated: "about 1 second", live: "about 2–4 seconds" },
  },
  {
    id: "reconcile",
    title: "Reconcile cash and securities",
    kind: "action",
    summary: "The gateway checks both ledgers: cash on the Sammelkonten vs. S-EUR, and OSPlus Depots vs. the bond register.",
    story:
      "Like an end-of-day reconciliation (Tagesabschluss), the gateway reads the S-EUR supply, the bond register and every client's positions from the L2, " +
      "and compares them with the Sammelkonten and Depots in OSPlus. Any difference is raised as a break for operations.",
    who: {
      gateway: "Reads all balances from the L2 and OSPlus, then compares them.",
      l2: "Answers read-only queries (totalSupply, balanceOf). No transaction is needed.",
      osplus: "Receives the reconciliation result.",
    },
    why: "Continuous proof of 1:1 cash backing and of correct securities positions, which auditors, BaFin and the deposit guarantee scheme will ask for.",
    timing: { simulated: "instant", live: "a few seconds" },
  },
];

export const STEP_BY_ID = Object.fromEntries(STEPS.map((s) => [s.id, s])) as Record<StepId, StepExplain>;

export const COMPONENT_EXPLAIN: Record<Component, string> = {
  channel: "How corporate clients interact with the bank: the Firmenkundenportal, treasury systems or the relationship manager. Clients never deal with keys or gas.",
  kyc: "Client master data and identification status (Legitimation / KYB) in OSPlus.",
  giro: "The client's business current account (Geschäftskonto) with IBAN and balance.",
  hold: "A reservation (Sperre) that blocks part of the balance while a process is running, so the money can't be spent twice.",
  omnibus: "One 'Sammelkonto Tokenisierte Einlagen' per Sparkasse. It holds the euros that back all S-EUR of that Sparkasse's clients.",
  depot: "The client's securities account (Depot). OSPlus mirrors every register entry here so core banking shows the same positions.",
  journal: "The booking journal (Buchungsjournal): every movement of euros with a GV code and an EndToEndId reference.",
  api: "How OSPlus talks to other systems: business events out (outbox → event stream) and booking requests in (REST API).",
  compliance: "Rule checks before anything is sent to the chain: KYB, sanctions lists, investor classification, issuer approval, limits.",
  custody: "Key management. Each client's wallet key is held in the bank's HSM, so the bank signs on the client's behalf.",
  orchestrator: "Runs each business process as a saga: a fixed sequence of steps with a compensating action if a later step fails.",
  recon: "Compares the blockchain ledgers (cash and securities) with OSPlus and flags any difference.",
  sequencer: "The node (op-geth + op-node) that orders transactions into L2 blocks every 2 seconds. Fast, but on its own a single operator's word.",
  token: "The S-EUR cash token: tokenized deposits with mint, burn and an allowlist. Every call carries the OSPlus reference.",
  bond: "The bond contract: the eWpG crypto securities register for the green bond (ISIN, nominal, coupon, maturity, positions).",
  dvp: "The DvP contract: settles bond and cash in one all-or-nothing transaction and pays coupons computed from the register.",
  batcher: "op-batcher: compresses L2 blocks and publishes them on RL1 as blobs. This is what anchors transactions on RL1.",
  proposer: "op-proposer: regularly publishes a fingerprint (output root) of the L2 state on RL1.",
  batchInbox: "The RL1 address that receives the batcher's blob transactions. The L2's complete history can be rebuilt from here.",
  disputeGame: "The RL1 contract that stores proposed L2 states and lets anyone challenge a wrong one during the challenge window.",
  portal: "OptimismPortal: the RL1 contract for deposits into the L2 and withdrawals out of it. Withdrawals need a resolved dispute game.",
};

export const LAYER_EXPLAIN: Record<Layer, string> = {
  customer: "The corporate clients: an issuer and an investor. They use their usual banking channels, with no crypto wallet to manage.",
  osplus: "The core banking system of the Sparkassen (operated by Finanz Informatik). Simulated here. It stays the system of record for accounts, Depots and euros.",
  gateway: "The abstraction layer between OSPlus and the blockchain. It translates banking events into blockchain transactions and back, acts as registrar, and is the only component holding chain keys.",
  l2: "OP Sepolia: a public test network built with the OP Stack (Optimism's rollup software). Fast and cheap, with blocks every 2 seconds.",
  l1: "RL1, the Regulated Layer One: an EVM-based settlement layer (here the public Sepolia test network). The L2 publishes its data and state here, which is where its security comes from.",
};

export const GLOSSARY: { term: string; text: string }[] = [
  { term: "RL1", text: "Regulated Layer One: the EVM-based settlement layer of this architecture (the public Sepolia test network in this demo). The L2 writes its data and state to RL1 and inherits its security from it." },
  { term: "L2", text: "A faster chain on top of RL1 that bundles many transactions and publishes them on RL1. Here: OP Sepolia, built with the OP Stack." },
  { term: "OP Stack", text: "Open-source software from Optimism for running L2 rollups. OP Mainnet, Base and OP Sepolia all run on it." },
  { term: "eWpG", text: "German Electronic Securities Act (2021). Allows securities to be issued electronically, including as crypto securities kept in a blockchain-based register." },
  { term: "Crypto securities register", text: "The register in which an eWpG crypto security is recorded, kept by a BaFin-licensed registrar. Here: the bond contract, with the gateway as registrar." },
  { term: "DvP", text: "Delivery versus payment: securities are delivered only if payment happens, and vice versa. Here both legs settle in one transaction." },
  { term: "Atomic settlement", text: "All parts of a transaction succeed together or none do. There is no state in which only one side has delivered." },
  { term: "T+2", text: "Traditional securities settlement two business days after the trade (the EU plans to move to T+1 in 2027). Here settlement takes seconds." },
  { term: "ISIN", text: `International Securities Identification Number, e.g. ${BOND.isin} for the demo bond (fictitious, with a valid check digit).` },
  { term: "Coupon", text: `The bond's interest, here ${BOND.couponBps / 100}% per year on the nominal value, paid to whoever holds the bond on the coupon date.` },
  { term: "S-EUR", text: "The demo's cash token: tokenized deposits, 1 S-EUR = 1 € on a Sparkasse's Sammelkonto. Permissioned and redeemable at par." },
  { term: "Sammelkonto", text: "The omnibus account in OSPlus holding the euros that back the tokens." },
  { term: "Depot", text: "A securities account in OSPlus. It mirrors the client's positions in the crypto securities register." },
  { term: "Saga", text: "A multi-step business process where each step has an 'undo' if a later step fails." },
  { term: "Unsafe / safe / finalized", text: "Confirmed by the L2 sequencer only / data published on RL1 / RL1 block final. On a Regulated Layer One, safe and finalized coincide." },
  { term: "Blob", text: "A cheap data attachment for RL1 transactions (EIP-4844), designed for rollups. Kept by RL1 nodes for ~18 days." },
  { term: "Dispute game", text: "An RL1 contract where a proposed L2 state can be challenged for 3.5 days before it's accepted." },
  { term: "Gas", text: "The fee for running a transaction. The gateway pays it in OP Sepolia ETH, and clients never see it." },
];

// ------------------------------------------------------------------ executive view

export type ChapterId = "onboard" | "issue" | "cash" | "dvp" | "final" | "coupon" | "close";

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
    id: "onboard",
    title: "Onboard",
    headline: "A municipal utility and a logistics company join, at two different Sparkassen",
    text: `${ISSUER.name} wants to issue a green bond, ${INVESTOR.name} wants to invest liquidity. Both are verified (KYB), get a Depot in OSPlus and a bank-managed wallet approved for the bond and for tokenized cash.`,
    benefit: "Existing corporate clients, existing accounts: only verified, eligible parties can ever hold the bond or the cash.",
    steps: ["onboard"],
    systems: ["osplus", "gateway", "l2"],
  },
  {
    id: "issue",
    title: "Issue bond",
    headline: `The utility issues a €100,000 green bond as a digital security`,
    text: `${BOND.name} (ISIN ${BOND.isin}) is issued without paper under the German eWpG: ${BOND.issueUnits} bonds of €1,000 are entered into a crypto securities register on the L2. OSPlus shows the same position in the issuer's Depot.`,
    benefit: "Fast, low-cost issuance without paper certificates or intermediaries: attractive for municipal and Mittelstand issuers.",
    steps: ["issue"],
    systems: ["gateway", "l2", "osplus"],
  },
  {
    id: "cash",
    title: "Tokenize cash",
    headline: "The investor turns €100,000 of account money into tokenized deposits",
    text: "OSPlus moves €100,000 from the investor's Geschäftskonto to a backing account, and the same amount of S-EUR is created in its wallet. If anything fails, the step is rolled back.",
    benefit: "Commercial-bank money on the chain: still a Sparkasse deposit, backed 1:1, no stablecoin needed.",
    steps: ["tokenize"],
    systems: ["osplus", "gateway", "l2"],
  },
  {
    id: "dvp",
    title: "Settle DvP",
    headline: "Bond and cash change hands in one transaction, in seconds",
    text: "The investor buys all 100 bonds for €100,000. The DvP contract delivers the bonds and pays the issuer in one single transaction: either both happen or neither. No T+2, no settlement risk.",
    benefit: "Atomic delivery versus payment across two Sparkassen, 24/7, and nobody can end up with only one side of the trade.",
    steps: ["dvp"],
    systems: ["gateway", "l2", "osplus"],
  },
  {
    id: "final",
    title: "Final on RL1",
    headline: "The trade is anchored on RL1 and final in about 2 minutes",
    text: "The OP Stack network publishes the trade data on RL1 within a few minutes. RL1 is a Regulated Layer One with immediate finality, so the trade is irreversible from that moment on. Only the state proof (3.5-day challenge window) continues in the background, and nobody has to wait for it.",
    benefit: "An objective, auditable settlement-finality point within minutes instead of days.",
    steps: ["batch", "finality", "proposal"],
    systems: ["l2", "l1"],
    auto: true,
  },
  {
    id: "coupon",
    title: "Pay coupon",
    headline: "The 3.25% coupon is calculated and paid automatically",
    text: "On the coupon date the contract reads every holder's position from the register and pays €32.50 per bond from the issuer's S-EUR, in one transaction. In the demo we pay the first annual coupon right away.",
    benefit: "Programmable corporate actions: no paying agent, no holder lists to reconcile, exact to the cent.",
    steps: ["coupon"],
    systems: ["gateway", "l2", "osplus"],
  },
  {
    id: "close",
    title: "Redeem & reconcile",
    headline: "The utility takes its proceeds to its account, and both ledgers match",
    text: "The issuer's S-EUR are destroyed and booked to its Geschäftskonto. Then the gateway checks cash (Sammelkonten = S-EUR in circulation) and securities (OSPlus Depots = bond register).",
    benefit: "Continuous proof of cash backing and correct securities positions for auditors and supervisors.",
    steps: ["redeem", "reconcile"],
    systems: ["l2", "gateway", "osplus"],
  },
];
