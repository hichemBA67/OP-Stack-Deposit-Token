"use client";

import { useDemo } from "@/lib/store";
import { fmtDuration, short } from "@/lib/format";
import { StageBadge, cn } from "./ui";

function Link({ base, kind, hash }: { base?: string; kind: "tx" | "address" | "block"; hash: string }) {
  if (!base) return <span className="font-mono">{short(hash)}</span>;
  return (
    <a className="font-mono text-sky-700 hover:underline" href={`${base}/${kind}/${hash}`} target="_blank" rel="noreferrer">
      {short(hash)}
    </a>
  );
}

const th = "py-1 pr-3 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400";
const td = "py-1 pr-3";

export function LedgerView() {
  const s = useDemo();
  const st = s.status;
  const tracked = s.engine().gateway.tracked;
  if (!st) return <div className="p-8 text-center text-sm text-slate-500">Waiting for chain status…</div>;
  const l1x = st.l1.explorer;
  const l2x = st.l2.explorer;
  const txBlocks = new Set(tracked.map((t) => t.l2Block));

  return (
    <div className="scroll-thin h-full space-y-5 overflow-y-auto p-3 text-[12px]">
      <section>
        <div className="mb-1.5 flex items-baseline justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">L2 blocks ({st.l2.name})</h4>
          <span className="flex gap-3 text-[11px]">
            <span className="text-amber-700">■ unsafe (sequencer only)</span>
            <span className="text-sky-700">■ safe (batch on RL1)</span>
            <span className="text-emerald-700">■ finalized (RL1 final)</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {st.l2Blocks.map((b) => {
            const stage = b.number <= st.l2.finalized ? "fin" : b.number <= st.l2.safe ? "safe" : "unsafe";
            return (
              <div
                key={b.number}
                title={`#${b.number} · ${b.txCount} txs · ${b.hash}`}
                className={cn(
                  "relative flex h-9 w-14 flex-col items-center justify-center rounded border font-mono text-[10px] leading-tight",
                  stage === "fin" && "border-emerald-300 bg-emerald-50 text-emerald-800",
                  stage === "safe" && "border-sky-300 bg-sky-50 text-sky-800",
                  stage === "unsafe" && "border-amber-300 bg-amber-50 text-amber-800",
                )}
              >
                #{b.number}
                <span className="text-[9px] opacity-70">{b.txCount} tx</span>
                {txBlocks.has(b.number) && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-violet-600 ring-2 ring-white" />}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Gateway transactions → settlement status</h4>
        {!tracked.length ? (
          <p className="text-slate-500">No value transactions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th className={th}>Business event</th>
                  <th className={th}>L2 tx</th>
                  <th className={th}>L2 block</th>
                  <th className={th}>Stage</th>
                  <th className={th}>Batch (RL1)</th>
                  <th className={th}>Output root</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tracked.map((t) => (
                  <tr key={t.hash}>
                    <td className={td}>{t.label}</td>
                    <td className={td}>
                      <Link base={l2x} kind="tx" hash={t.hash} />
                    </td>
                    <td className={cn(td, "font-mono")}>#{t.l2Block}</td>
                    <td className={td}>
                      <StageBadge stage={t.stage} />
                    </td>
                    <td className={td}>{t.batchTx ? <Link base={l1x} kind="tx" hash={t.batchTx} /> : "—"}</td>
                    <td className={td}>
                      {t.proposalIndex === undefined ? "—" : `game #${t.proposalIndex} ${t.resolved ? "✓ resolved" : "· in challenge"}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">op-batcher → RL1 BatchInbox</h4>
          {!st.batches.length ? (
            <p className="text-slate-500">No batches observed yet.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>RL1 block</th>
                  <th className={th}>RL1 tx</th>
                  <th className={th}>L2 range</th>
                  <th className={th}>Data</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {st.batches.slice(0, 10).map((b) => (
                  <tr key={b.l1TxHash}>
                    <td className={cn(td, "font-mono")}>#{b.l1Block}</td>
                    <td className={td}>
                      <Link base={l1x} kind="tx" hash={b.l1TxHash} />
                    </td>
                    <td className={cn(td, "font-mono")}>{b.l2From ? `#${b.l2From}–${b.l2To}` : "—"}</td>
                    <td className={td}>{b.blobs ? `${b.blobs} blob${b.bytes ? ` · ${b.bytes} B` : ""}` : `calldata ${b.bytes ?? ""} B`}</td>
                    <td className={td}>{b.finalized ? <span className="text-emerald-700">finalized</span> : <span className="text-sky-700">included</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">op-proposer → dispute games</h4>
          {!st.proposals.length ? (
            <p className="text-slate-500">No output proposals observed yet.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Game</th>
                  <th className={th}>L2 block</th>
                  <th className={th}>Root claim</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {st.proposals.slice(0, 8).map((p) => (
                  <tr key={p.index}>
                    <td className={td}>
                      #{p.index} <Link base={l1x} kind="address" hash={p.gameAddress} />
                    </td>
                    <td className={cn(td, "font-mono")}>#{p.l2Block}</td>
                    <td className={cn(td, "font-mono")}>{short(p.rootClaim)}</td>
                    <td className={td}>
                      {p.status === "IN_PROGRESS" ? (
                        <span className="text-amber-700">
                          challenge window{p.challengeEndsAt ? ` · ${fmtDuration(p.challengeEndsAt - st.now)}` : ""}
                        </span>
                      ) : (
                        <span className={p.status === "DEFENDER_WINS" ? "text-emerald-700" : "text-red-700"}>{p.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {st.notes && st.notes.length > 0 && (
        <ul className="list-disc pl-5 text-[11px] text-slate-500">
          {st.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
