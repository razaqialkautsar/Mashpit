"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatNear, initials, scheduleLabel, shortAccount } from "@/lib/format";
import { phaseClock } from "@/lib/phase";
import { jobHref } from "@/lib/routes";
import type { Config, JobSummary, JobView } from "@/lib/types";
import { Outcome, Panel, PanelHead, PhasePill, TableScroll, td, th, thead } from "./ui";

type Filter = "All" | "Active" | "Paused";

export function LiveJobs({
  jobs,
  details,
  config,
}: {
  jobs: JobSummary[];
  details: Map<number, JobView>;
  config?: Config;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("All");
  const count = (f: Filter) => (f === "All" ? jobs.length : jobs.filter((j) => j.status === f).length);
  const shown = filter === "All" ? jobs : jobs.filter((j) => j.status === filter);

  return (
    <Panel>
      <PanelHead
        title="All jobs"
        right={
          <div role="radiogroup" aria-label="Filter jobs" className="flex rounded-full border border-line-strong bg-bg p-1">
            {(["All", "Active", "Paused"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  filter === f ? "bg-surface-3 text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {f} {count(f)}
              </button>
            ))}
          </div>
        }
      />

      {shown.length === 0 ? (
        <p className="border-t border-line px-6 py-10 text-center text-base text-ink-3">No {filter.toLowerCase()} jobs.</p>
      ) : (
        <>
          <TableScroll>
            <table className="hidden w-full min-w-[820px] md:table">
              <thead className={thead}>
                <tr>
                  <th className={th}>Job</th>
                  <th className={th}>Call</th>
                  <th className={th}>Phase</th>
                  <th className={th}>Ends in</th>
                  <th className={th}>Winner</th>
                  <th className={th}>Last run</th>
                  <th className={th}><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((j) => {
                  const d = details.get(j.id);
                  const clock = d && phaseClock(d, config);
                  return (
                    <tr
                      key={j.id}
                      onClick={() => router.push(jobHref(j.id))}
                      className="cursor-pointer border-t border-line transition-colors first:border-t-0 hover:bg-surface-2/60"
                    >
                      <td className={`${td} font-display text-lg`}>#{j.id}</td>
                      <td className={td}>
                        <Link href={jobHref(j.id)} className="block font-mono text-[15px] font-medium text-ink hover:text-amber">
                          {j.method}
                        </Link>
                        <span className="mt-1 block max-w-[34ch] truncate text-[13px] text-ink-3">
                          {shortAccount(j.target, 28)} · {scheduleLabel(j.schedule)}
                          {d && ` · ${d.success_rule === "Any" ? "Any" : "Must return true"}`}
                        </span>
                      </td>
                      <td className={td}>
                        <div className="flex flex-wrap gap-1.5">
                          <PhasePill phase={j.phase} />
                        </div>
                      </td>
                      <td className={`${td} min-w-[150px]`}>
                        {clock ? (
                          <>
                            <span className={`block font-semibold ${j.phase === "Open" && d?.is_due ? "text-amber" : "text-ink"}`}>{clock.short}</span>
                            {j.phase === "Exclusive" && (
                              <span className="mt-1.5 block h-1 w-full max-w-[150px] overflow-hidden rounded-full bg-surface-3">
                                <span
                                  className="block h-full rounded-full bg-linear-to-r from-accent to-amber"
                                  style={{ width: `${Math.round((1 - clock.progress) * 100)}%` }}
                                />
                              </span>
                            )}
                            <span className="mt-1 block text-xs text-ink-3">{clock.hint}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${td} font-mono text-[13px] whitespace-nowrap text-ink-2`}>
                        {j.winner ? `${initials(j.winner)}${d?.round.winner ? ` · ${formatNear(d.round.winner.bid)}` : ""}` : "—"}
                      </td>
                      <td className={td}>{j.last_outcome ? <Outcome outcome={j.last_outcome} /> : <span className="text-ink-3">No runs yet</span>}</td>
                      <td className={`${td} pr-5 text-right`}>
                        <ChevronRight aria-hidden="true" className="ml-auto size-4 text-ink-3" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>

          {/* Phones: one card per job, the whole card is the link. */}
          <ul className="mx-4 mb-4 divide-y divide-line overflow-hidden rounded-2xl border border-line md:hidden">
            {shown.map((j) => {
              const d = details.get(j.id);
              const clock = d && phaseClock(d, config);
              return (
                <li key={j.id}>
                  <Link href={jobHref(j.id)} className="grid gap-2 px-4 py-4 active:bg-surface-2">
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="font-display text-base">#{j.id}</span>
                        <span className="truncate font-mono text-[15px] font-medium">{j.method}</span>
                      </span>
                      <PhasePill phase={j.phase} />
                    </span>
                    <span className="flex items-center justify-between gap-3 text-[13px]">
                      <span className={`truncate ${j.phase === "Open" && d?.is_due ? "text-amber" : "text-ink-2"}`}>
                        {j.winner
                          ? `${initials(j.winner)} · ${clock?.short ?? ""} ${clock?.hint ?? ""}`
                          : clock
                            ? `${clock.short} · ${clock.hint}`
                            : scheduleLabel(j.schedule)}
                      </span>
                      {j.last_outcome && <Outcome outcome={j.last_outcome} />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
