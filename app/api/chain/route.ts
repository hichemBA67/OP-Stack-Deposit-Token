import { NextResponse } from "next/server";
import * as live from "@/lib/chain/live-server";
import type { Hex } from "@/lib/types";

// Vercel: allow enough time for an L2 receipt (OP Stack blocks are ~2s).
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(live.publicLiveConfig());
}

type Body =
  | { action: "init"; token?: string }
  | { action: "status"; token?: string }
  | { action: "provisionWallet"; iban: string }
  | { action: "setAllowed"; token?: string; account: Hex; ref: string }
  | { action: "mint"; token?: string; to: Hex; cents: number; ref: string }
  | { action: "burn"; token?: string; from: Hex; cents: number; ref: string }
  | { action: "transfer"; token?: string; from: Hex; to: Hex; cents: number; ref: string }
  | { action: "balanceOf"; token?: string; account: Hex };

export async function POST(req: Request) {
  if (!live.liveConfigured()) {
    return NextResponse.json({ error: "Live mode not configured (L1_RPC_URL, L2_RPC_URL, GATEWAY_PRIVATE_KEY)" }, { status: 503 });
  }
  if (!live.checkAccess(req.headers.get("x-demo-token"))) {
    return NextResponse.json({ error: "Invalid demo access token" }, { status: 401 });
  }
  const b = (await req.json()) as Body;
  try {
    switch (b.action) {
      case "init":
        return NextResponse.json(await live.init());
      case "status":
        return NextResponse.json(await live.status(b.token));
      case "provisionWallet":
        return NextResponse.json({ address: live.provisionWallet(b.iban) });
      case "setAllowed":
        return NextResponse.json(await live.setAllowed(b.token, b.account, b.ref));
      case "mint":
        return NextResponse.json(await live.mint(b.token, b.to, b.cents, b.ref));
      case "burn":
        return NextResponse.json(await live.burn(b.token, b.from, b.cents, b.ref));
      case "transfer":
        return NextResponse.json(await live.transfer(b.token, b.from, b.to, b.cents, b.ref));
      case "balanceOf":
        return NextResponse.json({ balance: await live.balanceOf(b.token, b.account) });
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = (e as Error).message.split("\n")[0];
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
