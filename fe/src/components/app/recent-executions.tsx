import Link from "next/link";
import { formatInt, initials } from "@/lib/format";
import { jobHref } from "@/lib/routes";
import type { ExecutionRecord } from "@/lib/types";
import { FailoverPill, Outcome, Panel, PanelHead } from "./ui";

export type JobExecution = ExecutionRecord & { job_id: number };
export type ExecutionEvent = JobExecution & { slashed?: string };

/**
 * One event per run. The contract writes a failover as two rows in the same
 * round: `Slashed` for the keeper that missed its window, then the takeover's
 * `Paid`. Those two are folded into a single event carrying the slashed keeper.
 */
export function foldFailovers<T extends ExecutionRecord>(rows: T[]): (T & { slashed?: string })[] {
  const out: (T & { slashed?: string })[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const next = rows[i + 1];
    if (r.outcome === "Slashed" && next && next.round_id === r.round_id && next.outcome !== "Slashed") {
      out.push({ ...next, slashed: r.slashed_keeper ?? r.executor });
      i++;
    } else {
      out.push(r.outcome === "Slashed" ? { ...r, slashed: r.slashed_keeper ?? r.executor } : r);
    }
  }
  return out;
}

/**
 * Spec §5.5: in the same round, a run by the keeper that was just slashed is
 * "late, penalised, still executed"; a run by anyone else is a failover.
 */
export function failoverText(e: { outcome: string; executor: string; slashed?: string }): string | null {
  if (!e.slashed) return null;
  if (e.outcome === "Slashed") return `${initials(e.slashed)} missed its window and was slashed`;
  if (e.executor === e.slashed) return `Late: ${initials(e.slashed)} was slashed, then ran it anyway`;
  return `Failover: ${initials(e.slashed)} slashed, ${initials(e.executor)} took over`;
}

export function RecentExecutions({ events }: { events: ExecutionEvent[] }) {
  return (
    <Panel>
      <PanelHead title="Recent executions" right="latest first" />
      {events.length === 0 ? (
        <p className="border-t border-line px-6 py-10 text-center text-base text-ink-3">No runs yet.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {events.map((e) => {
            const late = e.due_block != null ? e.exec_block - e.due_block : null;
            return (
              <li key={`${e.job_id}-${e.round_id}-${e.exec_block}`} className="px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={jobHref(e.job_id)} className="text-sm font-semibold hover:text-amber">
                    Job #{e.job_id} · round {e.round_id} · {initials(e.executor)}
                  </Link>
                  <Outcome outcome={e.outcome} paid={e.paid} />
                </div>
                <p className="mt-1 text-[13px] text-ink-3">
                  {late != null ? `+${formatInt(late)} blocks after due` : `block #${formatInt(e.exec_block)}`}
                  {e.outcome === "ReturnedFalse" && " · nothing to do, not paid"}
                  {e.open_mode && e.outcome === "Paid" && !e.slashed && " · open mode"}
                </p>
                {e.slashed && (
                  <div className="mt-2.5">
                    <FailoverPill>{failoverText(e)}</FailoverPill>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
