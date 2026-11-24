# Tokenized bond DvP for Sparkassen: OSPlus → OP Stack L2 → RL1

A guided demo of **delivery versus payment (DvP)** for a tokenized bond, paid with
**tokenized deposits**, with OSPlus remaining the core banking system.

```
 Clients          OSPlus (simulated)        Abstraction layer             OP Stack L2 (OP Sepolia)      RL1 (Sepolia)
 issuer +       → Firmenkunden, Geschäfts- → Sparkassen Chain Gateway  →  S-EUR cash token          →  BatchInbox (blobs)
 investor         konten, Depots, Sperren,   sagas, compliance, custody,  bond register (eWpG)          DisputeGameFactory
                  Sammelkonto per Sparkasse  registrar, reconciliation    DvP contract, op-batcher      OptimismPortal
```

**The story.** *Stadtwerke Musterstadt GmbH* (client of Sparkasse Musterstadt) issues the
*3.25% Green Bond 2029* (ISIN DE000A4SWMS3, fictitious) as a crypto security under the German
eWpG. *Becker Logistik GmbH* (client of Sparkasse Beispielstadt) buys all 100 bonds (€100,000)
with S-EUR, tokenized deposits of its Sparkasse. Bond and cash change hands in **one transaction**:
either both legs settle or neither does.

- **OSPlus** is simulated (in the browser). It stays the system of record for accounts, Depots and euros.
- **The abstraction layer (gateway)** translates banking events into blockchain transactions and back, acts as registrar of the crypto securities register, and is the only component holding keys.
- **OP Sepolia** is a real, public test network built with the OP Stack. The three contracts are deployed there and every action is a real transaction.
- **RL1** is the Regulated Layer One: an EVM-based settlement layer (the Sepolia test network here). OP Sepolia publishes its data (blobs) and state (dispute games) on RL1. A Regulated Layer One finalizes blocks on inclusion, so a trade is final as soon as it is anchored.

## Documentation

Full technical documentation is in [`docs/`](docs/README.md) and is also served by the app at `/docs`
(and on the GitHub Pages site): getting started, architecture, business lifecycle, OSPlus simulator,
abstraction layer, smart contracts, chain adapters and API, settlement and finality, reconciliation,
frontend, configuration and deployment, security model, limitations and a glossary.

The page has two views:

- **Executive view** (default): four systems, four key numbers (DvP settlement time, time to finality
  on RL1, settlement risk, reconciliation) and **7 steps**, each with one button:
  *Onboard → Issue bond → Tokenize cash → Settle DvP → Final on RL1 → Pay coupon → Redeem & reconcile*.
  Step 4 includes a **"What if the buyer can't pay?"** test: the trade reverts and nothing moves.
- **Technical view**: the same lifecycle as **10 detailed steps**, each explained in plain language: what happens, who
does what, why it matters for the Sparkasse, and how long it takes. Every message
between the systems appears with an explanation.

| # | Step | Kind |
| - | --- | --- |
| 1 | Onboard issuer and investor (KYB, Depot, wallet, allowlist) | you trigger |
| 2 | Issue 100 bonds into the crypto securities register (eWpG) | you trigger |
| 3 | Investor tokenizes €100,000 (hold → mint → book) | you trigger |
| 4 | **Atomic DvP**: 100 bonds ⇄ €100,000 in one transaction | you trigger |
| 5 | L2 data is published on RL1: the trade is anchored (~1–5 min) | automatic |
| 6 | **Final on RL1** at the moment of anchoring (the Sepolia stand-in confirms ~13 min later) | automatic |
| 7 | L2 state is proposed in a dispute game (3.5-day challenge window) | background: the story doesn't wait |
| 8 | Coupon: 3.25% computed from the register and paid on-chain (€3,250) | you trigger |
| 9 | Issuer redeems its S-EUR proceeds to its Geschäftskonto | you trigger |
| 10 | Reconcile cash (Sammelkonten = S-EUR) and securities (Depots = register) | you trigger |

## Every transaction on the explorers

In live mode every blockchain transaction is listed with a link to the public explorer.
In the executive view this is the "Proof on the public explorers" card; in the technical view it's the
"Transactions & explorer links" tab.

| Network | Transactions | Explorer |
| --- | --- | --- |
| OP Sepolia (L2) | contract deployments, allowlisting, bond issuance, mint, DvP (incl. the failing test), coupon, burn | [Blockscout](https://optimism-sepolia.blockscout.com) |
| RL1 · Sepolia | the blob batch that publishes those L2 blocks, and the dispute-game creation that proposes the L2 state | [Etherscan](https://sepolia.etherscan.io) |

The RL1 batch for a payment is the first blob transaction from OP Sepolia's batcher to its
BatchInbox after the payment. That's the batch that moves the L2 "safe" head past it; the demo
doesn't decode blob contents. The dispute-game transaction is found from the factory's
`DisputeGameCreated` event.

The public RPCs are load-balanced and some backends lag behind. The live adapter uses fixed gas
limits, tracks nonces itself and pins reads to the block of its last write, so a lagging node
can't cause out-of-gas transactions or stale balances.

## Run it

```bash
pnpm install
pnpm dev                 # http://localhost:3000
```

With no configuration the page runs in **Simulation** mode (everything in the browser, sped up).

### Live on OP Sepolia

1. The OP Sepolia / RL1 settings (public RPCs, explorers) are built in, so no configuration is needed for them.
2. Put `GATEWAY_PRIVATE_KEY=0x…` in `.env.local`, using a **fresh key used only for this demo**.
3. Send that address a little **OP Sepolia ETH** (0.01 is plenty) from a faucet, e.g.
   the [Superchain faucet](https://console.optimism.io/faucet). The page shows the address and links when the balance is empty.
4. `pnpm dev`. The page defaults to **OP Sepolia (live)**. The first action deploys the S-EUR contract.

The page has a toggle to switch between live and simulation at any time.

## Put it on GitHub

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.env.local` (with the gateway key) is git-ignored and never leaves your machine. The
[CI workflow](.github/workflows/ci.yml) runs lint, typecheck and a production build on every
push and pull request. It needs no secrets.

## Deploy to Vercel

1. In Vercel, *Add New → Project* and import the GitHub repo (framework preset Next.js, no build settings needed).
   Every push to `main` then redeploys automatically.
2. Add `GATEWAY_PRIVATE_KEY` under *Project → Settings → Environment Variables*. Everything else has built-in
   defaults (see `.env.example` to override them).
3. **Set `DEMO_ACCESS_TOKEN`** on any public deployment. Otherwise anyone who finds the URL can spend the gateway's test ETH.
4. Keep the gateway funded with a little OP Sepolia ETH; the page shows its address when it runs low.

Each demo run (and each "Start over") deploys its own three contracts (cash token, bond register,
DvP), so the ledgers on the chain start empty together with the simulated OSPlus and the
reconciliation always compares like with like.

Without the live variables, the Vercel deployment still works in Simulation mode.

## Deploy to GitHub Pages (Simulation only)

The [Pages workflow](.github/workflows/pages.yml) builds a static export on every push to `main`:
the demo in Simulation mode at the root and the documentation at `/docs`. GitHub Pages has no
server, so `/api/chain` and Live mode are left out, and no secret is involved.

1. *Settings → Pages → Build and deployment → Source: **GitHub Actions*** (once).
2. Push to `main` (or run the workflow manually).

Build it locally with `NEXT_PUBLIC_BASE_PATH="" pnpm build:pages` (output in `out/`).
GitHub Pages for a private repository needs a paid GitHub plan, and the published site is public.

## How it's built

- `lib/osplus/`: OSPlus simulator (Mandanten, corporate clients, IBANs with valid check digits, Depots, Sperren, Buchungs- and Wertpapierjournal, Sammelkonten)
- `lib/gateway/`: the abstraction layer (sagas with compensation, compliance, custody, settlement tracking, reconciliation)
- `lib/chain/`: the `ChainAdapter` interface with two implementations: an in-browser OP Stack simulation, and a live one (viem, server-side in `app/api/chain`)
- `lib/explain.ts`: all plain-language texts for steps, components and the glossary, kept in one place for review
- `contracts/`: `PermissionedToken` (shared base: allowlist, mint/burn, custodial transfers with business references),
  `TokenizedDeposit` (S-EUR cash leg), `BondToken` (eWpG crypto securities register), `DvPSettlement` (atomic DvP + coupon payment).
  `pnpm compile` rebuilds them with solc-js (no Foundry needed)
- `lib/bond.ts`: the demo bond's terms (ISIN, nominal, coupon, maturity)
- `docs/`: the documentation (Markdown), rendered at `/docs` by `app/docs/` and `lib/docs.ts`

Settlement status is read from the chain itself: the L2 `safe` and `finalized` block
tags, blob transactions sent to OP Sepolia's BatchInbox on Sepolia, and the latest games
in the DisputeGameFactory. OP Sepolia's current games commit to an L2 *timestamp* rather
than a block number, and the gateway handles both.

## Beyond this demo: your own OP Stack chain

OP Sepolia is an OP Stack chain operated by Optimism. A Sparkassen chain would run
the same software, deployed with op-deployer and operated by (or for) the Sparkassen.
See [infra/sepolia/README.md](infra/sepolia/README.md) for that path. It needs a
server and funded L1 keys, not just Vercel.

---

Independent technical demo. Not affiliated with Finanz Informatik, the DSGV or any
Sparkasse; all institutes, companies, the bond, its ISIN and all IBANs are fictitious.
