# Frontend

Next.js 16 App Router. The demo (`app/page.tsx` → `components/Demo.tsx`) is a client-rendered application. The documentation (`app/docs/`) is rendered from the Markdown in `docs/` at build time.

## Store and engine (`lib/store.ts`)

- A module-level **engine** holds `{ osplus, sim?, gateway }`. **Start over** or a mode switch discards it and builds a new one. A live run then deploys fresh contracts, so the on-chain ledgers start empty, matching the fresh OSPlus.
- A **250 ms clock** advances the simulation (× speed), samples wall time for animations, and polls `chain.status()` every 250 ms (Simulation) or 4 s (Live). Each status is passed to `gateway.observe()`.
- `run(label, step, fn)` serialises actions (one at a time), bootstraps the contracts on first use, marks the step done and refreshes balances.
- On load, `GET /api/chain` decides the default mode: Live if the server is configured, Simulation otherwise. On the static GitHub Pages build this request is skipped and Live mode is disabled.
- The chosen view and the access token persist in `localStorage`.
- The trace keeps the latest 500 events.
- `story()` maps the 7 executive chapters onto gateway calls. `runLifecycle()` plays them all, waiting for RL1 anchoring after the DvP.

## Components

| Component | Purpose |
| --- | --- |
| `Demo.tsx` | Shell: header, link to the documentation, view switch (Executive / Technical), mode switch (OP Sepolia live / Simulation), speed and pause, Start over, Play all steps, live banner with faucet links, error bar |
| `ExecutiveView.tsx` | Hero with 4 KPIs (DvP settled in, Final on RL1 in, Settlement risk, Books reconciled), 4-system strip, 7 chapters with one button each, the failing-trade test, the settlement timeline, "Proof on the public explorers" |
| `Walkthrough.tsx`, `StepActions.tsx` | 10-step technical walkthrough: story, who does what per layer, why it matters, timing, and forms to run each step with custom values |
| `ArchitectureDiagram.tsx` | Live five-column diagram. Components light up for 1.6 s when a message touches them, and connectors show the latest crossing |
| `TxList.tsx` | All real transactions with explorer links. RL1 transactions list the business transactions they cover |
| `TraceLog.tsx` | Every inter-system message, filterable by layer, with protocol, endpoint and payload |
| `OsplusView.tsx` | Accounts, holds, booking journal, Depots and securities journal |
| `LedgerView.tsx` | L2 blocks, tracked transactions and their stages, batches, dispute games |
| `ReconView.tsx` | Cash and securities reconciliation tables with differences |
| `AboutView.tsx` | Architecture notes: layers, three kinds of finality, simulation timings, production considerations |
| `ui.tsx` | Shared `Button`, `Card`, `Stat`, layer and component labels |

## Copy

All plain-language texts (steps, chapters, components, layers, glossary) live in `lib/explain.ts`, so the wording can be reviewed in one place.

## Documentation site (`app/docs/`)

| File | Role |
| --- | --- |
| `app/docs/layout.tsx` | Sidebar with the chapter list, link back to the demo |
| `app/docs/page.tsx` | Renders `docs/README.md` at `/docs` |
| `app/docs/[slug]/page.tsx` | Renders `docs/<slug>.md` at `/docs/<slug>`. `generateStaticParams` lists every file, `dynamicParams = false` |
| `lib/docs.ts` | Reads the Markdown, converts it with marked, rewrites `*.md` links to site routes |
| `components/Mermaid.tsx` | Client component that renders `mermaid` code blocks, loading mermaid on demand |

The same Markdown files render on GitHub, which draws the mermaid diagrams natively.
