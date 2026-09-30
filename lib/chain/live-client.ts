import type { Hex } from "../types";
import type { ChainAdapter, ChainStatus, TxReceipt } from "./types";

/** Browser-side adapter that forwards every ledger call to /api/chain (where the key lives). */
export class LiveChainClient implements ChainAdapter {
  kind = "live" as const;
  constructor(
    private token: () => string | undefined,
    private setToken: (a: Hex) => void,
    private accessToken: () => string | undefined,
  ) {}

  private async call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch("/api/chain", {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-token": this.accessToken() ?? "" },
      body: JSON.stringify({ action, token: this.token(), ...body }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json as T;
  }

  async init() {
    const r = await this.call<{ tokenAddress: Hex; deployed: boolean; txHash?: Hex }>("init");
    this.setToken(r.tokenAddress);
    return r;
  }
  async provisionWallet(iban: string) {
    return (await this.call<{ address: Hex }>("provisionWallet", { iban })).address;
  }
  setAllowed(account: Hex, ref: string) {
    return this.call<TxReceipt>("setAllowed", { account, ref });
  }
  mint(to: Hex, cents: number, ref: string) {
    return this.call<TxReceipt>("mint", { to, cents, ref });
  }
  burn(from: Hex, cents: number, ref: string) {
    return this.call<TxReceipt>("burn", { from, cents, ref });
  }
  transfer(from: Hex, to: Hex, cents: number, ref: string) {
    return this.call<TxReceipt>("transfer", { from, to, cents, ref });
  }
  async balanceOf(account: Hex) {
    return (await this.call<{ balance: number }>("balanceOf", { account })).balance;
  }
  status() {
    return this.call<ChainStatus>("status");
  }
}
