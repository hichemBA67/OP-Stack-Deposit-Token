# Configuration & deployment

## Environment variables

Only `GATEWAY_PRIVATE_KEY` is needed for Live mode. Everything else has a built-in default (OP Sepolia on Sepolia). See `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GATEWAY_PRIVATE_KEY` | none | Deploys the contracts and pays L2 fees. Use a fresh key funded with ~0.01 OP Sepolia ETH. Without it the app runs in Simulation mode only |
| `DEMO_ACCESS_TOKEN` | none | Required `x-demo-token` value for `/api/chain`. **Set it on any public deployment**, otherwise anyone who finds the URL can spend the gateway's test ETH |
| `CUSTODY_SEED` | `sparkassen-demo-hsm` | Seed for deriving the per-IBAN client wallets |
| `L1_RPC_URL` | `https://sepolia.gateway.tenderly.co` | RL1 (Sepolia) RPC |
| `L2_RPC_URL` | `https://sepolia.optimism.io` | OP Sepolia RPC |
| `L1_NAME` / `L2_NAME` | `RL1 · Sepolia` / `OP Sepolia` | Display names |
| `L1_EXPLORER_URL` | `https://sepolia.etherscan.io` | RL1 explorer links |
| `L2_EXPLORER_URL` | `https://optimism-sepolia.blockscout.com` | L2 explorer links |
| `OP_NODE_RPC_URL` | none | Discover the BatchInbox and portal through `optimism_rollupConfig` (own chain) |
| `BATCH_INBOX_ADDRESS`, `OPTIMISM_PORTAL_ADDRESS`, `DISPUTE_GAME_FACTORY_ADDRESS` | OP Sepolia preset | Explicit rollup contract overrides |

Build-time variables for the static export (set by the GitHub Pages workflow):

| Variable | Purpose |
| --- | --- |
| `STATIC_EXPORT=true` | Switch `next.config.ts` to `output: "export"` |
| `NEXT_PUBLIC_BASE_PATH` | Sub-path the site is served under, e.g. `/OP-Stack-Deposit-Token` |
| `NEXT_PUBLIC_STATIC_DEMO=true` | Tell the client there is no server: skip `/api/chain`, disable Live mode |

## Local

```bash
pnpm install
cp .env.example .env.local    # then set GATEWAY_PRIVATE_KEY for Live mode
pnpm dev
```

`.env*` files are git-ignored except `.env.example`.

## Vercel (Simulation + Live)

1. In Vercel, *Add New → Project* and import the GitHub repository (framework preset Next.js, no build settings needed). Every push to `main` then redeploys.
2. Add `GATEWAY_PRIVATE_KEY` under *Project → Settings → Environment Variables*.
3. Set `DEMO_ACCESS_TOKEN`.
4. Keep the gateway funded with a little OP Sepolia ETH. The page shows its address when it runs low.

Without the live variables, the Vercel deployment still works in Simulation mode.

## GitHub Pages (Simulation only)

GitHub Pages serves static files, so the site is a static export: the demo in Simulation mode at the root, and this documentation at `/docs`. There is no server, so the `/api/chain` route and Live mode are not part of it. No secret is involved.

The workflow `.github/workflows/pages.yml` runs on every push to `main` (and manually):

1. Installs dependencies with pnpm.
2. Reads the Pages base path with `actions/configure-pages`.
3. Runs `pnpm build:pages` (`scripts/build-pages.sh`): moves `app/api` aside, builds with `STATIC_EXPORT=true`, restores it. Output in `out/`.
4. Uploads `out/` and deploys it with `actions/deploy-pages`.

One-time setup in the repository: *Settings → Pages → Build and deployment → Source: **GitHub Actions***. GitHub Pages for a private repository requires a paid GitHub plan, and the published site is public.

Build the static site locally:

```bash
NEXT_PUBLIC_BASE_PATH="" pnpm build:pages
npx serve out
```

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on every pull request, on Node 22: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. It needs no secrets: without a key the app falls back to Simulation mode.

## Contracts

```bash
pnpm compile
```

Compiles every `contracts/*.sol` with solc-js and regenerates `lib/chain/artifact.ts`. Commit the regenerated file: the app and the builds use it directly.

## Your own OP Stack chain

OP Sepolia is an OP Stack chain operated by Optimism. A Sparkassen chain would run the same software, deployed with op-deployer and operated by (or for) the Sparkassen. `infra/sepolia/` holds a template (not yet executed from this repository):

| Item | Notes |
| --- | --- |
| L1 contracts | `op-deployer` v0.4.2: `init` (L1 chain 11155111, L2 chain 4206942), edit role addresses in `intent.toml`, `apply`, then `inspect genesis / rollup / l1` |
| L2 services | `docker-compose.yml`: op-geth (archive), op-node as sequencer, op-batcher (blobs, max channel duration 25), op-proposer (game type 1, every 10 minutes) |
| Keys | 5 separate keys: deployer/admin, batcher, proposer, challenger, sequencer p2p. HSM or KMS beyond a demo |
| Server | 24/7 host, 4 vCPU / 16 GB RAM / 200 GB SSD is enough for a demo chain. Not Vercel: these are long-running, stateful processes |
| L1 access | Sepolia execution RPC plus beacon API (op-node reads blobs through it) |
| Funding | Sepolia ETH for deployment, plus ongoing ETH for batcher blobs and proposer games |

Then point the app at it:

```bash
L1_RPC_URL=<sepolia rpc>
L2_RPC_URL=http://<server>:8545
OP_NODE_RPC_URL=http://<server>:9545
GATEWAY_PRIVATE_KEY=<fund with L2 ETH via an OptimismPortal deposit>
DEMO_ACCESS_TOKEN=<something random>
```

Put the RPCs behind TLS and an authenticating proxy before exposing them. Rollup-as-a-Service providers (e.g. Conduit, Gelato, Caldera) are the managed alternative.
