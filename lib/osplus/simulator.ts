/**
 * OSPlus simulator.
 *
 * A deliberately small model of the Finanz Informatik core banking system as seen
 * from an integration point of view: multi-client (one "Mandant" per Sparkasse),
 * customers with KYC/Legitimation status, IBAN accounts, holds (Sperren/
 * Vormerkungen), a booking journal with GV codes, and one omnibus account per
 * institute that backs the tokenized deposits 1:1.
 *
 * Nothing here knows about blockchains - that is the job of the gateway.
 */

export interface Institut {
  id: string;
  name: string;
  blz: string;
  bic: string;
}

export interface Kunde {
  kundennr: string;
  name: string;
  institutId: string;
  kyc: "verified" | "pending";
  girokonto: string; // IBAN
}

export interface Konto {
  iban: string;
  institutId: string;
  kundennr?: string;
  produkt: "Girokonto" | "Sammelkonto Tokenisierte Einlagen";
  saldo: number; // cents
}

export interface Sperre {
  id: string;
  iban: string;
  betrag: number;
  grund: string;
  ref: string;
  status: "aktiv" | "aufgeloest";
  ts: number;
}

export interface Buchung {
  id: string;
  ts: number;
  iban: string;
  gegenIban?: string;
  betrag: number; // signed cents
  gvCode: string;
  buchungstext: string;
  ref: string; // EndToEndId
  status: "gebucht" | "storniert";
}

export const INSTITUTE: Institut[] = [
  { id: "SPK-MS", name: "Sparkasse Musterstadt", blz: "12345678", bic: "MUSTDEM1XXX" },
  { id: "SPK-BS", name: "Sparkasse Beispielstadt", blz: "87654321", bic: "BSPLDEB1XXX" },
];

/** GV codes (Geschäftsvorfallcodes). 1xx are DK-standard, 8xx are demo-specific. */
export const GV = {
  SEPA_GUTSCHRIFT: "166",
  TOKENISIERUNG: "801",
  RUECKTAUSCH: "802",
  INTERBANK: "803",
} as const;

/** German IBAN with a valid ISO 7064 mod-97 check digit. */
export function makeIban(blz: string, kontonr: number): string {
  const bban = blz + String(kontonr).padStart(10, "0");
  const numeric = bban + "131400"; // "DE00" -> D=13, E=14, 00
  const check = 98 - Number(BigInt(numeric) % 97n);
  return `DE${String(check).padStart(2, "0")}${bban}`;
}

export interface OsplusState {
  kunden: Kunde[];
  konten: Konto[];
  sperren: Sperre[];
  journal: Buchung[];
}

export class OsplusSimulator {
  state: OsplusState = { kunden: [], konten: [], sperren: [], journal: [] };
  private seq = { kunde: 1000, konto: 4711, buchung: 1, sperre: 1 };

  constructor() {
    for (const inst of INSTITUTE) {
      this.state.konten.push({
        iban: makeIban(inst.blz, 9_990_000_001),
        institutId: inst.id,
        produkt: "Sammelkonto Tokenisierte Einlagen",
        saldo: 0,
      });
    }
  }

  institut(id: string) {
    return INSTITUTE.find((i) => i.id === id)!;
  }
  konto(iban: string) {
    const k = this.state.konten.find((k) => k.iban === iban);
    if (!k) throw new Error(`OSPlus: Konto ${iban} unbekannt`);
    return k;
  }
  kunde(kundennr: string) {
    const k = this.state.kunden.find((k) => k.kundennr === kundennr);
    if (!k) throw new Error(`OSPlus: Kunde ${kundennr} unbekannt`);
    return k;
  }
  omnibus(institutId: string) {
    return this.state.konten.find(
      (k) => k.institutId === institutId && k.produkt === "Sammelkonto Tokenisierte Einlagen",
    )!;
  }

  /** Verfügbarer Saldo = Saldo minus aktive Sperren. */
  verfuegbar(iban: string) {
    const gesperrt = this.state.sperren
      .filter((s) => s.iban === iban && s.status === "aktiv")
      .reduce((a, s) => a + s.betrag, 0);
    return this.konto(iban).saldo - gesperrt;
  }

  kundeAnlegen(name: string, institutId: string): Kunde {
    const inst = this.institut(institutId);
    const kundennr = String(++this.seq.kunde);
    const iban = makeIban(inst.blz, ++this.seq.konto);
    this.state.konten.push({ iban, institutId, kundennr, produkt: "Girokonto", saldo: 0 });
    const kunde: Kunde = { kundennr, name, institutId, kyc: "verified", girokonto: iban };
    this.state.kunden.push(kunde);
    return kunde;
  }

  private book(b: Omit<Buchung, "id" | "ts" | "status">): Buchung {
    const buchung: Buchung = {
      ...b,
      id: `BU-${String(this.seq.buchung++).padStart(6, "0")}`,
      ts: Date.now(),
      status: "gebucht",
    };
    this.konto(b.iban).saldo += b.betrag;
    this.state.journal.unshift(buchung);
    return buchung;
  }

  /** Incoming SEPA credit transfer (pacs.008) from an external bank. */
  sepaGutschrift(iban: string, betrag: number, auftraggeber: string, ref: string) {
    return this.book({
      iban,
      betrag,
      gvCode: GV.SEPA_GUTSCHRIFT,
      buchungstext: `SEPA-Gutschrift ${auftraggeber}`,
      ref,
    });
  }

  sperreSetzen(iban: string, betrag: number, grund: string, ref: string): Sperre {
    if (this.verfuegbar(iban) < betrag) throw new Error("OSPlus: Verfügbarer Saldo nicht ausreichend");
    const s: Sperre = {
      id: `SP-${String(this.seq.sperre++).padStart(5, "0")}`,
      iban,
      betrag,
      grund,
      ref,
      status: "aktiv",
      ts: Date.now(),
    };
    this.state.sperren.unshift(s);
    return s;
  }

  sperreAufloesen(id: string) {
    const s = this.state.sperren.find((s) => s.id === id);
    if (s) s.status = "aufgeloest";
    return s;
  }

  /** Internal transfer (Umbuchung) between two OSPlus accounts: two journal lines. */
  umbuchung(soll: string, haben: string, betrag: number, gvCode: string, text: string, ref: string) {
    const debit = this.book({ iban: soll, gegenIban: haben, betrag: -betrag, gvCode, buchungstext: text, ref });
    const credit = this.book({ iban: haben, gegenIban: soll, betrag, gvCode, buchungstext: text, ref });
    return [debit, credit] as const;
  }
}
