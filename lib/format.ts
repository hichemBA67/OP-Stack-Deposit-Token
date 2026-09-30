const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export const fmtEur = (cents: number) => eur.format(cents / 100);

export const short = (hex?: string, n = 6) =>
  !hex ? "—" : hex.length <= 2 * n + 2 ? hex : `${hex.slice(0, n + 2)}…${hex.slice(-4)}`;

export const fmtIban = (iban: string) => iban.replace(/(.{4})/g, "$1 ").trim();

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("de-DE", { hour12: false }) +
  "." +
  String(new Date(ts).getMilliseconds()).padStart(3, "0").slice(0, 2);

export const fmtDuration = (ms: number) => {
  if (ms <= 0) return "0s";
  const s = Math.ceil(ms / 1000);
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
};

export function randomHex(bytes: number): `0x${string}` {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return `0x${Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
