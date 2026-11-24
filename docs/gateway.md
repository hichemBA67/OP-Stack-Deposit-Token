# Abstraction layer (Sparkassen Chain Gateway)

`lib/gateway/gateway.ts` is an anti-corruption layer between OSPlus and the ledger. It depends only on the `ChainAdapter` interface, never on a specific chain. Every message it emits carries a plain-language `explain` text, which drives the walkthrough and the trace log.

## Responsibilities

| Concern | Implementation |
| --- | --- |
| Translation | Business events (client created, issuance, purchase…) become ledger commands (onboard, issue, mint, settle, payCoupon, burn), and receipts become bookings |
| References | `nextRef(prefix)` returns `{PREFIX}-{YYYYMMDD}-{seq:5}`, e.g. `DVP-20261124-00006`. Always ≤ 32 bytes, so it travels on-chain as a readable `bytes32` (`refToBytes32`). Prefixes: `KYB`, `ISS`, `TOK`, `DVP`, `DVX` (failing test), `CPN`, `RED` |
| Compliance | Issuer role check, per-order tokenization limit of €1,000,000 (`TOKENIZE_LIMIT_CENTS`), available balance, seller holds the bonds, buyer holds the cash, issuer can fund the coupon, holder can redeem. KYB, sanctions and MiFID classification are narrated, not computed |
| Custody | One wallet per client, derived as `keccak256(seed ‖ "custody:" + IBAN)` (`lib/chain/custody.ts`). The bank holds the key in the custodial model. Client keys never sign: all movements go through `controllerTransfer` |
| Registrar | Checks terms and issuer approval before the register entry (`BondToken.issue`), then mirrors it into the issuer's Depot |
| Sagas | Tokenize: hold → mint → book, releasing the hold if the mint fails. Redeem: burn → book |
| Interbank | `rebalance()` moves the backing between two Sparkassen's Sammelkonten (GV 803) whenever S-EUR moves between their clients. In reality this would clear through the Girozentrale / Landesbank |
| Settlement tracking | Every business transaction becomes a `TrackedTx` with stage `unsafe → safe → finalized`, its batch, its dispute game and wall-clock milestones (`submittedAt, confirmedAt, safeAt, finalizedAt`) for the KPIs |
| Reconciliation | `reconcile()` compares cash and securities between chain and OSPlus. See [Reconciliation](reconciliation.md) |
| Explorer list | Every real transaction (L2 and RL1) is recorded as a `ChainTx` with explorer links. RL1 transactions carry `covers`: the business transactions they anchor |

## Public methods

| Method | Step | Notes |
| --- | --- | --- |
| `bootstrap()` | 0 | Deploys the run's contracts through `chain.init()` |
| `onboard(name, institutId, rolle, anfangssaldo)` | 1 | OSPlus client → compliance → wallet → allowlisting |
| `issue(issuerKundennr, units)` | 2 | Rejects non-issuers. Register entry, then Depot posting |
| `tokenize(kundennr, cents)` | 3 | Limit and balance checks, then the saga |
| `dvp(sellerK, buyerK, units, priceCents)` | 4 | Pre-checks on-chain balances, settles, mirrors Depots, rebalances backing |
| `dvpFailing(sellerK, buyerK, units)` | 4b | Sends an unaffordable trade without pre-checks, verifies nothing moved |
| `observe(status)` | 5–7 | Called on every status poll |
| `coupon(issuerK, holderKs[])` | 8 | Checks issuer funds, pays, rebalances backing per holder |
| `redeem(kundennr, cents)` | 9 | Burn first, then book |
| `reconcile()` | 10 | Returns a `ReconReport` |

## Trace events

Each call to `emit(from, to, components, title, explain, extra)` produces a `TraceEvent` with:

- `from` / `to`: one of `customer`, `osplus`, `gateway`, `l2`, `l1`
- `components`: the boxes to light up in the architecture diagram (`channel`, `kyc`, `giro`, `hold`, `omnibus`, `depot`, `journal`, `api`, `compliance`, `custody`, `orchestrator`, `recon`, `sequencer`, `token`, `bond`, `dvp`, `batcher`, `proposer`, `batchInbox`, `disputeGame`, `portal`)
- `protocol`, `endpoint`, `payload`: the modelled interface and its message
- `level`: `info`, `success`, `warn` or `error`
- `link`: an explorer link where one exists

## How `observe()` attributes RL1 activity

- **unsafe → safe**: when the L2 safe head passes the transaction's block. In Simulation the batch's exact L2 range is known. Live, the batch is the most recent BatchInbox transaction posted after the L2 transaction, a heuristic that holds because the status is polled every 4 seconds. Blob contents are not decoded.
- **safe → finalized**: when the L2 finalized head passes the block.
- **Dispute game**: the first game whose commitment covers the transaction. Classic games commit to an L2 block number. OP Sepolia's newer super-root games commit to an L2 timestamp, so the gateway compares `l2Timestamp` instead. The creating RL1 transaction is found through the factory's `DisputeGameCreated` event.
- **Resolved**: when the game's status becomes `DEFENDER_WINS`.
