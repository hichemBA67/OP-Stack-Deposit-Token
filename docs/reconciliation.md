# Reconciliation

`Gateway.reconcile()` reads the token supplies (`status()`) and every onboarded client's on-chain balances, then compares them with OSPlus. Nothing is written on-chain.

## Checks

**Cash**

- Σ Sammelkonten across all institutes = S-EUR `totalSupply`
- For each Sparkasse: its Sammelkonto = Σ S-EUR in its clients' wallets

**Securities**

- Bond register `totalSupply` = Σ OSPlus Depot positions for the ISIN
- For each client: Depot position = on-chain bond balance

The result is a `ReconReport`:

```ts
interface ReconReport {
  ts: number;
  cash: {
    totalSupply: number;
    omnibusTotal: number;
    perInstitut: { institutId; name; omnibus; onChain }[];
    ok: boolean;
  };
  securities: {
    isin: string;
    registerTotal: number;
    osplusTotal: number;
    perKunde: { kundennr; name; depot; osplus; onChain }[];
    ok: boolean;
  };
  ok: boolean;
}
```

A mismatch is emitted as an error event ("Mismatch found"). In production it would raise a break for operations. The executive KPI "Books reconciled" shows 100% or "Break". The technical view's Reconciliation tab shows both tables with differences.

## Worked ledger example

Balances after each step of the default story, in euros. MS = Sparkasse Musterstadt (issuer's bank), BS = Sparkasse Beispielstadt (investor's bank).

| After step | Issuer Geschäftskonto | Investor Geschäftskonto | Sammelkonto MS | Sammelkonto BS | S-EUR issuer | S-EUR investor | S-EUR supply | Bonds issuer / investor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 Onboard | **20,000** | **250,000** | 0 | 0 | 0 | 0 | 0 | 0 / 0 |
| 2 Issue | 20,000 | 250,000 | 0 | 0 | 0 | 0 | 0 | **100 / 0** |
| 3 Tokenize | 20,000 | **150,000** | 0 | **100,000** | 0 | **100,000** | **100,000** | 100 / 0 |
| 4 DvP | 20,000 | 150,000 | **100,000** | **0** | **100,000** | **0** | 100,000 | **0 / 100** |
| 8 Coupon | 20,000 | 150,000 | **96,750** | **3,250** | **96,750** | **3,250** | 100,000 | 0 / 100 |
| 9 Redeem | **116,750** | 150,000 | **0** | 3,250 | **0** | 3,250 | **3,250** | 0 / 100 |

Bold marks what changed in that step.

The invariant holds after every step: Σ Sammelkonten = S-EUR supply, and each Sammelkonto equals the S-EUR held by that Sparkasse's clients. Final reconciliation: €3,250 = €3,250, and 100 bonds in the register = 100 bonds in OSPlus Depots.

### How the backing follows the tokens

- **Tokenize**: Geschäftskonto → Sammelkonto of the client's own Sparkasse (GV 801).
- **DvP**: €100,000 S-EUR move from a BS client to an MS client, so €100,000 of backing moves Sammelkonto BS → Sammelkonto MS (GV 803).
- **Coupon**: €3,250 move from an MS client to a BS client, so the backing moves MS → BS (GV 803).
- **Redeem**: Sammelkonto → Geschäftskonto after the burn (GV 802).
