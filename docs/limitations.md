# Limitations & production gaps

## Found in the code

| Area | Observation | Impact |
| --- | --- | --- |
| Gateway placement | Compliance, limits and saga logic run in the browser. The server only signs | Anyone with the token can mint, burn or settle arbitrary amounts on the run's contracts |
| State | OSPlus, the gateway and the run's contract addresses live only in browser memory | A reload loses the run. No recovery for half-finished sagas |
| Nonce handling | The nonce counter and write queue are module-level per server instance | Parallel serverless instances could collide. Fine for single-user demos |
| Coupon idempotency | `payCoupon` does not record the coupon period or reference | The same coupon could be paid twice if instructed twice |
| Bond lifecycle | `maturity` is stored but not enforced. There is no redemption of the bond itself | The lifecycle ends at the first coupon |
| Direct transfers | `transfer` / `transferFrom` exist for allowlisted holders | A way around DvP if a client key were ever exposed |
| Reference size | References are cut to 32 characters for `bytes32` | Real EndToEndIds (up to 35 characters) need hashing or an event payload |
| Batch attribution | Live batch-to-transaction matching is a timing heuristic. Blobs are not decoded | The linked batch very likely, but not provably, contains the transaction |
| Finality KPI | Live "Final on RL1" measures anchoring on Sepolia, not BFT finality | Valid only under the RL1 assumption |
| `SettlementAnchor` | Written and compiled, not wired into the live adapter | Per-trade RL1 anchoring is not demonstrated yet |
| GitHub Pages | Static export, no server | Simulation only. Live mode needs `pnpm dev`, a Node server or Vercel |

## Design decisions for production

- **Confidentiality** is the biggest decision for a bank. Rollup batches on a public RL1 make every L2 transaction public. Options: OP Stack Alt-DA (bank-run data availability with only commitments on L1), privacy layers, or posting only hashes.
- **Regulatory classification**: a tokenized commercial-bank deposit (deposit guarantee applies) vs. an e-money token under MiCA. BaFin supervision, DORA outsourcing and ICT risk for sequencer and DA operators.
- **eWpG roles**: the crypto securities register must be kept by a BaFin-licensed registrar (Kryptowertpapierregisterführung), the terms are deposited with it, and custody of crypto securities is a licensed activity (Kryptoverwahrung). The Sparkassen's existing securities processing (dwpbank) needs a connection.
- **Sequencer operation**: run by Finanz Informatik or a Verbund entity in its data centres, permissioned dispute games, keys in HSMs.
- **OSPlus integration**: real event streaming (outbox / CDC), idempotency on the EndToEndId, end-of-day reconciliation, cut-off times, Storno handling.
- **Interoperability**: interbank settlement between Sparkassen and Landesbanken (the Girozentrale clearing the demo models as GV 803), and with a digital euro or wholesale CBDC settlement.
