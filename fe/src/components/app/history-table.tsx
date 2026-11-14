import { formatInt, formatNear, initials } from "@/lib/format";
import type { ExecutionRecord } from "@/lib/types";
import { failoverText, foldFailovers } from "./recent-executions";
import { AccountLink, EmptyState, FailoverPill, Outcome, Panel, PanelHead, TableScroll, td, th, thead } from "./ui";

/** `paid` is gross (spec §2): the keeper receives paid − paid × fee_bps / 10 000. */
const net = (paid: string, feeBps: number) => {
  const p = BigInt(paid);
  return p - (p * BigInt(feeBps)) / BigInt(10000);
};

export function HistoryTable({ history, kept, feeBps }: { history: ExecutionRecord[]; kept?: number; feeBps?: number }) {
  const events = foldFailovers(history).reverse(); // newest first

  const note = (e: (typeof events)[number]) =>
    e.slashed ? (
      <FailoverPill>{failoverText(e)}</FailoverPill>
    ) : e.outcome === "ReturnedFalse" ? (
      <span className="text-ink-2">Target returned false. Nothing to do, not paid.</span>
    ) : e.outcome === "Failed" ? (
      <span className="text-ink-2">Target call failed. No payment.</span>
    ) : e.open_mode ? (
      <span className="text-ink-3">Open mode</span>
    ) : (
      <span className="text-ink-3">—</span>
    );

  return (
    <Panel>
      <PanelHead title="Execution history" right={kept ? `Last ${kept} runs kept on-chain` : undefined} />
      {events.length === 0 ? (
        <EmptyState title="No runs yet">The first execution shows up here.</EmptyState>
      ) : (
        <>
          <TableScroll>
            <table className="hidden w-full min-w-[860px] md:table">
              <thead className={thead}>
                <tr>
                  <th className={th}>Round</th>
                  <th className={th}>Executor</th>
                  <th className={th}>Outcome</th>
                  <th className={th}>Paid (gross)</th>
                  <th className={th}>Due → exec</th>
                  <th className={th}>Epoch</th>
                  <th className={th}>Note</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const late = e.due_block != null ? e.exec_block - e.due_block : null;
                  return (
                    <tr key={`${e.round_id}-${e.exec_block}`} className="border-t border-line first:border-t-0">
                      <td className={`${td} font-display text-base`}>#{e.round_id}</td>
                      <td className={td}><AccountLink id={e.executor} className="text-sm text-ink" /></td>
                      <td className={td}><Outcome outcome={e.outcome} /></td>
                      <td className={`${td} font-semibold whitespace-nowrap tabular-nums`}>
                        {e.paid === "0" ? (
                          <span className="font-normal text-ink-3">0</span>
                        ) : (
                          <>
                            {formatNear(e.paid)} NEAR
                            {feeBps != null && (
                              <span className="block text-xs font-normal text-ink-3">keeper got {formatNear(net(e.paid, feeBps))}</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className={`${td} text-ink-2 tabular-nums`}>{late == null ? "—" : `+${formatInt(late)} blocks`}</td>
                      <td className={`${td} text-ink-2 tabular-nums`}>{formatInt(e.epoch)}</td>
                      <td className={td}>{note(e)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
          <ul className="mx-4 mb-4 divide-y divide-line overflow-hidden rounded-2xl border border-line md:hidden">
            {events.map((e) => {
              const late = e.due_block != null ? e.exec_block - e.due_block : null;
              return (
                <li key={`${e.round_id}-${e.exec_block}`} className="grid gap-1.5 px-4 py-4">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold">Round #{e.round_id} · {initials(e.executor)}</span>
                    <Outcome outcome={e.outcome} paid={e.paid} />
                  </span>
                  <span className="text-[13px] text-ink-3">
                    {late == null ? `block #${formatInt(e.exec_block)}` : `+${formatInt(late)} blocks after due`}
                  </span>
                  {(e.slashed || e.outcome === "Failed" || e.outcome === "ReturnedFalse") && <span className="text-[13px]">{note(e)}</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
