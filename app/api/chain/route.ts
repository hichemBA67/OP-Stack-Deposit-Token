import { NextResponse } from "next/server";
import * as live from "@/lib/chain/live-server";
import type { RunContracts } from "@/lib/chain/live-server";
import type { Hex } from "@/lib/types";

// Vercel: allow enough time for L2 receipts (OP Stack blocks are ~2s; init deploys 5 txs).
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(live.publicLiveConfig());
}

type Body = { contracts?: RunContracts } & (
  | { action: "init" }
  | { action: "status" }
  | { action: "provisionWallet"; id: string }
  | { action: "onboard"; account: Hex; ref: string }
  | { action: "issueBond"; issuer: Hex; units: number; ref: string }
  | { action: "mintCash"; to: Hex; cents: number; ref: string }
  | { action: "burnCash"; from: Hex; cents: number; ref: string }
  | { action: "settleDvP"; tradeId: string; seller: Hex; buyer: Hex; units: number; price: number; allowRevert?: boolean }
  | { action: "payCoupon"; holders: Hex[]; ref: string }
  | { action: "cashBalance"; account: Hex }
  | { action: "bondBalance"; account: Hex }
);

export async function POST(req: Request) {
  if (!live.liveConfigured()) {
    return NextResponse.json({ error: "Live mode not configured (GATEWAY_PRIVATE_KEY missing)" }, { status: 503 });
  }
  if (!live.checkAccess(req.headers.get("x-demo-token"))) {
    return NextResponse.json({ error: "Invalid demo access token" }, { status: 401 });
  }
  const b = (await req.json()) as Body;
  const run = b.contracts ?? {};
  try {
    switch (b.action) {
      case "init":
        return NextResponse.json(await live.init());
      case "status":
        return NextResponse.json(await live.status(run));
      case "provisionWallet":
        return NextResponse.json({ address: live.provisionWallet(b.id) });
      case "onboard":
        return NextResponse.json(await live.onboard(run, b.account, b.ref));
      case "issueBond":
        return NextResponse.json(await live.issueBond(run, b.issuer, b.units, b.ref));
      case "mintCash":
        return NextResponse.json(await live.mintCash(run, b.to, b.cents, b.ref));
      case "burnCash":
        return NextResponse.json(await live.burnCash(run, b.from, b.cents, b.ref));
      case "settleDvP":
        return NextResponse.json(await live.settleDvP(run, b.tradeId, b.seller, b.buyer, b.units, b.price, b.allowRevert));
      case "payCoupon":
        return NextResponse.json(await live.payCoupon(run, b.holders, b.ref));
      case "cashBalance":
        return NextResponse.json({ balance: await live.cashBalance(run, b.account) });
      case "bondBalance":
        return NextResponse.json({ balance: await live.bondBalance(run, b.account) });
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = (e as Error).message.split("\n")[0];
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
