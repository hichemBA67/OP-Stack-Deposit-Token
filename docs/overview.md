# Overview

The prototype is a guided, clickable demo built with Next.js. It walks one complete securities lifecycle through five systems: clients, OSPlus, the abstraction layer, an OP Stack L2 and RL1.

It runs in two modes that share the same code path:

- **Simulation**: everything in the browser, with compressed timings.
- **Live**: every ledger action is a real transaction on **OP Sepolia**, a public OP Stack test network, which publishes its data and state to **Sepolia**, standing in for RL1.

## The story

| Role | Party | Institute | Opening balance |
| --- | --- | --- | ---: |
| Issuer (Emittent) | Stadtwerke Musterstadt GmbH | Sparkasse Musterstadt · BLZ 12345678 · `MUSTDEM1XXX` | €20,000.00 |
| Investor | Becker Logistik GmbH | Sparkasse Beispielstadt · BLZ 87654321 · `BSPLDEB1XXX` | €250,000.00 |

The issuer issues 100 bonds of €1,000. The investor tokenizes €100,000 and buys all 100 bonds at par. Bond and cash change hands in one transaction: either both legs settle or neither does. The issuer then pays the first coupon, takes its proceeds back to its account, and both ledgers are reconciled.

### Bond terms (`lib/bond.ts`)

| Term | Value |
| --- | --- |
| Name / symbol | Stadtwerke Musterstadt 3.25% Green Bond 2029 · `SWMS29` |
| ISIN | `DE000A4SWMS3` (fictitious, valid check digit) |
| Nominal per unit | €1,000 (100,000 cents). Zero decimals: bonds are indivisible |
| Coupon | 325 bps p.a. = €32.50 per bond per year |
| Maturity | 30 Sep 2029 (unix `1885420800`) |
| Issue volume | 100 units = €100,000, placed at 100% |

## What is real and what is simulated

| Component | Simulation mode | Live mode |
| --- | --- | --- |
| Clients & channel | simulated (UI buttons) | simulated |
| OSPlus core banking | simulated in-browser model | simulated in-browser model |
| Abstraction layer (gateway) | in the browser | logic in the browser, **signing on the server** |
| Smart contracts | JavaScript replica with EVM-style revert snapshots | **real** Solidity, deployed fresh per run on OP Sepolia |
| L2 sequencer and heads | simulated, 1 s blocks | **real** OP Sepolia, 2 s blocks |
| Batches (blobs), dispute games | simulated, compressed timings | **real**, read from Sepolia (BatchInbox, DisputeGameFactory) |
| RL1 finality | BFT model: final at inclusion | Sepolia stand-in, which finalizes ~13 min later |

## Technology stack

| Area | Choice |
| --- | --- |
| Web framework | Next.js 16.3.7 (App Router), React 19.2.8, TypeScript 5, Tailwind CSS 4, lucide-react |
| State | zustand 5 (one store in `lib/store.ts`) |
| Chain client | viem 2.57 with `viem/op-stack` (exposes the OP receipt field `l1Fee`) |
| Contracts | Solidity ^0.8.24, compiled by solc-js 0.8.37 (optimizer on, 200 runs, EVM `cancun`). No Foundry or Hardhat |
| Documentation site | Markdown in `docs/`, rendered by the app at `/docs` with marked and mermaid |
| Tooling | pnpm, ESLint 9, tsx, GitHub Actions |
| Hosting | Vercel or any Node server (Simulation + Live), GitHub Pages (Simulation only) |
| Own chain (optional) | op-deployer v0.4.2, op-geth, op-node, op-batcher, op-proposer via Docker Compose (template in `infra/sepolia`) |
