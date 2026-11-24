# Documentation

Technical documentation for the **tokenized bond DvP prototype**: OSPlus → abstraction layer → OP Stack L2 → RL1.

A municipal utility issues a crypto security under the German eWpG. A corporate investor pays for it with tokenized deposits (S-EUR). Bond and cash settle in **one atomic transaction** on an OP Stack L2 that anchors on RL1, an EVM-based Regulated Layer One. OSPlus stays the system of record throughout.

> Independent technical demo. Not affiliated with Finanz Informatik, the DSGV or any Sparkasse. All institutes, companies, the bond, its ISIN and all IBANs are fictitious.

## Contents

| # | Chapter | What it covers |
| - | --- | --- |
| 1 | [Getting started](getting-started.md) | Install, run, Simulation vs. Live mode, scripts |
| 2 | [Overview](overview.md) | Scope, the story, what is real and what is simulated, tech stack |
| 3 | [Architecture](architecture.md) | The five layers, interfaces between them, runtime topology |
| 4 | [Business lifecycle](lifecycle.md) | The 10 steps, key flows as sequence diagrams, modelled interfaces |
| 5 | [OSPlus simulator](osplus-simulator.md) | Data model, operations, GV codes, IBANs |
| 6 | [Abstraction layer (gateway)](gateway.md) | Responsibilities, references, sagas, settlement tracking |
| 7 | [Smart contracts](smart-contracts.md) | `PermissionedToken`, `TokenizedDeposit`, `BondToken`, `DvPSettlement`, `SettlementAnchor` |
| 8 | [Chain adapters & API](chain-adapters.md) | `ChainAdapter` interface, simulation, live adapter, `/api/chain` reference |
| 9 | [Settlement & finality](settlement-finality.md) | Unsafe / safe / finalized, dispute games, timings |
| 10 | [Reconciliation](reconciliation.md) | Cash and securities checks, worked ledger example |
| 11 | [Frontend](frontend.md) | Store, engine, views and components |
| 12 | [Configuration & deployment](deployment.md) | Environment variables, Vercel, GitHub Pages, CI, own OP Stack chain |
| 13 | [Security model](security.md) | Keys, roles, trust boundaries |
| 14 | [Limitations & production gaps](limitations.md) | What the prototype does not solve |
| 15 | [Glossary](glossary.md) | Terms used across the project |

## Key takeaways from the prototype

1. **The integration layer is the product. The chain is the easy part.**
   Atomic DvP is about 20 lines of Solidity (`DvPSettlement.settle`). Everything that makes it bank-grade lives in the abstraction layer (~610 lines): the hold → mint → book saga with compensation, burn-before-payout, EndToEndId references on both ledgers, interbank rebalancing between the Sparkassen's Sammelkonten, registrar duties and two-way reconciliation. OSPlus needs no structural change: it emits business events and accepts bookings.

2. **Settlement finality comes from RL1. With a BFT Regulated Layer One it takes minutes, not 3.5 days.**
   A trade is visible on the L2 in about 2 seconds and becomes irreversible when op-batcher's blob lands on RL1, usually 1 to 5 minutes later. The 3.5-day dispute window only gates withdrawals from the L2 to RL1. The levers are RL1's consensus and the batcher cadence.

3. **Settlement risk is solved technically. Production is blocked by confidentiality, legal roles and trust concentration.**
   Every L2 transaction is public through blobs on RL1. The eWpG registrar and crypto-custody roles need BaFin licences, and S-EUR must be classified (deposit or e-money token). One gateway key is admin, minter, registrar and DvP operator, and in the demo the gateway's business logic runs in the browser.

## Code version

This documentation describes the `depot` branch from commit `9893ca4` onwards, including the `SettlementAnchor` contract (written and compiled, not yet wired in).
