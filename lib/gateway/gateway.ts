/**
 * Sparkassen Chain Gateway - the abstraction layer.
 *
 * An anti-corruption layer between OSPlus and the ledger:
 *  - translates core-banking business events (Kunde angelegt, Emission, Kauf, ...)
 *    into ledger commands (onboard, issue, mint, DvP, coupon, burn) and back
 *  - owns compliance checks, custody (wallet per client), idempotent references
 *  - acts as registrar ("registerführende Stelle") of the eWpG crypto securities register
 *  - runs each business process as a saga with compensation (hold -> mint -> book)
 *  - tracks L2 -> RL1 settlement of every tx and reconciles cash and securities vs. OSPlus
 *
 * It depends only on the ChainAdapter interface, never on a specific chain.
 * Every emitted message carries a plain-language `explain` for the walkthrough.
 */
import { BOND, COUPON_PER_UNIT } from "../bond";
import { fmtEur, short } from "../format";
import { GV, INSTITUTE, type Kunde, type OsplusSimulator } from "../osplus/simulator";
import type { ChainAdapter, ChainStatus, Contracts, ProposalInfo, TxReceipt } from "../chain/types";
import type { Component, Hex, Layer, Level, SettlementStage, StepId, TraceEvent } from "../types";

export const TOKENIZE_LIMIT_CENTS = 1_000_000_00;

export interface TrackedTx {
  hash: Hex;
  l2Block: number;
  l2Timestamp: number;
  label: string;
  kind: ChainTx["kind"];
  step: StepId;
  stage: SettlementStage;
  batchTx?: Hex;
  batchL1Block?: number;
  proposalIndex?: number;
  gameAddress?: Hex;
  gameTx?: Hex;
  resolved?: boolean;
  /** Wall-clock milestones (ms) for the executive KPIs. */
  submittedAt: number;
  confirmedAt: number;
  safeAt?: number;
  finalizedAt?: number;
}

export interface ReconReport {
  ts: number;
  cash: {
    totalSupply: number;
    omnibusTotal: number;
    perInstitut: { institutId: string; name: string; omnibus: number; onChain: number }[];
    ok: boolean;
  };
  securities: {
    isin: string;
    registerTotal: number;
    osplusTotal: number;
    perKunde: { kundennr: string; name: string; depot: string; osplus: number; onChain: number }[];
    ok: boolean;
  };
  ok: boolean;
}

/** One real on-chain transaction (L2 or RL1), for the explorer list. */
export interface ChainTx {
  id: number;
  chain: "l2" | "l1";
  kind: "deploy" | "config" | "onboard" | "issue" | "mint" | "dvp" | "coupon" | "burn" | "batch" | "proposal";
  title: string;
  hash?: Hex;
  address?: Hex;
  block?: number;
  ts: number;
  step: StepId;
  /** The tx reverted on purpose (failing-trade demo). */
  failed?: boolean;
  /** Business transactions this RL1 tx anchors (batch / dispute game). */
  covers?: string[];
}

export type Explorers = { l1?: string; l2?: string };

export function explorerUrl(base: string | undefined, kind: "tx" | "address" | "block", value?: string | number) {
  return base && value !== undefined ? `${base}/${kind}/${value}` : undefined;
}

type Emit = (e: Omit<TraceEvent, "id" | "ts">) => void;
type Extra = Partial<Pick<TraceEvent, "protocol" | "endpoint" | "payload" | "link">> & { level?: Level };

/** Does dispute game `p` cover tracked tx `t`? Classic games use block numbers, super-root games timestamps. */
const covers = (p: ProposalInfo, t: TrackedTx) =>
  p.l2Block !== undefined ? p.l2Block >= t.l2Block : (p.l2Timestamp ?? 0) >= t.l2Timestamp;

const units = (n: number) => `${n} bond${n === 1 ? "" : "s"}`;

export class Gateway {
  wallets = new Map<string, Hex>(); // kundennr -> wallet
  tracked: TrackedTx[] = [];
  /** Every real transaction, newest first. */
  txs: ChainTx[] = [];
  explorers: Explorers = {};
  contracts?: Contracts;
  lastRecon?: ReconReport;
  /** Outcome of the failing-trade demo, if run. */
  failedTrade?: { hash: Hex; buyer: string; price: number; units: number };
  /** What each business step did, for the executive summaries (not the current balances). */
  facts: {
    issued?: { issuer: string; units: number };
    tokenized?: { client: string; cents: number };
    trade?: { seller: string; buyer: string; units: number; price: number };
    coupon?: { total: number; holders: { name: string; units: number; amount: number }[] };
    redeemed?: { client: string; cents: number };
  } = {};
  private txSeq = 0;
  private seq = 0;
  private step: StepId = "onboard";
  private lastStatus?: ChainStatus;

  constructor(
    public osplus: OsplusSimulator,
    public chain: ChainAdapter,
    private emitRaw: Emit,
  ) {}

  private emit(from: Layer, to: Layer, components: Component[], title: string, explain: string, extra: Extra = {}) {
    this.emitRaw({ step: this.step, from, to, components, title, explain, level: extra.level ?? "info", ...extra });
  }

  private nextRef(prefix: string) {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `${prefix}-${d}-${String(++this.seq).padStart(5, "0")}`; // <= 32 bytes -> bytes32 on-chain
  }

  private txLink(hash: string) {
    const url = explorerUrl(this.explorers.l2, "tx", hash);
    return url ? { label: "View on OP Sepolia explorer", url } : undefined;
  }

  private recordTx(tx: Omit<ChainTx, "id" | "ts" | "step"> & { step?: StepId }) {
    this.txs.unshift({ id: ++this.txSeq, ts: Date.now(), step: this.step, ...tx });
  }

  private receipt(r: TxReceipt, what: string, kind: ChainTx["kind"], title: string, components: Component[] = ["sequencer"]) {
    this.recordTx({ chain: "l2", kind, title, hash: r.hash, block: r.l2Block });
    const fee = r.l1FeeWei ? ` The sequencer charged an L1 data fee of ${(Number(r.l1FeeWei) / 1e9).toFixed(2)} gwei to cover publishing it on RL1 later.` : "";
    this.emit(
      "l2",
      "gateway",
      components,
      `${what}: confirmed in L2 block #${r.l2Block}`,
      `The sequencer put the transaction into a block. The result is visible immediately. It becomes final once the block is anchored on RL1.${fee}`,
      { protocol: "JSON-RPC", endpoint: "eth_getTransactionReceipt", payload: r, link: this.txLink(r.hash), level: "success" },
    );
  }

  private track(r: TxReceipt, label: string, kind: ChainTx["kind"], submittedAt: number) {
    this.tracked.unshift({
      hash: r.hash,
      l2Block: r.l2Block,
      l2Timestamp: r.l2Timestamp,
      label,
      kind,
      step: this.step,
      stage: "unsafe",
      submittedAt,
      confirmedAt: Date.now(),
    });
  }

  private walletOf(kundennr: string) {
    const w = this.wallets.get(kundennr);
    if (!w) throw new Error(`Client ${kundennr} has no wallet yet (not onboarded)`);
    return w;
  }

  private fail(msg: string, explain: string) {
    this.emit("gateway", "gateway", ["compliance"], msg, explain, { level: "error" });
    return new Error(msg);
  }

  private inst(id: string) {
    return this.osplus.institut(id).name;
  }

  /** Cash moved on the chain between clients of two Sparkassen: move the backing between their Sammelkonten. */
  private rebalance(from: Kunde, to: Kunde, cents: number, ref: string, why: string) {
    if (from.institutId === to.institutId || cents <= 0) return;
    const oa = this.osplus.omnibus(from.institutId);
    const ob = this.osplus.omnibus(to.institutId);
    this.osplus.umbuchung(oa.iban, ob.iban, cents, GV.INTERBANK, `Interbankausgleich S-EUR (${why})`, ref);
    this.emit("gateway", "osplus", ["omnibus", "journal"],
      `Move backing ${fmtEur(cents)}: ${this.inst(from.institutId)} → ${this.inst(to.institutId)}`,
      `The cash changed hands between clients of two different Sparkassen, so the euros backing it move between their Sammelkonten (in reality via the Girozentrale / Landesbank clearing).`,
      { protocol: "REST", endpoint: "POST /osplus/v1/umbuchungen", payload: { from: oa.iban, to: ob.iban, amount: cents, ref }, level: "success" });
  }

  // ------------------------------------------------------------ lifecycle

  async bootstrap() {
    this.step = "onboard";
    this.emit("gateway", "l2", ["orchestrator", "token", "bond", "dvp"], "Deploy this run's contracts: cash token, bond register, DvP",
      "Before the first client, the gateway deploys three smart contracts on the L2: the S-EUR cash token, the bond register and the DvP settlement contract, and authorises the DvP contract to move both. All start empty, like the simulated OSPlus.",
      { protocol: "JSON-RPC", endpoint: "contract creation × 3, setGateway × 2" });
    const r = await this.chain.init();
    this.contracts = r.contracts;
    for (const tx of r.txs) {
      this.recordTx({ chain: "l2", kind: tx.address ? "deploy" : "config", title: tx.label, hash: tx.hash, address: tx.address });
    }
    this.emit("l2", "gateway", ["token", "bond", "dvp"],
      `Contracts ready: S-EUR ${short(r.contracts.cash)}, bond ${short(r.contracts.bond)}, DvP ${short(r.contracts.dvp)}`,
      "The gateway is the registrar of the bond register and the only minter of S-EUR. The DvP contract may move bonds and cash, but only when the gateway instructs it.",
      { payload: r, level: "success" });
  }

  async onboard(name: string, institutId: string, rolle: Kunde["rolle"], anfangssaldo: number) {
    this.step = "onboard";
    const inst = this.inst(institutId);
    this.emit("customer", "osplus", ["channel", "kyc"], `${name} onboarded at ${inst} (${rolle === "Emittent" ? "issuer" : "investor"})`,
      "An existing corporate client of the Sparkasse is enabled for tokenized securities: business account (Geschäftskonto) and securities account (Depot) in OSPlus, identification of the company and its beneficial owners (KYB).",
      { protocol: "Firmenkundenportal / Berater", endpoint: "Kundenanlage + Depoteröffnung" });
    const ref = this.nextRef("KYB");
    const kunde = this.osplus.kundeAnlegen(name, institutId, rolle, anfangssaldo, ref);
    this.emit("osplus", "gateway", ["kyc", "giro", "depot", "api"], `OSPlus: client ${kunde.kundennr}, Geschäftskonto ${kunde.girokonto}, Depot ${kunde.depot}`,
      `OSPlus publishes a 'client created' event. The Geschäftskonto starts with the client's existing deposits of ${fmtEur(anfangssaldo)}.`,
      { protocol: "Event (outbox → stream)", endpoint: "osplus.kunden.v1.KundeAngelegt", payload: kunde });
    this.emit("gateway", "gateway", ["compliance"], "Compliance checks passed",
      rolle === "Investor"
        ? "KYB, sanctions screening and the MiFID client classification (professional client) are checked before the client may buy securities."
        : "KYB, sanctions screening and the issuer approval (terms, prospectus exemption) are checked before the client may issue securities.");
    const wallet = await this.chain.provisionWallet(kunde.girokonto);
    this.wallets.set(kunde.kundennr, wallet);
    this.emit("gateway", "gateway", ["custody"], `Wallet ${short(wallet)} created for ${name}`,
      "A key pair is derived for the client inside the bank's key store (HSM). The bank holds the key, so the client never manages a crypto wallet.",
      { payload: { kundennr: kunde.kundennr, wallet } });
    this.emit("gateway", "l2", ["orchestrator", "sequencer", "dvp", "bond", "token"], `Allowlist ${name} on the bond register and the cash token`,
      "One transaction marks the wallet as verified on both contracts. Only allowlisted wallets can hold the bond or S-EUR.",
      { protocol: "JSON-RPC", endpoint: "eth_sendRawTransaction → DvPSettlement.onboard()", payload: { account: wallet, ref } });
    const r = await this.chain.onboard(wallet, ref);
    this.receipt(r, "Allowlisting", "onboard", `Allowlist ${name} (bond + cash)`, ["sequencer", "dvp"]);
    return kunde;
  }

  async issue(issuerK: string, n: number) {
    this.step = "issue";
    const k = this.osplus.kunde(issuerK);
    const wallet = this.walletOf(issuerK);
    const ref = this.nextRef("ISS");
    this.emit("customer", "gateway", ["channel", "orchestrator"], `${k.name} issues ${units(n)}: ${BOND.name}`,
      `The issuer instructs the issuance of ${fmtEur(n * BOND.nominalCents)} nominal (${units(n)} of ${fmtEur(BOND.nominalCents)}, ${BOND.couponBps / 100}% p.a., maturity ${BOND.maturity}, ISIN ${BOND.isin}).`,
      { protocol: "Issuance mandate", endpoint: "POST /gateway/v1/issuances", payload: { ...BOND, units: n } });
    if (k.rolle !== "Emittent") throw this.fail("Rejected: client is not an approved issuer", "Only approved issuers may issue securities.");
    this.emit("gateway", "gateway", ["compliance", "orchestrator"], "Registrar checks passed: terms deposited, issuer approved",
      "Under the German eWpG, a crypto security comes into existence when it is entered into a crypto securities register. The registrar (here the gateway, in reality a BaFin-licensed register keeper) checks the terms before the entry.");
    this.emit("gateway", "l2", ["sequencer", "bond"], `Register entry: ${units(n)} in the name of ${k.name}`,
      "The bond register records the new bonds in the issuer's name. They are now ready to be placed with investors.",
      { protocol: "JSON-RPC", endpoint: "eth_sendRawTransaction → BondToken.issue()", payload: { issuer: wallet, units: n, ref } });
    const t0 = Date.now();
    const r = await this.chain.issueBond(wallet, n, ref);
    this.receipt(r, `Issuance ${units(n)}`, "issue", `Issue ${units(n)} ${BOND.symbol} → ${k.name}`, ["sequencer", "bond"]);
    this.track(r, `Issue ${units(n)} → ${k.name}`, "issue", t0);
    const wp = this.osplus.depotBuchung(issuerK, BOND.isin, n, `Emission ${BOND.symbol} (Platzierungsbestand)`, ref);
    this.facts.issued = { issuer: k.name, units: (this.facts.issued?.units ?? 0) + n };
    this.emit("gateway", "osplus", ["depot"], `OSPlus Depot ${k.depot}: +${units(n)} (placement holding)`,
      "OSPlus mirrors the register entry in the issuer's Depot, so the securities view in core banking matches the register.",
      { protocol: "REST", endpoint: "POST /osplus/v1/depots/{depot}/buchungen", payload: wp, level: "success" });
  }

  async tokenize(kundennr: string, cents: number) {
    this.step = "tokenize";
    const k = this.osplus.kunde(kundennr);
    const wallet = this.walletOf(kundennr);
    const ref = this.nextRef("TOK");
    this.emit("customer", "osplus", ["channel", "giro"], `${k.name} converts ${fmtEur(cents)} into S-EUR`,
      "To pay on the chain, the investor needs cash on the chain: tokenized deposits (S-EUR) backed 1:1 by its Geschäftskonto money.",
      { protocol: "Firmenkundenportal", endpoint: "Auftrag Tokenisierung" });
    this.emit("osplus", "gateway", ["api", "orchestrator"], "OSPlus forwards the order to the gateway",
      "The EndToEndId reference travels with every following step, on both ledgers.",
      { protocol: "REST", endpoint: "POST /gateway/v1/tokenizations", payload: { endToEndId: ref, iban: k.girokonto, amount: { value: cents / 100, currency: "EUR" } } });
    if (cents > TOKENIZE_LIMIT_CENTS) throw this.fail(`Rejected: above the ${fmtEur(TOKENIZE_LIMIT_CENTS)} limit per order`, "The gateway enforces per-order limits.");
    if (this.osplus.verfuegbar(k.girokonto) < cents)
      throw this.fail("Rejected: not enough money on the Geschäftskonto", "You can only tokenize euros that are actually available.");
    this.emit("gateway", "gateway", ["compliance"], "Compliance checks passed", "Limit and AML checks passed. Now the three-step saga starts.");

    const hold = this.osplus.sperreSetzen(k.girokonto, cents, "Tokenisierung", ref);
    this.emit("gateway", "osplus", ["hold", "giro"], `Saga step 1/3: reserve ${fmtEur(cents)} (Sperre ${hold.id})`,
      "The amount is blocked on the Geschäftskonto so it can't be spent elsewhere while the tokens are created.",
      { protocol: "REST", endpoint: "POST /osplus/v1/konten/{iban}/sperren", payload: hold });
    this.emit("gateway", "l2", ["orchestrator", "sequencer", "token"], `Saga step 2/3: mint ${fmtEur(cents)} S-EUR`,
      "The gateway asks the cash token to create new S-EUR in the client's wallet. Only the gateway may do this.",
      { protocol: "JSON-RPC", endpoint: "eth_sendRawTransaction → TokenizedDeposit.mint()", payload: { to: wallet, value: cents, ref } });
    let r: TxReceipt;
    const t0 = Date.now();
    try {
      r = await this.chain.mintCash(wallet, cents, ref);
    } catch (e) {
      this.osplus.sperreAufloesen(hold.id);
      this.emit("gateway", "osplus", ["hold"], `Rolled back: reservation ${hold.id} released`,
        "The mint failed, so the saga undoes step 1. The money is fully available again and no tokens exist.", { level: "warn" });
      throw this.fail(`Mint failed: ${(e as Error).message}`, "The blockchain transaction did not succeed.");
    }
    this.receipt(r, `Mint ${fmtEur(cents)}`, "mint", `Mint ${fmtEur(cents)} S-EUR → ${k.name}`, ["sequencer", "token"]);
    this.track(r, `Mint ${fmtEur(cents)} → ${k.name}`, "mint", t0);
    const omni = this.osplus.omnibus(k.institutId);
    const [soll] = this.osplus.umbuchung(k.girokonto, omni.iban, cents, GV.TOKENISIERUNG, `Tokenisierung S-EUR ${short(r.hash)}`, ref);
    this.osplus.sperreAufloesen(hold.id);
    this.facts.tokenized = { client: k.name, cents };
    this.emit("gateway", "osplus", ["giro", "omnibus", "journal"], `Saga step 3/3: book ${fmtEur(cents)} Geschäftskonto → Sammelkonto`,
      "Now that the tokens exist, OSPlus moves the euros to the Sammelkonto that backs all S-EUR and lifts the reservation.",
      { protocol: "REST", endpoint: "POST /osplus/v1/umbuchungen", payload: { buchung: soll, txHash: r.hash }, level: "success" });
  }

  /** Atomic delivery versus payment of `n` bonds against `priceCents` S-EUR. */
  async dvp(sellerK: string, buyerK: string, n: number, priceCents: number) {
    this.step = "dvp";
    const seller = this.osplus.kunde(sellerK);
    const buyer = this.osplus.kunde(buyerK);
    const ws = this.walletOf(sellerK);
    const wb = this.walletOf(buyerK);
    const tradeId = this.nextRef("DVP");
    this.emit("customer", "gateway", ["channel", "orchestrator"], `Trade agreed: ${buyer.name} buys ${units(n)} from ${seller.name} for ${fmtEur(priceCents)}`,
      `Placement of the new bond at ${((priceCents / (n * BOND.nominalCents)) * 100).toFixed(2)}% of nominal. Both sides confirmed the trade; the gateway receives the settlement instruction.`,
      { protocol: "Settlement instruction", endpoint: "POST /gateway/v1/settlements", payload: { tradeId, isin: BOND.isin, units: n, price: priceCents / 100 } });
    const [bonds, cash] = await Promise.all([this.chain.bondBalance(ws), this.chain.cashBalance(wb)]);
    if (bonds < n) throw this.fail(`Rejected: ${seller.name} holds only ${units(bonds)}`, "The seller must hold the bonds it sells.");
    if (cash < priceCents) throw this.fail(`Rejected: ${buyer.name} has only ${fmtEur(cash)} S-EUR`, "Tokenize enough cash first (step 3).");
    this.emit("gateway", "gateway", ["compliance", "custody"], "Pre-settlement checks passed, instruction signed",
      "Both parties are allowlisted, the seller holds the bonds and the buyer holds the cash. The gateway signs the instruction with the bank's keys.");
    this.emit("gateway", "l2", ["sequencer", "dvp", "bond", "token"], `DvP: ${units(n)} → ${buyer.name}  ⇄  ${fmtEur(priceCents)} → ${seller.name}`,
      "One transaction to the DvP contract moves the bonds (delivery) and the cash (payment). Either both legs succeed or the whole transaction reverts, so no one can end up with one side only.",
      { protocol: "JSON-RPC", endpoint: "eth_sendRawTransaction → DvPSettlement.settle()", payload: { tradeId, seller: ws, buyer: wb, units: n, price: priceCents } });
    const t0 = Date.now();
    const r = await this.chain.settleDvP(tradeId, ws, wb, n, priceCents);
    this.receipt(r, `DvP ${units(n)} ⇄ ${fmtEur(priceCents)}`, "dvp", `DvP: ${units(n)} ⇄ ${fmtEur(priceCents)} (${seller.name} → ${buyer.name})`, ["sequencer", "dvp", "bond", "token"]);
    this.track(r, `DvP ${units(n)} ⇄ ${fmtEur(priceCents)}`, "dvp", t0);
    this.facts.trade = { seller: seller.name, buyer: buyer.name, units: n, price: priceCents };
    this.osplus.depotBuchung(sellerK, BOND.isin, -n, `Verkauf ${BOND.symbol} DvP ${tradeId}`, tradeId);
    this.osplus.depotBuchung(buyerK, BOND.isin, n, `Kauf ${BOND.symbol} DvP ${tradeId}`, tradeId);
    this.emit("gateway", "osplus", ["depot", "journal"], `OSPlus Depots: ${seller.depot} −${n}, ${buyer.depot} +${n}`,
      "OSPlus mirrors the delivery in both Depots and records the settlement for accounting and reporting.",
      { protocol: "REST", endpoint: "POST /osplus/v1/depots/{depot}/buchungen", level: "success" });
    this.rebalance(buyer, seller, priceCents, tradeId, `DvP ${tradeId}`);
  }

  /** Demo of atomicity: a trade the buyer can't pay reverts completely. */
  async dvpFailing(sellerK: string, buyerK: string, n: number) {
    this.step = "dvp";
    const seller = this.osplus.kunde(sellerK);
    const buyer = this.osplus.kunde(buyerK);
    const ws = this.walletOf(sellerK);
    const wb = this.walletOf(buyerK);
    const cash = await this.chain.cashBalance(wb);
    const price = cash + 50_000_00;
    const tradeId = this.nextRef("DVX");
    this.emit("customer", "gateway", ["channel", "orchestrator"], `Test: ${buyer.name} tries to buy ${units(n)} for ${fmtEur(price)} but holds only ${fmtEur(cash)}`,
      "What if the buyer can't pay? We deliberately send the trade to the chain without the gateway's pre-checks, to show that the DvP contract itself protects the seller.",
      { protocol: "Settlement instruction (test)", endpoint: "POST /gateway/v1/settlements", payload: { tradeId, units: n, price: price / 100 } });
    const before = await Promise.all([this.chain.bondBalance(ws), this.chain.cashBalance(wb)]);
    const r = await this.chain.settleDvP(tradeId, ws, wb, n, price, true);
    this.recordTx({ chain: "l2", kind: "dvp", title: `Failing trade (buyer can't pay): reverted, nothing moved`, hash: r.hash, block: r.l2Block, failed: r.status === "reverted" });
    const after = await Promise.all([this.chain.bondBalance(ws), this.chain.cashBalance(wb)]);
    const untouched = before[0] === after[0] && before[1] === after[1];
    this.failedTrade = { hash: r.hash, buyer: buyer.name, price, units: n };
    this.emit("l2", "gateway", ["dvp", "bond", "token"],
      r.status === "reverted" ? `Reverted in L2 block #${r.l2Block}: nothing moved` : `Unexpected: trade did not revert`,
      r.status === "reverted"
        ? `${before[0] < n ? `${seller.name} doesn't hold the bonds and ${buyer.name} can't pay` : `${buyer.name} can't pay`}, so the whole transaction was undone${before[0] < n ? "" : ", including the bond delivery"}. ${seller.name} still holds ${units(after[0])}, ${buyer.name} still holds ${fmtEur(after[1])}${untouched ? "" : " (balances changed!)"}. No settlement risk.`
        : "The trade should have reverted.",
      { protocol: "JSON-RPC", endpoint: "eth_getTransactionReceipt (status 0)", payload: { ...r, before, after }, link: this.txLink(r.hash), level: r.status === "reverted" ? "warn" : "error" });
  }

  async coupon(issuerK: string, holderKs: string[]) {
    this.step = "coupon";
    const issuer = this.osplus.kunde(issuerK);
    const holders = holderKs.filter((h) => h !== issuerK).map((h) => this.osplus.kunde(h));
    const ref = this.nextRef("CPN");
    const positions = await Promise.all(holders.map((h) => this.chain.bondBalance(this.walletOf(h.kundennr))));
    const total = positions.reduce((a, u) => a + u * COUPON_PER_UNIT, 0);
    this.emit("customer", "gateway", ["channel", "orchestrator"], `Coupon date: ${issuer.name} pays ${BOND.couponBps / 100}% on ${BOND.symbol}`,
      `The annual coupon is due (in the demo we pay the first coupon right away). ${fmtEur(COUPON_PER_UNIT)} per bond, ${fmtEur(total)} in total.`,
      { protocol: "Corporate action", endpoint: "POST /gateway/v1/coupons", payload: { isin: BOND.isin, perUnit: COUPON_PER_UNIT / 100, holders: holders.map((h, i) => ({ name: h.name, units: positions[i] })) } });
    const cash = await this.chain.cashBalance(this.walletOf(issuerK));
    if (cash < total) throw this.fail(`Rejected: issuer holds only ${fmtEur(cash)} S-EUR`, "The issuer needs enough S-EUR to pay the coupon.");
    this.emit("gateway", "l2", ["sequencer", "dvp", "bond", "token"], `Pay coupon: ${fmtEur(total)} to ${holders.length} holder${holders.length === 1 ? "" : "s"}`,
      "The DvP contract reads each holder's position from the bond register and pays position × coupon from the issuer's S-EUR, all in one transaction. The calculation happens on the chain, from the register itself.",
      { protocol: "JSON-RPC", endpoint: "eth_sendRawTransaction → DvPSettlement.payCoupon()", payload: { holders: holders.map((h) => this.walletOf(h.kundennr)), ref } });
    const t0 = Date.now();
    const r = await this.chain.payCoupon(holders.map((h) => this.walletOf(h.kundennr)), ref);
    this.receipt(r, `Coupon ${fmtEur(total)}`, "coupon", `Coupon ${fmtEur(total)}: ${issuer.name} → holders`, ["sequencer", "dvp", "token"]);
    this.track(r, `Coupon ${fmtEur(total)}`, "coupon", t0);
    this.facts.coupon = { total, holders: holders.map((h, i) => ({ name: h.name, units: positions[i], amount: positions[i] * COUPON_PER_UNIT })) };
    holders.forEach((h, i) => this.rebalance(issuer, h, positions[i] * COUPON_PER_UNIT, ref, `Kupon ${BOND.symbol}`));
  }

  async redeem(kundennr: string, cents: number) {
    this.step = "redeem";
    const k = this.osplus.kunde(kundennr);
    const wallet = this.walletOf(kundennr);
    const ref = this.nextRef("RED");
    this.emit("customer", "gateway", ["channel", "orchestrator"], `${k.name} takes ${fmtEur(cents)} back to its Geschäftskonto`,
      "S-EUR is always redeemable 1:1 into normal account money.", { protocol: "Firmenkundenportal", endpoint: "POST /gateway/v1/redemptions" });
    const bal = await this.chain.cashBalance(wallet);
    if (bal < cents) throw this.fail(`Rejected: ${k.name} only has ${fmtEur(bal)} S-EUR`, "You can only redeem tokens you hold.");
    this.emit("gateway", "l2", ["sequencer", "token"], `Burn ${fmtEur(cents)} S-EUR`,
      "The tokens are destroyed first, so the bank never pays out euros for tokens that still exist.",
      { protocol: "JSON-RPC", endpoint: "eth_sendRawTransaction → TokenizedDeposit.burn()", payload: { from: wallet, value: cents, ref } });
    const t0 = Date.now();
    const r = await this.chain.burnCash(wallet, cents, ref);
    this.receipt(r, `Burn ${fmtEur(cents)}`, "burn", `Burn ${fmtEur(cents)} S-EUR ← ${k.name}`, ["sequencer", "token"]);
    this.track(r, `Burn ${fmtEur(cents)} ← ${k.name}`, "burn", t0);
    this.facts.redeemed = { client: k.name, cents };
    const omni = this.osplus.omnibus(k.institutId);
    this.osplus.umbuchung(omni.iban, k.girokonto, cents, GV.RUECKTAUSCH, `Rücktausch S-EUR ${short(r.hash)}`, ref);
    this.emit("gateway", "osplus", ["omnibus", "giro", "journal"], `Book ${fmtEur(cents)} Sammelkonto → Geschäftskonto`,
      "With the tokens gone, the backing euros are released to the client's normal account.",
      { protocol: "REST", endpoint: "POST /osplus/v1/umbuchungen", level: "success" });
  }

  async reconcile(): Promise<ReconReport> {
    this.step = "reconcile";
    this.emit("gateway", "l2", ["recon", "token", "bond"], "Read cash supply, bond register and all positions from the L2",
      "Read-only queries. Nothing is written, so no transaction is needed.",
      { protocol: "JSON-RPC", endpoint: "eth_call → totalSupply(), balanceOf()" });
    const st = await this.chain.status();
    this.lastStatus = st;
    const kunden = this.osplus.state.kunden.filter((k) => this.wallets.has(k.kundennr));
    const cashOf = new Map<string, number>();
    const bondOf = new Map<string, number>();
    for (const k of kunden) {
      const w = this.walletOf(k.kundennr);
      const [c, b] = await Promise.all([this.chain.cashBalance(w), this.chain.bondBalance(w)]);
      cashOf.set(k.kundennr, c);
      bondOf.set(k.kundennr, b);
    }
    const perInstitut = INSTITUTE.map((inst) => ({
      institutId: inst.id,
      name: inst.name,
      omnibus: this.osplus.omnibus(inst.id).saldo,
      onChain: kunden.filter((k) => k.institutId === inst.id).reduce((a, k) => a + (cashOf.get(k.kundennr) ?? 0), 0),
    }));
    const omnibusTotal = perInstitut.reduce((a, p) => a + p.omnibus, 0);
    const cashSupply = st.cash?.totalSupply ?? 0;
    const cashOk = omnibusTotal === cashSupply && perInstitut.every((p) => p.omnibus === p.onChain);
    const perKunde = kunden.map((k) => ({
      kundennr: k.kundennr,
      name: k.name,
      depot: k.depot,
      osplus: this.osplus.bestand(k.kundennr, BOND.isin),
      onChain: bondOf.get(k.kundennr) ?? 0,
    }));
    const osplusTotal = perKunde.reduce((a, p) => a + p.osplus, 0);
    const registerTotal = st.bond?.totalSupply ?? 0;
    const secOk = registerTotal === osplusTotal && perKunde.every((p) => p.osplus === p.onChain);
    const report: ReconReport = {
      ts: Date.now(),
      cash: { totalSupply: cashSupply, omnibusTotal, perInstitut, ok: cashOk },
      securities: { isin: BOND.isin, registerTotal, osplusTotal, perKunde, ok: secOk },
      ok: cashOk && secOk,
    };
    this.lastRecon = report;
    this.emit("gateway", "osplus", ["recon", "omnibus", "depot"],
      report.ok
        ? `Books match: cash ${fmtEur(omnibusTotal)} = S-EUR supply, securities ${units(registerTotal)} = OSPlus Depots`
        : `Mismatch found (cash ${cashOk ? "ok" : "BREAK"}, securities ${secOk ? "ok" : "BREAK"})`,
      report.ok
        ? "Every S-EUR is backed by one euro on a Sammelkonto, and every bond in the register appears in exactly the right OSPlus Depot."
        : "The ledgers differ. In production this raises an alert for operations.",
      { protocol: "REST", endpoint: "POST /osplus/v1/abstimmungen", payload: report, level: report.ok ? "success" : "error" });
    return report;
  }

  // ------------------------------------------------------------ settlement

  /** Advance settlement stage of tracked txs from a fresh chain status (events grouped per batch / game). */
  observe(st: ChainStatus) {
    this.lastStatus = st;
    if (st.kind === "live") this.explorers = { l1: st.l1.explorer ?? this.explorers.l1, l2: st.l2.explorer ?? this.explorers.l2 };
    const l1Link = (h?: string) => {
      const url = explorerUrl(this.explorers.l1, "tx", h);
      return url ? { label: "View on RL1 explorer", url } : undefined;
    };
    const names = (txs: TrackedTx[]) => txs.map((t) => t.label).join(", ");

    // unsafe -> safe: the batch containing the block is on L1
    const byBatch = new Map<string, TrackedTx[]>();
    for (const t of this.tracked.filter((t) => t.stage === "unsafe" && st.l2.safe >= t.l2Block)) {
      t.stage = "safe";
      t.safeAt = Date.now();
      // simulation knows exact L2 ranges; live: the most recent batch posted after the tx is the
      // one that just moved the safe head past it (we poll every few seconds)
      const batch =
        st.batches.find((b) => b.l2From !== undefined && b.l2From <= t.l2Block && (b.l2To ?? 0) >= t.l2Block) ??
        st.batches.filter((b) => b.l2From === undefined && b.ts >= t.l2Timestamp).sort((a, b) => b.ts - a.ts)[0];
      t.batchTx = batch?.l1TxHash;
      t.batchL1Block = batch?.l1Block;
      const key = batch?.l1TxHash ?? `safe-${st.l2.safe}`;
      byBatch.set(key, [...(byBatch.get(key) ?? []), t]);
    }
    for (const [, txs] of byBatch) {
      const batch = st.batches.find((b) => b.l1TxHash === txs[0].batchTx);
      if (batch) {
        const known = this.txs.find((x) => x.hash === batch.l1TxHash);
        if (known) known.covers = [...(known.covers ?? []), ...txs.map((t) => t.label)];
        else
          this.recordTx({
            chain: "l1",
            kind: "batch",
            step: "batch",
            title: `Batch (blob) publishing the L2 blocks on RL1`,
            hash: batch.l1TxHash,
            block: batch.l1Block,
            covers: txs.map((t) => t.label),
          });
      }
      this.emitRaw({
        step: "batch",
        from: "l2",
        to: "l1",
        components: ["batcher", "batchInbox"],
        title: batch
          ? `Published on RL1 in L1 block #${batch.l1Block}. Now SAFE: ${names(txs)}`
          : `L2 safe head passed block #${txs[0].l2Block}. Now SAFE: ${names(txs)}`,
        explain:
          "op-batcher compressed the recent L2 blocks and posted them to RL1 as a blob. Anyone can now rebuild these transactions from RL1 data. We no longer depend on the sequencer alone.",
        protocol: batch && batch.blobs === 0 ? "RL1 calldata tx" : "RL1 blob tx (EIP-4844)",
        endpoint: "→ BatchInbox",
        payload: batch ?? { safeHead: st.l2.safe, txs: txs.map((t) => t.hash) },
        level: "success",
        link: l1Link(batch?.l1TxHash),
      });
    }

    // safe -> finalized: the L1 block holding the batch is finalized
    const nowFinal = this.tracked.filter((t) => t.stage === "safe" && st.l2.finalized >= t.l2Block);
    for (const t of nowFinal) {
      t.stage = "finalized";
      t.finalizedAt = Date.now();
    }
    if (nowFinal.length) {
      this.emitRaw({
        step: "finality",
        from: "l1",
        to: "gateway",
        components: ["batchInbox", "recon"],
        title: `RL1 finalized. Now FINAL: ${names(nowFinal)}`,
        explain:
          "The RL1 block containing the batch is now finalized by RL1's validators, so it can't be reverted. These bookings are irrevocable.",
        protocol: "RL1 finality",
        endpoint: "eth_getBlockByNumber('finalized')",
        payload: { l1Finalized: st.l1.finalized, l2Finalized: st.l2.finalized },
        level: "success",
      });
    }

    // output root proposed in a dispute game, then resolved after the challenge window
    const proposals = [...st.proposals].sort((a, b) => a.index - b.index);
    const byGame = new Map<number, TrackedTx[]>();
    for (const t of this.tracked) {
      if (t.proposalIndex !== undefined) continue;
      const p = proposals.find((p) => covers(p, t));
      if (!p) continue;
      t.proposalIndex = p.index;
      t.gameAddress = p.gameAddress;
      t.gameTx = p.txHash;
      byGame.set(p.index, [...(byGame.get(p.index) ?? []), t]);
    }
    for (const [idx, txs] of byGame) {
      const p = proposals.find((p) => p.index === idx)!;
      const known = this.txs.find((x) => x.kind === "proposal" && x.address === p.gameAddress);
      if (known) known.covers = [...(known.covers ?? []), ...txs.map((t) => t.label)];
      else
        this.recordTx({
          chain: "l1",
          kind: "proposal",
          step: "proposal",
          title: `Dispute game #${p.index}: L2 state proposed on RL1`,
          hash: p.txHash,
          address: p.gameAddress,
          covers: txs.map((t) => t.label),
        });
      this.emitRaw({
        step: "proposal",
        from: "l2",
        to: "l1",
        components: ["proposer", "disputeGame"],
        title: `L2 state proposed on RL1 in dispute game #${p.index}, covering: ${names(txs)}`,
        explain:
          "op-proposer published a fingerprint (output root) of the whole L2 state that includes these transactions. The challenge window is now running: for 3.5 days on the real network, anyone can prove it wrong.",
        protocol: "RL1 tx",
        endpoint: "DisputeGameFactory.create()",
        payload: p,
        level: "info",
        link: p.txHash ? l1Link(p.txHash) : explorerUrl(this.explorers.l1, "address", p.gameAddress) ? { label: "View game on RL1 explorer", url: explorerUrl(this.explorers.l1, "address", p.gameAddress)! } : undefined,
      });
    }
    for (const p of proposals.filter((p) => p.status === "DEFENDER_WINS")) {
      const txs = this.tracked.filter((t) => t.proposalIndex === p.index && !t.resolved);
      if (!txs.length) continue;
      for (const t of txs) t.resolved = true;
      this.emitRaw({
        step: "proposal",
        from: "l1",
        to: "gateway",
        components: ["disputeGame", "portal"],
        title: `Dispute game #${p.index} resolved: state accepted`,
        explain:
          "Nobody challenged the proposed state during the window, so RL1 accepts it. Assets could now be withdrawn from the L2 to RL1 based on this state.",
        protocol: "RL1 state",
        endpoint: "DisputeGame.resolve()",
        payload: p,
        level: "success",
      });
    }
  }
}
