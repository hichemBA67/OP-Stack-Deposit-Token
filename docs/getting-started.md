# Getting started

## Requirements

- Node.js ≥ 20.9 (CI uses Node 22)
- pnpm 10 (`packageManager: pnpm@10.30.1`)
- For Live mode only: a fresh private key with a little OP Sepolia ETH

## Install and run

```bash
pnpm install
pnpm dev                 # http://localhost:3000
```

The demo is at `/`, this documentation at `/docs`.

With no configuration the page runs in **Simulation** mode: OSPlus, the gateway and an OP Stack rollup with its RL1 all run in the browser with compressed timings. A full run takes about 15 seconds.

## Live mode on OP Sepolia

1. The OP Sepolia and RL1 (Sepolia) settings are built in. No RPC configuration is needed.
2. Put `GATEWAY_PRIVATE_KEY=0x…` in `.env.local`. Use a **fresh key used only for this demo**. `.env.local` is git-ignored.
3. Send that address a little **OP Sepolia ETH** (0.01 is plenty), for example from the [Superchain faucet](https://console.optimism.io/faucet). The page shows the address and faucet links while the balance is empty.
4. Run `pnpm dev`. The page defaults to **OP Sepolia (live)**. The first action deploys the run's three contracts (about 15 seconds).

The header has a toggle to switch between Live and Simulation at any time. Switching, or pressing **Start over**, discards the run and starts a fresh one.

Live mode needs a server (the key must never reach the browser). It works with `pnpm dev`, `pnpm start` and on Vercel, but not on the static GitHub Pages build, which is Simulation only. See [Configuration & deployment](deployment.md).

## Using the demo

- **Executive view** (default): four systems, four key numbers (DvP settlement time, time to finality on RL1, settlement risk, reconciliation) and 7 chapters with one button each. Chapter 4 includes the test *"What if the buyer can't pay?"*. **Play the full story** runs everything.
- **Technical view**: the same lifecycle as 10 detailed steps with forms for custom values, a live architecture diagram, and tabs for transactions with explorer links, every inter-system message, OSPlus accounts and bookings, L2 → RL1 settlement, reconciliation, a glossary and architecture notes.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server (Simulation + Live) |
| `pnpm build:pages` | Static export for GitHub Pages into `out/` (Simulation only) |
| `pnpm compile` | Compile `contracts/*.sol` with solc-js into `lib/chain/artifact.ts` |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
