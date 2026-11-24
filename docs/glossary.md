# Glossary

| Term | Meaning |
| --- | --- |
| Atomic settlement | All parts of a transaction succeed together or none do. There is no state in which only one side has delivered |
| Blob | A cheap data attachment for RL1 transactions (EIP-4844), designed for rollups. Kept by RL1 nodes for ~18 days |
| Coupon | The bond's interest: 3.25% per year on the nominal value, paid to whoever holds the bond on the coupon date |
| Crypto securities register (Kryptowertpapierregister) | The register in which an eWpG crypto security is recorded, kept by a BaFin-licensed registrar. Here: the `BondToken` contract, with the gateway as registrar |
| Depot | A securities account in OSPlus. It mirrors the client's positions in the crypto securities register |
| Dispute game | An RL1 contract in which a proposed L2 state (output root) can be challenged for 3.5 days before it is accepted |
| DvP | Delivery versus payment: securities are delivered only if payment happens, and vice versa. Here both legs settle in one transaction |
| EndToEndId | The business reference that travels with a payment. Here it is also stored on-chain as `bytes32` |
| eWpG | German Electronic Securities Act (2021). Allows securities to be issued electronically, including as crypto securities in a blockchain-based register |
| Gas | The fee for running a transaction. The gateway pays it in OP Sepolia ETH, and clients never see it |
| GV code | Geschäftsvorfallcode: the transaction type code on each booking |
| ISIN | International Securities Identification Number, e.g. `DE000A4SWMS3` for the demo bond (fictitious, valid check digit) |
| KYB | Know your business: identification of a company and its beneficial owners |
| L2 | A faster chain on top of RL1 that bundles many transactions and publishes them on RL1. Here: OP Sepolia, built with the OP Stack |
| OP Stack | Optimism's open-source rollup software (op-geth, op-node, op-batcher, op-proposer). OP Mainnet, Base and OP Sepolia run on it |
| op-batcher | Compresses L2 blocks and publishes them on RL1 as blobs. This is what anchors transactions on RL1 |
| op-proposer | Regularly publishes an output root of the L2 state on RL1 in a dispute game |
| OSPlus | The core banking system of the Sparkassen, operated by Finanz Informatik. Simulated here |
| RL1 | Regulated Layer One: an EVM-based settlement layer run by known, regulated validators with BFT consensus. The Sepolia test network in this demo |
| S-EUR | The demo's cash token: tokenized deposits, 1 S-EUR = €1 on a Sparkasse's Sammelkonto. Permissioned and redeemable at par |
| Saga | A multi-step business process where each step has an undo if a later step fails |
| Sammelkonto | The omnibus account in OSPlus, one per Sparkasse, holding the euros that back its clients' S-EUR |
| Sequencer | The node (op-geth + op-node) that orders transactions into L2 blocks every 2 seconds |
| Sperre | A hold that blocks part of a balance while a process runs, so the money can't be spent twice |
| T+2 | Traditional securities settlement two business days after the trade (the EU moves to T+1 in 2027) |
| Unsafe / safe / finalized | Confirmed by the L2 sequencer only / data published on RL1 / RL1 block final. On a Regulated Layer One, safe and finalized coincide |
