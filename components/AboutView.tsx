import { SIM_PARAMS } from "@/lib/chain/simulated";

const rows: [string, string, string][] = [
  ["Customer & channel", "S-App, Online-Banking, Filiale", "Initiates orders; never talks to the chain directly."],
  ["OSPlus (simulated)", "Kunden, Girokonten, Sperren, Buchungsjournal, one Sammelkonto per Sparkasse", "System of record for fiat and customer data. Emits business events (outbox) and accepts bookings via API."],
  ["Abstraction layer", "Sparkassen Chain Gateway: saga orchestrator, compliance, custody/HSM, reconciliation", "Anti-corruption layer. Maps OSPlus concepts (IBAN, Buchung, EndToEndId) to ledger commands and back. Only component with chain keys."],
  ["OP Stack L2", "OP Sepolia (live) or simulated: sequencer, op-batcher, op-proposer, S-EUR contract", "Token ledger with ~2s blocks. In production this would be the Sparkassen's own OP Stack chain, run by or for the Sparkassen-Finanzgruppe."],
  ["RL1 (Ethereum)", "Ethereum Sepolia: BatchInbox (blobs), DisputeGameFactory, OptimismPortal", "Data availability and settlement: L2 blocks become final with L1 finality, and state roots can be challenged for 3.5 days."],
];

export function AboutView() {
  return (
    <div className="scroll-thin h-full space-y-5 overflow-y-auto p-4 text-[13px] leading-relaxed text-slate-700">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Layers</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <tbody className="divide-y divide-slate-100">
              {rows.map(([a, b, c]) => (
                <tr key={a} className="align-top">
                  <td className="py-1.5 pr-3 font-medium whitespace-nowrap text-slate-900">{a}</td>
                  <td className="py-1.5 pr-3">{b}</td>
                  <td className="py-1.5 text-slate-600">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-900">Three kinds of finality</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>Unsafe</b>: the sequencer included the tx in an L2 block. Instant UX, but it only relies on the sequencer.</li>
          <li><b>Safe</b>: op-batcher posted the block&apos;s data to L1. Anyone can re-derive it; a sequencer can no longer silently rewrite it.</li>
          <li><b>Finalized</b>: the L1 block with that batch is finalized (~13 min). This is the natural point for &quot;Buchung endgültig&quot;.</li>
        </ol>
        <p className="mt-2">
          Separately, op-proposer posts the L2 <b>output root</b> to a dispute game. After the challenge window (3.5 days, plus a further delay before withdrawals)
          the state is provable on L1, which is only needed to move assets <i>from L2 to L1</i>, not for payments between customers.
        </p>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-900">Simulation timings</h3>
        <p>
          L2 block {SIM_PARAMS.l2BlockMs / 1000}s (real 2s) · L1 block {SIM_PARAMS.l1BlockMs / 1000}s (real 12s) · batch every{" "}
          {SIM_PARAMS.batchEveryL1Blocks} L1 blocks · L1 finality after {SIM_PARAMS.l1FinalityDepth} blocks (real ~64) · proposal every{" "}
          {SIM_PARAMS.proposalIntervalMs / 1000}s · challenge window {SIM_PARAMS.challengeWindowMs / 1000}s (real 3.5 days). In <b>Live</b>{" "}
          mode nothing is simulated except OSPlus: heads, batches and dispute games are read from the actual chains.
        </p>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-900">What a production design would need to address</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Confidentiality</b>: rollup batches on public Ethereum make every L2 tx public. Options: OP Stack Alt-DA (bank-run DA with only commitments on L1), privacy layers, or posting only hashes. This is the biggest design decision for a bank.</li>
          <li><b>Regulatory classification</b>: tokenized commercial-bank deposit (deposit guarantee applies) vs. e-money token under MiCA; BaFin, DORA outsourcing and ICT risk for sequencer/DA operators.</li>
          <li><b>Sequencer operation</b>: run by FI (or a Verbund entity) in its data centres; permissioned dispute games; key management in HSMs.</li>
          <li><b>OSPlus integration</b>: real event streaming (outbox/CDC), idempotency on EndToEndId, end-of-day reconciliation, cut-off times, Storno handling.</li>
          <li><b>Interoperability</b>: interbank settlement between Sparkassen/Landesbanken and with the digital euro or wholesale CBDC settlement.</li>
        </ul>
      </section>

      <p className="text-[11px] text-slate-400">
        Independent technical demo. Not affiliated with, endorsed by, or using data of Finanz Informatik, the DSGV or any Sparkasse. All institutes, customers and IBANs are fictitious.
      </p>
    </div>
  );
}
