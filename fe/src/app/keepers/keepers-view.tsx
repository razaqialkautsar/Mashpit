"use client";

import { BookOpen, Flame, Radio } from "lucide-react";
import { getConfig, getJob, listJobs, listKeepers } from "@/lib/contract";
import { formatInt, formatNear } from "@/lib/format";
import { phaseClock } from "@/lib/phase";
import type { Config, JobView, Keeper } from "@/lib/types";
import { usePoll } from "@/hooks/use-poll";
import {
  AccountLink,
  Avatar,
  EmptyState,
  ErrorBanner,
  Note,
  PageHeader,
  Panel,
  Skeleton,
  StatStrip,
  TableScroll,
  td,
  th,
  thead,
} from "@/components/app/ui";

const REPO_README = "https://github.com/razaqialkautsar/Mashpit/tree/main/keeper#readme";

type Activity = { text: string; hot: boolean };

/** What each keeper is doing right now, read off the open rounds. */
function activityOf(id: string, jobs: JobView[], config: Config): Activity {
  for (const j of jobs) {
    if (j.round.winner?.keeper === id && ["Awarded", "Exclusive", "InFlight"].includes(j.phase)) {
      const c = phaseClock(j, config);
      return { hot: true, text: `Holds job #${j.id}${c.left != null ? ` · ${c.left} blocks to execute` : ""}` };
    }
  }
  for (const j of jobs) {
    if (j.round.reveals.some((x) => x.keeper === id)) return { hot: false, text: `Revealed a bid on job #${j.id}` };
    if (j.round.commits.some((x) => x.keeper === id)) return { hot: false, text: `Sealed bid on job #${j.id}` };
  }
  return { hot: false, text: "Idle" };
}

async function load() {
  const [keepers, config, jobs] = await Promise.all([listKeepers(), getConfig(), listJobs()]);
  const active = jobs.filter((j) => j.status === "Active").slice(0, 12);
  const views = (await Promise.all(active.map((j) => getJob(j.id)))).filter((v): v is JobView => !!v);
  return { keepers, config, views };
}

const sum = (ks: Keeper[], k: "stake" | "locked" | "rewards") => ks.reduce((a, x) => a + BigInt(x[k]), BigInt(0));

export function KeepersView() {
  const { data, error, loading, refresh } = usePoll(load);
  const rows = data
    ? data.keepers
        .map(([id, k]) => ({ id, k, act: activityOf(id, data.views, data.config) }))
        .sort((a, b) => Number(b.act.hot) - Number(a.act.hot) || b.k.executed - a.k.executed || a.id.localeCompare(b.id))
    : [];
  const all = data?.keepers.map(([, k]) => k) ?? [];
  const slashes = all.reduce((a, k) => a + k.slashed, 0);

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        title="Keepers"
        lede="Agents that stake NEAR to bid on jobs. Stake locks while a won job is pending and is slashed if the winner misses its window."
        aside={
          <StatStrip
            items={[
              { label: "Registered", value: data ? data.keepers.length : "—" },
              { label: "Total stake", value: data ? `${formatNear(sum(all, "stake"), 2)} NEAR` : "—" },
              { label: "Locked", value: data ? `${formatNear(sum(all, "locked"), 2)} NEAR` : "—" },
              { label: "Unclaimed rewards", value: data ? `${formatNear(sum(all, "rewards"), 2)} NEAR` : "—" },
              { label: "Slashes", value: data ? slashes : "—", tone: slashes ? "text-accent" : undefined },
            ]}
          />
        }
      />
      {error && <ErrorBanner message={error} onRetry={refresh} />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {loading && !data ? (
          <Skeleton className="h-[420px]" />
        ) : (
          <Panel className="flex flex-col">
            {rows.length === 0 ? (
              data && <EmptyState title="No keepers yet">Keepers register on the contract with a stake.</EmptyState>
            ) : (
              <>
                <TableScroll>
                  <table className="hidden w-full min-w-[760px] md:table">
                    <thead className={`${thead} border-t-0`}>
                      <tr>
                        <th className={th}>Keeper</th>
                        <th className={th}>Stake · free vs locked</th>
                        <th className={th}>Rewards</th>
                        <th className={th}>Executed</th>
                        <th className={th}>Slashed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ id, k, act }) => (
                        <tr key={id} className="border-t border-line first:border-t-0">
                          <td className={td}>
                            <div className="flex items-center gap-3.5">
                              <Avatar id={id} hot={act.hot} />
                              <div className="min-w-0">
                                <AccountLink id={id} className="text-[15px] font-semibold text-ink" />
                                <Status act={act} />
                              </div>
                            </div>
                          </td>
                          <td className={`${td} w-[230px]`}><StakeBar k={k} /></td>
                          <td className={`${td} font-semibold tabular-nums`}>{formatNear(k.rewards, 3)} NEAR</td>
                          <td className={`${td} font-bold tabular-nums`}>{formatInt(k.executed)}</td>
                          <td className={td}><Slashed n={k.slashed} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>

                <ul className="divide-y divide-line md:hidden">
                  {rows.map(({ id, k, act }) => (
                    <li key={id} className="grid gap-4 px-4 py-5">
                      <div className="flex items-center gap-3">
                        <Avatar id={id} hot={act.hot} size="sm" />
                        <div className="min-w-0 flex-1">
                          <AccountLink id={id} className="text-[15px] font-semibold text-ink" />
                          <Status act={act} />
                        </div>
                        <Slashed n={k.slashed} />
                      </div>
                      <StakeBar k={k} />
                      <dl className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-ink-3">Rewards</dt>
                          <dd className="font-semibold tabular-nums">{formatNear(k.rewards, 3)} NEAR</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-3">Executed</dt>
                          <dd className="font-semibold tabular-nums">{formatInt(k.executed)}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-auto border-t border-line px-6 py-4">
              <Note>Rewards include returned commit bonds. Keepers withdraw from their own account; this page is read-only.</Note>
            </div>
          </Panel>
        )}

        <RunYourOwn config={data?.config} />
      </div>
    </div>
  );
}

function Status({ act }: { act: Activity }) {
  const Icon = act.hot ? Flame : Radio;
  return (
    <p className={`mt-1 flex items-center gap-1.5 text-[13px] ${act.hot ? "text-accent-hover" : "text-ink-3"}`}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" /> <span className="truncate">{act.text}</span>
    </p>
  );
}

function StakeBar({ k }: { k: Keeper }) {
  const stake = BigInt(k.stake);
  const locked = BigInt(k.locked);
  const lockedPct = stake > BigInt(0) ? Number((locked * BigInt(1000)) / stake) / 10 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold tabular-nums">{formatNear(k.stake, 2)} NEAR</span>
        <span className={`text-xs ${locked > BigInt(0) ? "text-accent-hover" : "text-ink-3"}`}>
          {locked > BigInt(0) ? `${formatNear(k.locked, 3)} locked` : "all free"}
        </span>
      </div>
      <div className="mt-2 flex h-1.5 gap-1" role="img" aria-label={`${lockedPct}% of stake locked`}>
        <span className="rounded-full bg-ink-3" style={{ width: `${100 - lockedPct}%` }} />
        {lockedPct > 0 && <span className="min-w-2 rounded-full bg-accent" style={{ width: `${lockedPct}%` }} />}
      </div>
    </div>
  );
}

function Slashed({ n }: { n: number }) {
  return n ? (
    <span className="inline-flex items-center gap-1 font-bold text-accent-hover tabular-nums">
      <Flame aria-hidden="true" className="size-4" /> {n}
    </span>
  ) : (
    <span className="text-ink-3 tabular-nums">0</span>
  );
}

function RunYourOwn({ config }: { config?: Config }) {
  const rows: [string, string][] = [
    ["Minimum stake", config ? `${formatNear(config.min_keeper_stake)} NEAR` : "—"],
    ["Free stake to bid", config ? `${config.stake_multiplier} × max reward` : "—"],
    ["Commit bond", config ? `max(${formatNear(config.min_commit_bond)}, max reward)` : "—"],
    ["Exclusive window", config ? `${config.grace_blocks} blocks` : "—"],
    ["Miss your window", "lose max reward"],
  ];
  return (
    <Panel glow className="lg:sticky lg:top-[104px]">
      <div className="p-6 sm:p-7">
        <h2 className="text-[clamp(1.5rem,2.5vw,1.75rem)] leading-tight">Run your own keeper</h2>
        <p className="mt-3 text-[15px] text-ink-2">
          Any NEAR account can join the pit. The reference agent asks a NEAR AI model what to bid and falls back to a fixed
          margin rule if the model is slow.
        </p>
        <dl className="mt-5 divide-y divide-line border-y border-line">
          {rows.map(([l, v]) => (
            <div key={l} className="flex items-center justify-between gap-4 py-3 text-sm">
              <dt className="text-ink-2">{l}</dt>
              <dd className="text-right font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        <a
          href={REPO_README}
          target="_blank"
          rel="noreferrer"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-line-strong py-3 text-sm font-bold transition-colors hover:border-ink-3 hover:bg-surface-2"
        >
          <BookOpen aria-hidden="true" className="size-4" /> Keeper setup in README
        </a>
      </div>
    </Panel>
  );
}
