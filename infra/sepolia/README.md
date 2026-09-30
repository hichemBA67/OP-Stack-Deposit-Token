# Your own OP Stack chain on Ethereum Sepolia (or Mainnet)

This is the path from "demo" to "our own rollup settling on a public Ethereum".
It is the same software as the local Kurtosis devnet, but you deploy the L1
contracts yourself and run the L2 services on a server.

> Status: **template, not yet executed from this repo.** Flags change between
> op-stack releases, so check each command against
> <https://docs.optimism.io/operators/chain-operators/deploy> for the release you pin.

## What it costs and what it needs

| Item | Notes |
| --- | --- |
| Sepolia ETH | A few ETH for the deployer (L1 contract deployment) plus ongoing ETH for the batcher (blobs) and proposer (dispute games). Faucets give small amounts; plan for this. |
| 5 keys | deployer/admin, batcher, proposer, challenger, sequencer (p2p). Separate keys, HSM/KMS in anything beyond a demo. |
| A server | op-geth + op-node + op-batcher + op-proposer (+ op-challenger) run 24/7. 4 vCPU / 16 GB RAM / 200 GB SSD is plenty for a demo chain. **Not Vercel**: these are long-running stateful processes. |
| An L1 RPC with blob support | Sepolia execution RPC + beacon API (op-node needs the beacon endpoint to read blobs). A provider like Alchemy/Infura/QuickNode, or your own node. |

Mainnet is the same procedure with `--l1-chain-id 1`, but with real ETH and real
operational obligations, so it's not a demo target.

Managed alternative: Rollup-as-a-Service providers (e.g. Conduit, Gelato,
Caldera) deploy and operate an OP Stack chain for you on Sepolia; you then just
point `L1_RPC_URL`/`L2_RPC_URL` at it.

## 1. Deploy the L1 contracts with op-deployer

```bash
docker pull us-docker.pkg.dev/oplabs-tools-artifacts/images/op-deployer:v0.4.2
alias op-deployer='docker run --rm -v $PWD/.deployer:/deployer -w /deployer us-docker.pkg.dev/oplabs-tools-artifacts/images/op-deployer:v0.4.2'

op-deployer init --l1-chain-id 11155111 --l2-chain-ids 4206942 --workdir /deployer --intent-type standard-overrides
# edit .deployer/intent.toml: set the role addresses (batcher, proposer, challenger,
# systemConfigOwner, l1ProxyAdminOwner, l2ProxyAdminOwner, unsafeBlockSigner)
op-deployer apply --workdir /deployer --l1-rpc-url "$SEPOLIA_RPC" --private-key "$DEPLOYER_KEY"

op-deployer inspect genesis --workdir /deployer 4206942 > .deployer/genesis.json
op-deployer inspect rollup  --workdir /deployer 4206942 > .deployer/rollup.json
op-deployer inspect l1      --workdir /deployer 4206942 > .deployer/l1-addresses.json
```

`l1-addresses.json` contains the `OptimismPortalProxy`, `DisputeGameFactoryProxy`,
`SystemConfigProxy` etc. `rollup.json` contains `batch_inbox_address`.

## 2. Run the L2 services

See [`docker-compose.yml`](./docker-compose.yml). Fill `.env` next to it, then:

```bash
docker compose up -d
```

## 3. Point the demo at it

```bash
L1_RPC_URL=<sepolia rpc>
L2_RPC_URL=http://<server>:8545
OP_NODE_RPC_URL=http://<server>:9545
GATEWAY_PRIVATE_KEY=<fund with L2 ETH via the OptimismPortal / L1StandardBridge deposit>
L1_EXPLORER_URL=https://sepolia.etherscan.io
DEMO_ACCESS_TOKEN=<something random>
```

Put the RPCs behind TLS and an auth proxy before exposing them to Vercel.
