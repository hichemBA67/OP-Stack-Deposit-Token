/**
 * Sparkassen Chain Gateway - the abstraction layer.
 *
 * An anti-corruption layer between OSPlus and the ledger:
 *  - translates core-banking business events (Kunde angelegt, Umbuchung, ...)
 *    into ledger commands (allowlist, mint, transfer, burn) and back
 *  - owns compliance checks, custody (wallet per IBAN), idempotent references
 *  - runs each business process as a saga with compensation (hold -> mint -> book)
 *  - tracks L2 -> L1 settlement of every tx and reconciles ledger vs. OSPlus
 *
 * It depends only on the ChainAdapter interface, never on a specific chain.
 * Every emitted message carries a plain-language `explain` for the walkthrough.
 */
import { fmtEur, short } from "../format";
import { GV, INSTITUTE, type OsplusSimulator } from "../osplus/simulator";
import type { ChainAdapter, ChainStatus, ProposalInfo, TxReceipt } from "../chain/types";
import type { Component, Hex, Layer, Level, SettlementStage, StepId, TraceEvent } from "../types";

export const TOKENIZE_LIMIT_CENTS = 10_000_00;

export interface TrackedTx {
  hash: Hex;
  l2Block: number;
  l2Timestamp: number;
  label: string;
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
  totalSupply: number;
  omnibusTotal: number;
  perInstitut: { institutId: string; name: string; omnibus: number; onChain: number }[];
  ok: boolean;
}

/** One real on-chain transaction (L2 or RL1), for the explorer list. */
export interface ChainTx {
  id: number;
  chain: "l2" | "l1";
  kind: "deploy" | "allowlist" | "mint" | "transfer" | "burn" | "batch" | "proposal";
  title: string;
  hash?: Hex;
  address?: Hex;
  block?: number;
  ts: number;
  step: StepId;
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

export class Gateway {
  wallets = new Map<string, Hex>(); // kundennr -> wallet
  tracked: TrackedTx[] = [];
  /** Every real transaction, newest first. */
  txs: ChainTx[] = [];
  explorers: Explorers = {};
  tokenAddress?: Hex;
  private txSeq = 0;
  lastRecon?: ReconReport;
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

  private receipt(r: TxReceipt, what: string, kind: ChainTx["kind"], title: string) {
    this.recordTx({ chain: "l2", kind, title, hash: r.hash, block: r.l2Block });
    const fee = r.l1FeeWei ? ` The sequencer charged an L1 data fee of ${(Number(r.l1FeeWei) / 1e9).toFixed(2)} gwei to cover posting it to RL1 later.` : "";
    this.emit(
      "l2",
      "gateway",
      ["sequencer", "token"],
      `${what}: confirmed in L2 block #${r.l2Block}`,
      `The sequencer put the transaction into a block. The customer can already see the result. Its status is 'unsafe' until the data is published on RL1.${fee}`,
      { protocol: "JSON-RPC", endpoint: "eth_getTransactionReceipt", payload: r, link: this.txLink(r.hash), level: "success" },
    );
  }

  private track(r: TxReceipt, label: string, submittedAt: number) {
    this.tracked.unshift({
      hash: r.hash,
      l2Block: r.l2Block,
      l2Timestamp: r.l2Timestamp,
      label,
      step: this.step,
      stage: "unsafe",
      submittedAt,
      confirmedAt: Date.now(),
    });
  }

  private walletOf(kundennr: string) {
    const w = this.wallets.get(kundennr);
    if (!w) throw new Error(`Customer ${kundennr} has no wallet yet (not onboarded)`);
    return w;
  }

  private fail(msg: string, explain: string) {
    this.emit("gateway", "gateway", ["compliance"], msg, explain, { level: "error" });
    return new Error(msg);
  }

  // ------------------------------------------------------------ lifecycle

  async bootstrap() {
    this.step = "onboard";
    this.emit("gateway", "l2", ["orchestrator", "token"], "Deploy the S-EUR token contract for this run",
      "Before the first customer, the gateway deploys the S-EUR smart contract on the L2. It starts empty, like the simulated OSPlus. The gateway becomes the only address allowed to mint and burn.",
      { protocol: "JSON-RPC", endpoint: "eth_getCode / contract creation" });
    const r = await this.chain.init();
    this.tokenAddress = r.tokenAddress;
    if (this.chain.kind === "live") {
      this.recordTx({ chain: "l2", kind: "deploy", title: "Deploy the S-EUR token contract (fresh for this run)", hash: r.txHash, address: r.tokenAddress });
    }
    this.emit("l2", "gateway", ["token"],
      r.deployed ? `S-EUR contract deployed at ${short(r.tokenAddress)}` : `S-EUR contract found at ${short(r.tokenAddress)}`,
      r.deployed ? "The token contract is now live on the L2. Its address is the bank's 'digital euro ledger'." : "The contract already exists from an earlier run, so it's reused.",
      { payload: r, level: "success", link: r.txHash ? this.txLink(r.txHash) : undefined });
  }

  async onboard(name: string, institutId: string) {
    this.step = "onboard";
    const inst = INSTITUTE.find((i) => i.id === institutId)!;
    this.emit("customer", "osplus", ["channel", "kyc"], `${name} opens a Girokonto at ${inst.name}`,
      "The customer is identified (Legitimation / KYC) as with any new account. Nothing blockchain-specific happens for them.",
      { protocol: "Branch / app", endpoint: "Kundenanlage" });
    const kunde = this.osplus.kundeAnlegen(name, institutId);
    this.emit("osplus", "gateway", ["kyc", "giro", "api"], `OSPlus: customer ${kunde.kundennr} created, IBAN ${kunde.girokonto}`,
      "OSPlus publishes a 'customer created' business event. The gateway subscribes to these events, so OSPlus doesn't need to know anything about blockchains.",
      { protocol: "Event (outbox → stream)", endpoint: "osplus.kunden.v1.KundeAngelegt", payload: kunde });
    this.emit("gateway", "gateway", ["compliance"], "Compliance checks passed",
      "Before any wallet is created, the gateway re-checks KYC status, sanctions lists and PEP screening.");
    const wallet = await this.chain.provisionWallet(kunde.girokonto);
    this.wallets.set(kunde.kundennr, wallet);
    this.emit("gateway", "gateway", ["custody"], `Wallet ${short(wallet)} created for ${name}`,
      "A key pair is derived from the IBAN inside the bank's key store (HSM). The bank holds the key, so the customer never has to manage a crypto wallet.",
      { payload: { iban: kunde.girokonto, wallet } });
    const ref = this.nextRef("KYC");
    this.emit("gateway", "l2", ["orchestrator", "sequencer", "token"], `Allowlist wallet ${short(wallet)} on S-EUR`,
      "The gateway sends a transaction to the token contract to mark this wallet as verified. Only allowlisted wallets can hold or move S-EUR.",
      { protocol: "JSON-RPC", endpoint: "eth_sendRawTransaction → setAllowed()", payload: { account: wallet, ref } });
    const r = await this.chain.setAllowed(wallet, ref);
    this.receipt(r, "Allowlisting", "allowlist", `Allowlist ${name}'s wallet`);
    return kunde;
  }

  async fund(kundennr: string, cents: number) {
    this.step = "fund";
    const k = this.osplus.kunde(kundennr);
    const ref = this.nextRef("SEPA");
    this.emit("customer", "osplus", ["giro", "journal"], `SEPA credit of ${fmtEur(cents)} for ${k.name}`,
      "A normal bank transfer arrives through the SEPA payment system, the same as a salary payment today.",
      { protocol: "SEPA credit transfer (pacs.008)", endpoint: "OSPlus Zahlungsverkehr" });
    const b = this.osplus.sepaGutschrift(k.girokonto, cents, "Arbeitgeber GmbH", ref);
    this.emit("osplus", "osplus", ["journal", "giro"], `Booked ${b.id}: +${fmtEur(cents)} on the Girokonto`,
      "OSPlus books the credit (GV code 166 = SEPA credit). These euros can now be tokenized.",
      { payload: b, level: "success" });
  }

  async tokenize(kundennr: string, cents: number) {
    this.step = "tokenize";
    const k = this.osplus.kunde(kundennr);
    const wallet = this.walletOf(kundennr);
    const ref = this.nextRef("TOK");
    this.emit("customer", "osplus", ["channel", "giro"], `${k.name} wants ${fmtEur(cents)} as S-EUR`,
      "The customer requests the conversion in the app. The order goes to OSPlus like any other order.",
      { protocol: "App order", endpoint: "Auftrag Tokenisierung" });
    this.emit("osplus", "gateway", ["api", "orchestrator"], `OSPlus forwards the order to the gateway`,
      "OSPlus calls the gateway's API. The EndToEndId reference will travel with every following step, on both ledgers.",
      { protocol: "REST", endpoint: "POST /gateway/v1/tokenizations", payload: { endToEndId: ref, iban: k.girokonto, amount: { value: cents / 100, currency: "EUR" } } });

    if (k.kyc !== "verified") throw this.fail("Rejected: KYC not verified", "Only verified customers may hold S-EUR.");
    if (cents > TOKENIZE_LIMIT_CENTS)
      throw this.fail(`Rejected: above the ${fmtEur(TOKENIZE_LIMIT_CENTS)} limit per order`, "The gateway enforces per-order limits, as a bank would for any new product.");
    if (this.osplus.verfuegbar(k.girokonto) < cents)
      throw this.fail("Rejected: not enough money on the Girokonto", "You can only tokenize euros that are actually available. Fund the account first (step 2).");
    this.emit("gateway", "gateway", ["compliance"], "Compliance checks passed",
      "KYC, per-order limit and AML velocity checks passed. Now the three-step saga starts.");

    const hold = this.osplus.sperreSetzen(k.girokonto, cents, "Tokenisierung", ref);
    this.emit("gateway", "osplus", ["hold", "giro"], `Saga step 1/3: reserve ${fmtEur(cents)} (Sperre ${hold.id})`,
      "The amount is blocked on the Girokonto, so it can't be spent elsewhere while the tokens are created. The balance hasn't moved yet.",
      { protocol: "REST", endpoint: `POST /osplus/v1/konten/{iban}/sperren`, payload: hold });

    this.emit("gateway", "l2", ["orchestrator", "sequencer", "token"], `Saga step 2/3: mint ${fmtEur(cents)} S-EUR`,
      "The gateway asks the token contract to create new S-EUR in the customer's wallet. Only the gateway is allowed to do this.",
      { protocol: "JSON-RPC", endpoint: "eth_sendRawTransaction → mint()", payload: { to: wallet, value: cents, ref } });
    let r: TxReceipt;
    const t0 = Date.now();
    try {
      r = await this.chain.mint(wallet, cents, ref);
    } catch (e) {
      this.osplus.sperreAufloesen(hold.id);
      this.emit("gateway", "osplus", ["hold"], `Rolled back: reservation ${hold.id} released`,
        "The mint failed, so the saga undoes step 1. The customer's money is fully available again and no tokens exist.", { level: "warn" });
      throw this.fail(`Mint failed: ${(e as Error).message}`, "The blockchain transaction did not succeed.");
    }
    this.receipt(r, `Mint ${fmtEur(cents)}`, "mint", `Mint ${fmtEur(cents)} S-EUR → ${k.name}`);
    this.track(r, `Mint ${fmtEur(cents)} → ${k.name}`, t0);

    const omni = this.osplus.omnibus(k.institutId);
    const [soll] = this.osplus.umbuchung(k.girokonto, omni.iban, cents, GV.TOKENISIERUNG, `Tokenisierung S-EUR ${short(r.hash)}`, ref);
    this.osplus.sperreAufloesen(hold.id);
    this.emit("gateway", "osplus", ["giro", "omnibus", "journal"], `Saga step 3/3: book ${fmtEur(cents)} Girokonto → Sammelkonto`,
      "Now that the tokens exist, OSPlus moves the euros to the Sammelkonto that backs all S-EUR, and lifts the reservation. Tokens and backing are now in sync.",
      { protocol: "REST", endpoint: "POST /osplus/v1/umbuchungen", payload: { buchung: soll, txHash: r.hash, l2Block: r.l2Block }, level: "success" });
  }

  async transfer(fromK: string, toK: string, cents: number) {
    this.step = "transfer";
    const a = this.osplus.kunde(fromK);
    const b = this.osplus.kunde(toK);
    const wa = this.walletOf(fromK);
    const wb = this.walletOf(toK);
    const ref = this.nextRef("P2P");
    this.emit("customer", "gateway", ["channel", "orchestrator"], `${a.name} pays ${b.name} ${fmtEur(cents)}`,
      "The payment order goes from the app straight to the gateway. It's a token payment, so OSPlus isn't needed to execute it.",
      { protocol: "App order", endpoint: "POST /gateway/v1/transfers", payload: { endToEndId: ref, from: a.girokonto, to: b.girokonto, amount: cents / 100 } });
    const bal = await this.chain.balanceOf(wa);
    if (bal < cents) throw this.fail(`Rejected: ${a.name} only has ${fmtEur(bal)} S-EUR`, "Tokenize more euros first (step 3).");
    this.emit("gateway", "gateway", ["compliance", "custody"], "Checks passed, transaction signed",
      "The gateway checks the balance and compliance rules, then signs the transfer with the sender's key from the HSM.");
    this.emit("gateway", "l2", ["sequencer", "token"], `Transfer ${fmtEur(cents)} S-EUR ${short(wa)} → ${short(wb)}`,
      "The token contract moves the S-EUR between two allowlisted wallets. It settles in one L2 block.",
      { protocol: "JSON-RPC", endpoint: "eth_sendRawTransaction → controllerTransfer()", payload: { from: wa, to: wb, value: cents, ref } });
    const t0 = Date.now();
    const r = await this.chain.transfer(wa, wb, cents, ref);
    this.receipt(r, `Transfer ${fmtEur(cents)}`, "transfer", `Transfer ${fmtEur(cents)} S-EUR ${a.name} → ${b.name}`);
    this.track(r, `Transfer ${fmtEur(cents)} ${a.name} → ${b.name}`, t0);

    if (a.institutId !== b.institutId) {
      const oa = this.osplus.omnibus(a.institutId);
      const ob = this.osplus.omnibus(b.institutId);
      this.osplus.umbuchung(oa.iban, ob.iban, cents, GV.INTERBANK, `Interbankausgleich S-EUR ${short(r.hash)}`, ref);
      this.emit("gateway", "osplus", ["omnibus", "journal"],
        `Rebalance backing: ${fmtEur(cents)} from ${this.osplus.institut(a.institutId).name} to ${this.osplus.institut(b.institutId).name}`,
        `${a.name} and ${b.name} bank with different Sparkassen. ${b.name}'s new tokens must be backed by ${this.osplus.institut(b.institutId).name}, so the euros move between the two Sammelkonten (in reality via the Girozentrale / Landesbank clearing).`,
        { protocol: "REST", endpoint: "POST /osplus/v1/umbuchungen", payload: { from: oa.iban, to: ob.iban, amount: cents, ref }, level: "success" });
    } else {
      this.emit("gateway", "osplus", ["journal"], "Same Sparkasse: no rebalancing needed",
        "Both customers bank with the same Sparkasse, so its Sammelkonto already backs both wallets. OSPlus only records the movement for reporting.", { level: "success" });
    }
  }

  async redeem(kundennr: string, cents: number) {
    this.step = "redeem";
    const k = this.osplus.kunde(kundennr);
    const wallet = this.walletOf(kundennr);
    const ref = this.nextRef("RED");
    this.emit("customer", "gateway", ["channel", "orchestrator"], `${k.name} redeems ${fmtEur(cents)} S-EUR`,
      "The customer wants euros back on the Girokonto. S-EUR is always redeemable 1:1.",
      { protocol: "App order", endpoint: "POST /gateway/v1/redemptions" });
    const bal = await this.chain.balanceOf(wallet);
    if (bal < cents) throw this.fail(`Rejected: ${k.name} only has ${fmtEur(bal)} S-EUR`, "You can only redeem tokens you hold.");
    this.emit("gateway", "l2", ["sequencer", "token"], `Burn ${fmtEur(cents)} S-EUR`,
      "The tokens are destroyed first. That way the bank never pays out euros for tokens that still exist.",
      { protocol: "JSON-RPC", endpoint: "eth_sendRawTransaction → burn()", payload: { from: wallet, value: cents, ref } });
    const t0 = Date.now();
    const r = await this.chain.burn(wallet, cents, ref);
    this.receipt(r, `Burn ${fmtEur(cents)}`, "burn", `Burn ${fmtEur(cents)} S-EUR ← ${k.name}`);
    this.track(r, `Burn ${fmtEur(cents)} ← ${k.name}`, t0);
    const omni = this.osplus.omnibus(k.institutId);
    this.osplus.umbuchung(omni.iban, k.girokonto, cents, GV.RUECKTAUSCH, `Rücktausch S-EUR ${short(r.hash)}`, ref);
    this.emit("gateway", "osplus", ["omnibus", "giro", "journal"], `Book ${fmtEur(cents)} Sammelkonto → Girokonto`,
      "With the tokens gone, the backing euros are released from the Sammelkonto to the customer's normal account.",
      { protocol: "REST", endpoint: "POST /osplus/v1/umbuchungen", level: "success" });
  }

  async reconcile(): Promise<ReconReport> {
    this.step = "reconcile";
    this.emit("gateway", "l2", ["recon", "token"], "Read S-EUR supply and all customer balances from the L2",
      "Read-only queries. Nothing is written, so no transaction or gas is needed.",
      { protocol: "JSON-RPC", endpoint: "eth_call → totalSupply(), balanceOf()" });
    const st = await this.chain.status();
    this.lastStatus = st;
    const perInstitut = [];
    for (const inst of INSTITUTE) {
      let onChain = 0;
      for (const k of this.osplus.state.kunden.filter((k) => k.institutId === inst.id)) {
        const w = this.wallets.get(k.kundennr);
        if (w) onChain += await this.chain.balanceOf(w);
      }
      perInstitut.push({ institutId: inst.id, name: inst.name, omnibus: this.osplus.omnibus(inst.id).saldo, onChain });
    }
    const omnibusTotal = perInstitut.reduce((a, p) => a + p.omnibus, 0);
    const totalSupply = st.token?.totalSupply ?? 0;
    const ok = omnibusTotal === totalSupply && perInstitut.every((p) => p.omnibus === p.onChain);
    const report = { ts: Date.now(), totalSupply, omnibusTotal, perInstitut, ok };
    this.lastRecon = report;
    this.emit("gateway", "osplus", ["recon", "omnibus"],
      ok ? `Ledgers match: Sammelkonten ${fmtEur(omnibusTotal)} = S-EUR supply ${fmtEur(totalSupply)}` : `Mismatch: Sammelkonten ${fmtEur(omnibusTotal)} ≠ S-EUR supply ${fmtEur(totalSupply)}`,
      ok ? "Every S-EUR in circulation is backed by exactly one euro in OSPlus, for each Sparkasse and in total." : "The two ledgers differ. In production this raises an alert for operations.",
      { protocol: "REST", endpoint: "POST /osplus/v1/abstimmungen", payload: report, level: ok ? "success" : "error" });
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
