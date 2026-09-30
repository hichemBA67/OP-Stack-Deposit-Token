# Tokenized deposits for Sparkassen: OSPlus → OP Stack L2 → RL1

A guided demo of how a Sparkasse could issue **tokenized deposits (S-EUR)** on an
OP Stack rollup, with OSPlus remaining the core banking system.

```
 Customer        OSPlus (simulated)       Abstraction layer            OP Stack L2 (OP Sepolia)     RL1 (Sepolia)
 S-App/Filiale → Kunden, Girokonten,   →  Sparkassen Chain Gateway  →  sequencer, S-EUR contract →  BatchInbox (blobs)
                 Sperren, Journal,        saga orchestrator,           op-batcher, op-proposer       DisputeGameFactory
                 Sammelkonto per Spk      compliance, custody/HSM,                                   OptimismPortal
                                          reconciliation
```

- **OSPlus** is simulated (in the browser). It stays the system of record for euros and customers.
- **The abstraction layer (gateway)** translates banking events into blockchain transactions and back. It's the only component holding keys.
- **OP Sepolia** is a real, public test network built with the OP Stack. The S-EUR contract is deployed there and every action is a real transaction.
- **RL1** is the Regulated Layer One: an EVM-based settlement layer (the Sepolia test network here). OP Sepolia publishes its transaction data (blobs) and state (dispute games) on RL1.

The page has two views:

- **Executive view** (default): one screen with four systems, four key numbers (payment time,
  time to irrevocability on RL1, digital euros in circulation, % backed) and the lifecycle as
  **5 steps**, each with one button: *Open accounts → Convert → Pay → Secured on RL1 → Redeem & audit*.
- **Technical view**: the same lifecycle as **9 detailed steps**, each explained in plain language: what happens, who
does what, why it matters for the Sparkasse, and how long it takes. Every message
between the systems appears with an explanation.

| # | Step | Kind |
| - | --- | --- |
| 1 | Open an account & verify the customer (wallet + allowlist) | you trigger |
| 2 | Money arrives on the Girokonto (SEPA) | you trigger |
| 3 | Turn euros into S-EUR (hold → mint → book) | you trigger |
| 4 | Pay another customer, across Sparkassen | you trigger |
| 5 | L2 data is published on RL1 → **safe** (~1–5 min) | automatic |
| 6 | **Final on RL1** at the moment of anchoring (a Regulated Layer One finalizes on inclusion; the Sepolia stand-in confirms ~13 min later) | automatic |
| 7 | L2 state is proposed in a dispute game (3.5-day challenge window) | background: the story doesn't wait |
| 8 | Turn S-EUR back into euros (burn → book) | you trigger |
| 9 | Check that OSPlus and the chain match | you trigger |

## Every transaction on the explorers

In live mode every blockchain transaction is listed with a link to the public explorer.
In the executive view this is the "Proof on the public explorers" card; in the technical view it's the
"Transactions & explorer links" tab.

| Network | Transactions | Explorer |
| --- | --- | --- |
| OP Sepolia (L2) | S-EUR deployment, allowlisting, mint, transfer, burn | [Blockscout](https://optimism-sepolia.blockscout.com) |
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

Each demo run (and each "Start over") deploys its own S-EUR contract, so the token ledger starts
empty together with the simulated OSPlus and the reconciliation always compares like with like.

Without the live variables, the Vercel deployment still works in Simulation mode.

## How it's built

- `lib/osplus/`: OSPlus simulator (Mandanten, customers, IBANs with valid check digits, Sperren, Buchungsjournal, Sammelkonten)
- `lib/gateway/`: the abstraction layer (sagas with compensation, compliance, custody, settlement tracking, reconciliation)
- `lib/chain/`: the `ChainAdapter` interface with two implementations: an in-browser OP Stack simulation, and a live one (viem, server-side in `app/api/chain`)
- `lib/explain.ts`: all plain-language texts for steps, components and the glossary, kept in one place for review
- `contracts/TokenizedDeposit.sol`: permissioned tokenized-deposit token (S-EUR); `pnpm compile` rebuilds it with solc-js (no Foundry needed)

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
Sparkasse; all institutes, customers and IBANs are fictitious.
