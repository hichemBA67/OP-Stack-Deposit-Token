/** Terms of the demo bond: a fictitious green bond of a municipal utility, issued as an eWpG crypto security. */
export const BOND = {
  name: "Stadtwerke Musterstadt 3.25% Green Bond 2029",
  symbol: "SWMS29",
  isin: "DE000A4SWMS3", // fictitious, with a valid ISIN check digit
  nominalCents: 1_000_00, // one bond = EUR 1,000 nominal
  couponBps: 325, // 3.25 % p.a.
  maturity: "2029-09-30",
  issueUnits: 100, // EUR 100,000 issue volume
} as const;

export const BOND_MATURITY_UNIX = Math.floor(Date.UTC(2029, 8, 30) / 1000);

/** Annual coupon per bond in euro cents. */
export const COUPON_PER_UNIT = (BOND.nominalCents * BOND.couponBps) / 10_000;
