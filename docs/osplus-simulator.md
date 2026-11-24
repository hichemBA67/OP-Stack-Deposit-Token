# OSPlus simulator

`lib/osplus/simulator.ts` is a deliberately small model of the Finanz Informatik core banking system, seen from an integration point of view. It is multi-client (one Mandant per Sparkasse) and knows nothing about blockchains: that is the gateway's job. Field names stay in German to match OSPlus vocabulary.

## Institutes

| id | Name | BLZ | BIC |
| --- | --- | --- | --- |
| `SPK-MS` | Sparkasse Musterstadt | 12345678 | `MUSTDEM1XXX` |
| `SPK-BS` | Sparkasse Beispielstadt | 87654321 | `BSPLDEB1XXX` |

The constructor creates one **Sammelkonto Tokenisierte Einlagen** (omnibus account, account number 9990000001) per institute, with a zero balance.

## Data model

| Entity | Key fields | Notes |
| --- | --- | --- |
| `Institut` | `id, name, blz, bic` | Two fixed institutes |
| `Kunde` | `kundennr, name, institutId, art, rolle, kyc, girokonto, depot` | `art` = Firmenkunde, `rolle` = Emittent or Investor. Client numbers start at 1001 |
| `Konto` | `iban, institutId, kundennr?, produkt, saldo` (cents) | `produkt` is "Geschäftskonto" or "Sammelkonto Tokenisierte Einlagen" |
| `Sperre` | `id, iban, betrag, grund, ref, status, ts` | Status "aktiv" or "aufgeloest". IDs `SP-00001`… |
| `Buchung` | `id, ts, iban, gegenIban?, betrag (signed), gvCode, buchungstext, ref, status` | `ref` is the EndToEndId. IDs `BU-000001`… |
| `Depotposition` | `depot, kundennr, isin, stueck` | Mirrors the crypto securities register |
| `WpBuchung` | `id, ts, depot, isin, stueck (signed), text, ref` | Securities journal. IDs `WP-00001`… |

The full state is `OsplusState { kunden, konten, sperren, journal, depots, wpJournal }`.

## Operations

| Method | Effect |
| --- | --- |
| `kundeAnlegen(name, institutId, rolle, anfangssaldo, ref)` | Creates the client, a Geschäftskonto with a valid IBAN and a Depot number (`{first 3 digits of BLZ}-7001xx`). Books the opening balance as "Saldovortrag" (GV 000) |
| `verfuegbar(iban)` | Available balance = saldo − sum of active Sperren |
| `sperreSetzen(iban, betrag, grund, ref)` | Places a hold. Throws if the available balance is insufficient |
| `sperreAufloesen(id)` | Releases a hold |
| `umbuchung(soll, haben, betrag, gvCode, text, ref)` | Internal transfer, written as two journal lines (debit and credit) with the same ref |
| `depotBuchung(kundennr, isin, stueck, text, ref)` | Securities posting. Creates the Depot position if needed |
| `bestand(kundennr, isin)` | Current Depot position |
| `omnibus(institutId)` | That Sparkasse's Sammelkonto |

## GV codes

| Code | Meaning | Booked when |
| --- | --- | --- |
| `000` | Saldovortrag (opening balance) | Client creation |
| `801` | Tokenisierung (demo-specific) | Geschäftskonto → Sammelkonto after a mint |
| `802` | Rücktausch (demo-specific) | Sammelkonto → Geschäftskonto after a burn |
| `803` | Interbankausgleich (demo-specific) | Sammelkonto → Sammelkonto when S-EUR moves between clients of different Sparkassen |

## IBANs

`makeIban(blz, kontonr)` builds a German IBAN with a valid ISO 7064 mod-97 check digit: `DE` + 2-digit check + 8-digit BLZ + 10-digit account number. Client accounts start at 4712.

## What a real integration would add

Real event streaming (outbox or change data capture), idempotency on the EndToEndId, cut-off times, Storno handling, end-of-day processing and persistence. See [Limitations](limitations.md).
