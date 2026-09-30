import "server-only";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  isAddress,
  parseAbi,
  parseAbiItem,
  type Address,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainConfig } from "viem/op-stack";
import { optimismSepolia } from "viem/chains";
import type { Hex } from "../types";
import { depositTokenAbi, depositTokenBytecode } from "./artifact";
import { deriveCustodyAccount, refToBytes32 } from "./custody";
import type { BatchInfo, ChainStatus, GameStatus, ProposalInfo, TxReceipt } from "./types";

/**
 * Live chain access for the gateway. Runs only on the server (Next.js route
 * handler / Vercel function) because it holds the gateway's signing key.
 *
 * Works against any OP Stack chain: a local devnet (Kurtosis), OP Sepolia, or a
 * chain you deployed with op-deployer on Sepolia / Mainnet.
 */

/**
 * Built-in preset: OP Sepolia (L2) settling on RL1 (here: Sepolia). Any value can be overridden
 * with an environment variable. The gateway key is deliberately NOT part of the preset: it must
 * come from GATEWAY_PRIVATE_KEY (.env.local locally, project settings on Vercel).
 */
const DEFAULTS: Record<string, string> = {
  L1_RPC_URL: "https://sepolia.gateway.tenderly.co",
  L2_RPC_URL: "https://sepolia.optimism.io",
  L1_NAME: "RL1 · Sepolia",
  L2_NAME: "OP Sepolia",
  L1_EXPLORER_URL: "https://sepolia.etherscan.io",
  L2_EXPLORER_URL: "https://optimism-sepolia.blockscout.com",
};

const env = (k: string) => process.env[k]?.trim() || DEFAULTS[k];

export function liveConfigured() {
  return Boolean(env("L1_RPC_URL") && env("L2_RPC_URL") && env("GATEWAY_PRIVATE_KEY"));
}

export function publicLiveConfig() {
  return {
    available: liveConfigured(),
    l1Name: env("L1_NAME") ?? "RL1",
    l2Name: env("L2_NAME") ?? "OP Stack L2",
    l1Explorer: env("L1_EXPLORER_URL"),
    l2Explorer: env("L2_EXPLORER_URL"),
    requiresAccessToken: Boolean(env("DEMO_ACCESS_TOKEN")),
  };
}

export function checkAccess(token: string | null) {
  const required = env("DEMO_ACCESS_TOKEN");
  return !required || token === required;
}

// ------------------------------------------------------------------ clients

type Ctx = Awaited<ReturnType<typeof makeCtx>>;
let ctxPromise: Promise<Ctx> | undefined;

async function makeCtx() {
  const l1Url = env("L1_RPC_URL")!;
  const l2Url = env("L2_RPC_URL")!;
  const probeL1 = createPublicClient({ transport: http(l1Url) });
  const probeL2 = createPublicClient({ transport: http(l2Url) });
  const [l1ChainId, l2ChainId] = await Promise.all([probeL1.getChainId(), probeL2.getChainId()]);

  const l2Chain = defineChain({
    ...chainConfig,
    id: l2ChainId,
    name: env("L2_NAME") ?? "OP Stack L2",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [l2Url] } },
  });
  const l1 = createPublicClient({ transport: http(l1Url) });
  const l2 = createPublicClient({ chain: l2Chain, transport: http(l2Url) });
  const account = privateKeyToAccount(env("GATEWAY_PRIVATE_KEY") as Hex);
  const wallet = createWalletClient({ account, chain: l2Chain, transport: http(l2Url) });

  // Discover rollup contracts: explicit env > op-node rollup config > known presets.
  let batchInbox = env("BATCH_INBOX_ADDRESS") as Address | undefined;
  let portal = env("OPTIMISM_PORTAL_ADDRESS") as Address | undefined;
  let dgf = env("DISPUTE_GAME_FACTORY_ADDRESS") as Address | undefined;
  const opNode = env("OP_NODE_RPC_URL");
  if (opNode && (!batchInbox || !portal)) {
    try {
      const res = await fetch(opNode, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "optimism_rollupConfig", params: [] }),
      });
      const cfg = (await res.json()).result;
      batchInbox ??= cfg?.batch_inbox_address;
      portal ??= cfg?.deposit_contract_address;
    } catch {
      /* op-node optional */
    }
  }
  if (l2ChainId === optimismSepolia.id) {
    const c = optimismSepolia.contracts;
    dgf ??= c.disputeGameFactory[11155111].address;
    portal ??= c.portal[11155111].address;
    batchInbox ??= "0xff00000000000000000000000000000011155420";
  }
  if (!dgf && portal) {
    try {
      dgf = await l1.readContract({
        address: portal,
        abi: parseAbi(["function disputeGameFactory() view returns (address)"]),
        functionName: "disputeGameFactory",
      });
    } catch {
      /* pre-fault-proof portal */
    }
  }

  return { l1, l2, wallet, account, l1ChainId, l2ChainId, batchInbox, portal, dgf };
}

function ctx() {
  ctxPromise ??= makeCtx().catch((e) => {
    ctxPromise = undefined;
    throw e;
  });
  return ctxPromise;
}

// Serialise writes so concurrent requests don't race on the gateway nonce.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}


// Public RPCs are load-balanced: a request can hit a backend a block or two behind the one
// that accepted our last tx. So: fixed gas limits (a stale estimate once sent a tx with 21k gas),
// locally tracked nonces, and reads pinned to the block of our last write, retried until served.
const GAS_LIMIT = { deploy: 2_000_000n, call: 300_000n };
let nextNonce: number | undefined;
let lastWriteBlock: bigint | undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function takeNonce(c: Ctx) {
  const pending = await c.l2.getTransactionCount({ address: c.account.address, blockTag: "pending" });
  const n = Math.max(pending, nextNonce ?? 0);
  nextNonce = n + 1;
  return n;
}

/** Run a read at (at least) the block of our last write; retry while the serving backend lags behind it. */
async function fresh<T>(read: (blockNumber: bigint | undefined) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await read(lastWriteBlock);
    } catch (e) {
      if (i >= 6) throw e;
      await sleep(600);
    }
  }
}

function noteWrite(block: bigint) {
  if (!lastWriteBlock || block > lastWriteBlock) lastWriteBlock = block;
}

/** The S-EUR contract of the caller's demo run (the browser passes it with every request). */
function tokenAddress(requested?: string): Address {
  if (!requested || !isAddress(requested)) throw new Error("No S-EUR contract for this run yet - run init first");
  return requested;
}

// ------------------------------------------------------------------ actions

/**
 * Deploy a fresh S-EUR contract for this demo run. OSPlus is simulated and starts empty on every
 * run, so the token ledger must start empty too, otherwise reconciliation would compare this
 * run's OSPlus books with tokens left over from earlier runs.
 */
export async function init() {
  const c = await ctx();
  const bal = await c.l2.getBalance({ address: c.account.address });
  if (bal === 0n) {
    throw new Error(
      `Gateway ${c.account.address} has no ETH on L2 (chain ${c.l2ChainId}). Fund it first (faucet or L1->L2 deposit).`,
    );
  }
  return serial(async () => {
    const hash = await c.wallet
      .deployContract({
        abi: depositTokenAbi,
        bytecode: depositTokenBytecode,
        args: [c.account.address],
        gas: GAS_LIMIT.deploy,
        nonce: await takeNonce(c),
      })
      .catch((e) => {
        nextNonce = undefined;
        throw e;
      });
    const r = await c.l2.waitForTransactionReceipt({ hash });
    if (r.status !== "success" || !r.contractAddress) throw new Error(`Deployment ${hash} failed`);
    noteWrite(r.blockNumber);
    return { tokenAddress: r.contractAddress as Hex, deployed: true, txHash: hash };
  });
}

export function provisionWallet(iban: string) {
  const seed = env("CUSTODY_SEED") ?? "sparkassen-demo-hsm";
  return deriveCustodyAccount(seed, iban).address as Hex;
}

type WriteFn = "setAllowed" | "mint" | "burn" | "controllerTransfer";

async function write(token: string | undefined, functionName: WriteFn, args: readonly unknown[]): Promise<TxReceipt> {
  const c = await ctx();
  const address = tokenAddress(token);
  return serial(async () => {
    const hash = await c.wallet
      .writeContract({
        address,
        abi: depositTokenAbi,
        functionName,
        // viem can't narrow a union of function names to one args tuple
        args: args as never,
        gas: GAS_LIMIT.call,
        nonce: await takeNonce(c),
      })
      .catch((e) => {
        nextNonce = undefined;
        throw e;
      });
    const r = await c.l2.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`Transaction ${hash} reverted`);
    noteWrite(r.blockNumber);
    const l1Fee = (r as { l1Fee?: bigint | null }).l1Fee;
    const block = await fresh(() => c.l2.getBlock({ blockNumber: r.blockNumber }));
    return {
      hash,
      l2Block: Number(r.blockNumber),
      l2Timestamp: Number(block.timestamp) * 1000,
      gasUsed: Number(r.gasUsed),
      l1FeeWei: l1Fee != null ? l1Fee.toString() : undefined,
    };
  });
}

export const setAllowed = (t: string | undefined, account: Hex, ref: string) =>
  write(t, "setAllowed", [account, true, refToBytes32(ref)]);
export const mint = (t: string | undefined, to: Hex, cents: number, ref: string) =>
  write(t, "mint", [to, BigInt(cents), refToBytes32(ref)]);
export const burn = (t: string | undefined, from: Hex, cents: number, ref: string) =>
  write(t, "burn", [from, BigInt(cents), refToBytes32(ref)]);
export const transfer = (t: string | undefined, from: Hex, to: Hex, cents: number, ref: string) =>
  write(t, "controllerTransfer", [from, to, BigInt(cents), refToBytes32(ref)]);

export async function balanceOf(token: string | undefined, account: Hex) {
  const c = await ctx();
  const address = tokenAddress(token);
  const v = await fresh((blockNumber) =>
    c.l2.readContract({ address, abi: depositTokenAbi, functionName: "balanceOf", args: [account], blockNumber }),
  );
  return Number(v);
}

// ------------------------------------------------------------------ status

const batchCache: BatchInfo[] = [];
let lastScannedL1 = 0n;

async function scanBatches(l1: PublicClient, inbox: Address, head: bigint, finalized: bigint) {
  const from = lastScannedL1 ? lastScannedL1 + 1n : head - 8n;
  const to = head;
  const start = to - from > 20n ? to - 20n : from; // cap work per request
  for (let n = start; n <= to; n++) {
    const block = await l1.getBlock({ blockNumber: n, includeTransactions: true });
    for (const tx of block.transactions) {
      if (tx.to?.toLowerCase() !== inbox.toLowerCase()) continue;
      batchCache.unshift({
        l1TxHash: tx.hash,
        l1Block: Number(n),
        blobs: tx.blobVersionedHashes?.length ?? 0,
        bytes: tx.blobVersionedHashes?.length ? undefined : (tx.input.length - 2) / 2,
        finalized: false,
        ts: Number(block.timestamp) * 1000,
      });
    }
  }
  lastScannedL1 = to;
  batchCache.splice(30);
  for (const b of batchCache) b.finalized = BigInt(b.l1Block) <= finalized;
}

const DGF_ABI = parseAbi([
  "function gameCount() view returns (uint256)",
  "function gameAtIndex(uint256) view returns (uint32 gameType, uint64 timestamp, address proxy)",
]);
const GAME_ABI = parseAbi([
  "function l2BlockNumber() view returns (uint256)",
  "function l2SequenceNumber() view returns (uint256)",
  "function status() view returns (uint8)",
  "function rootClaim() view returns (bytes32)",
  "function maxClockDuration() view returns (uint64)",
]);
const GAME_STATUS: GameStatus[] = ["IN_PROGRESS", "CHALLENGER_WINS", "DEFENDER_WINS"];
const GAME_CREATED = parseAbiItem(
  "event DisputeGameCreated(address indexed disputeProxy, uint32 indexed gameType, bytes32 indexed rootClaim)",
);
const gameCache = new Map<number, ProposalInfo>();

/** Find the L1 tx that created a game: estimate its block from the creation time, then search the factory's logs. */
async function findGameTx(l1: PublicClient, dgf: Address, proxy: Address, createdAt: number, head: { number: bigint; timestamp: bigint }) {
  const secondsAgo = BigInt(Math.max(0, Math.floor(Number(head.timestamp) - createdAt / 1000)));
  const estimate = head.number - secondsAgo / 12n; // missed slots only move the real block lower
  const logs = await l1.getLogs({
    address: dgf,
    event: GAME_CREATED,
    args: { disputeProxy: proxy },
    fromBlock: estimate > 150n ? estimate - 150n : 0n,
    toBlock: estimate + 5n > head.number ? head.number : estimate + 5n,
  });
  return logs[0]?.transactionHash as Hex | undefined;
}

async function readGames(l1: PublicClient, dgf: Address, head: { number: bigint; timestamp: bigint }): Promise<ProposalInfo[]> {
  const count = Number(await l1.readContract({ address: dgf, abi: DGF_ABI, functionName: "gameCount" }));
  const out: ProposalInfo[] = [];
  for (let i = count - 1; i >= Math.max(0, count - 5); i--) {
    const cached = gameCache.get(i);
    if (cached && (cached.status !== "IN_PROGRESS" || Date.now() < (cached.challengeEndsAt ?? 0))) {
      out.push(cached);
      continue;
    }
    const [gameType, ts, proxy] = await l1.readContract({ address: dgf, abi: DGF_ABI, functionName: "gameAtIndex", args: [BigInt(i)] });
    const g = { address: proxy, abi: GAME_ABI } as const;
    const [l2Block, l2Seq, status, rootClaim, maxClock] = await Promise.all([
      l1.readContract({ ...g, functionName: "l2BlockNumber" }).catch(() => undefined),
      l1.readContract({ ...g, functionName: "l2SequenceNumber" }).catch(() => undefined),
      l1.readContract({ ...g, functionName: "status" }),
      l1.readContract({ ...g, functionName: "rootClaim" }),
      l1.readContract({ ...g, functionName: "maxClockDuration" }).catch(() => undefined),
    ]);
    const createdAt = Number(ts) * 1000;
    // Super-root games commit to an L2 timestamp (seconds) instead of a block number.
    const isTimestamp = l2Block === undefined && l2Seq !== undefined && l2Seq > 1_000_000_000n;
    const p: ProposalInfo = {
      index: i,
      gameType,
      gameAddress: proxy,
      l2Block: isTimestamp ? undefined : Number(l2Block ?? l2Seq ?? 0n),
      l2Timestamp: isTimestamp ? Number(l2Seq) * 1000 : undefined,
      rootClaim,
      createdAt,
      challengeEndsAt: maxClock !== undefined ? createdAt + Number(maxClock) * 1000 : undefined,
      status: GAME_STATUS[status] ?? "IN_PROGRESS",
    };
    p.txHash = cached?.txHash ?? (await findGameTx(l1, dgf, proxy, createdAt, head).catch(() => undefined));
    gameCache.set(i, p);
    out.push(p);
  }
  return out;
}

export async function status(requestedToken?: string): Promise<ChainStatus> {
  const c = await ctx();
  const [l1Head, l1Safe, l1Fin, l2Head, l2Safe, l2Fin, gwBal] = await Promise.all([
    c.l1.getBlock({ blockTag: "latest" }),
    c.l1.getBlock({ blockTag: "safe" }).catch(() => undefined),
    c.l1.getBlock({ blockTag: "finalized" }).catch(() => undefined),
    c.l2.getBlock({ blockTag: "latest" }),
    c.l2.getBlock({ blockTag: "safe" }),
    c.l2.getBlock({ blockTag: "finalized" }),
    c.l2.getBalance({ address: c.account.address }),
  ]);

  const notes: string[] = [];
  if (c.batchInbox) {
    await scanBatches(c.l1 as PublicClient, c.batchInbox, l1Head.number, l1Fin?.number ?? 0n).catch((e) =>
      notes.push(`batch scan failed: ${(e as Error).message.split("\n")[0]}`),
    );
  } else notes.push("Batch inbox unknown - set OP_NODE_RPC_URL or BATCH_INBOX_ADDRESS to list L1 batches.");

  let proposals: ProposalInfo[] = [];
  if (c.dgf) {
    proposals = await readGames(c.l1 as PublicClient, c.dgf, l1Head).catch((e) => {
      notes.push(`dispute game read failed: ${(e as Error).message.split("\n")[0]}`);
      return [];
    });
  } else notes.push("DisputeGameFactory unknown - set OP_NODE_RPC_URL or DISPUTE_GAME_FACTORY_ADDRESS.");

  let token: ChainStatus["token"];
  const addr = requestedToken;
  if (addr && isAddress(addr)) {
    const supply = await fresh((blockNumber) =>
      c.l2.readContract({ address: addr, abi: depositTokenAbi, functionName: "totalSupply", blockNumber }),
    ).catch(() => undefined);
    if (supply !== undefined) token = { address: addr, totalSupply: Number(supply) };
  }

  return {
    kind: "live",
    now: Date.now(),
    l1: {
      name: env("L1_NAME") ?? `RL1 (chain ${c.l1ChainId})`,
      chainId: c.l1ChainId,
      head: Math.max(Number(l1Head.number), Number(l1Safe?.number ?? 0n)),
      safe: Math.max(Number(l1Safe?.number ?? 0n), Number(l1Fin?.number ?? 0n)),
      finalized: Number(l1Fin?.number ?? 0n),
      explorer: env("L1_EXPLORER_URL"),
    },
    l2: {
      name: env("L2_NAME") ?? `OP Stack L2 (chain ${c.l2ChainId})`,
      chainId: c.l2ChainId,
      // Load-balanced public RPCs can mix backends in one request; enforce finalized <= safe <= unsafe.
      unsafe: Math.max(Number(l2Head.number), Number(l2Safe.number), Number(l2Fin.number)),
      safe: Math.max(Number(l2Safe.number), Number(l2Fin.number)),
      finalized: Number(l2Fin.number),
      explorer: env("L2_EXPLORER_URL"),
    },
    token,
    gateway: { address: c.account.address, balanceEth: formatEther(gwBal) },
    batches: batchCache.map((b) => ({ ...b })),
    proposals,
    l2Blocks: [
      {
        number: Number(l2Head.number),
        hash: l2Head.hash,
        ts: Number(l2Head.timestamp) * 1000,
        txCount: l2Head.transactions.length,
      },
    ],
    notes,
  };
}
