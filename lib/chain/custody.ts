import { concat, keccak256, stringToHex, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "../types";

/**
 * Custodial wallet derivation. In production the keys live in the bank's HSM;
 * here a customer's key is derived deterministically from a custody seed and the
 * IBAN, so the same customer always maps to the same address.
 */
export function deriveCustodyAccount(seed: string, iban: string) {
  const pk = keccak256(concat([toHex(seed), toHex(`custody:${iban}`)]));
  return privateKeyToAccount(pk);
}

/** OSPlus references travel on-chain as bytes32 (readable when decoded). */
export function refToBytes32(ref: string): Hex {
  return stringToHex(ref.slice(0, 32), { size: 32 });
}
