import type { Hex } from "../types";
import type { ChainAdapter, ChainStatus, Contracts, TxReceipt } from "./types";

/** Browser-side adapter that forwards every ledger call to /api/chain (where the key lives). */
export class LiveChainClient implements ChainAdapter {
  kind = "live" as const;
  /** This run's contracts, deployed by init(). */
  private contracts?: Contracts;

  constructor(private accessToken: () => string | undefined) {}

  private async call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch("/api/chain", {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-token": this.accessToken() ?? "" },
      body: JSON.stringify({ action, contracts: this.contracts, ...body }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json as T;
  }

  async init() {
    const r = await this.call<Awaited<ReturnType<ChainAdapter["init"]>>>("init");
    this.contracts = r.contracts;
    return r;
  }
  async provisionWallet(id: string) {
    return (await this.call<{ address: Hex }>("provisionWallet", { id })).address;
  }
  onboard(account: Hex, ref: string) {
    return this.call<TxReceipt>("onboard", { account, ref });
  }
  issueBond(issuer: Hex, units: number, ref: string) {
    return this.call<TxReceipt>("issueBond", { issuer, units, ref });
  }
  mintCash(to: Hex, cents: number, ref: string) {
    return this.call<TxReceipt>("mintCash", { to, cents, ref });
  }
  burnCash(from: Hex, cents: number, ref: string) {
    return this.call<TxReceipt>("burnCash", { from, cents, ref });
  }
  settleDvP(tradeId: string, seller: Hex, buyer: Hex, units: number, price: number, allowRevert = false) {
    return this.call<TxReceipt>("settleDvP", { tradeId, seller, buyer, units, price, allowRevert });
  }
  payCoupon(holders: Hex[], ref: string) {
    return this.call<TxReceipt>("payCoupon", { holders, ref });
  }
  async cashBalance(account: Hex) {
    return (await this.call<{ balance: number }>("cashBalance", { account })).balance;
  }
  async bondBalance(account: Hex) {
    return (await this.call<{ balance: number }>("bondBalance", { account })).balance;
  }
  status() {
    return this.call<ChainStatus>("status");
  }
}
