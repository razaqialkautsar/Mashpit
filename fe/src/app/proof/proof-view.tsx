"use client";

import Link from "next/link";
import { ExternalLink, Terminal } from "lucide-react";
import { getConfig, getHistory, getStats, listJobs, listKeepers } from "@/lib/contract";
import { formatInt, formatNear } from "@/lib/format";
import { accountUrl, near } from "@/lib/near";
import { jobHref } from "@/lib/routes";
import type { JobSummary, Outcome } from "@/lib/types";
import { usePoll } from "@/hooks/use-poll";
import { ErrorBanner, Note, PageHeader, Panel, PanelHead, Skeleton, TableScroll, td, th, thead } from "@/components/app/ui";

// The only hand-picked content on this page: transactions worth opening. Everything else is
// read from the contract on every poll.
const RECEIPTS = [
  {
    hash: "GcdTUemupyBHbLDKqPrLBbEoArjCQwqnyPbkzSjpmE95",
    title: "LiNEAR epoch_stake: 284.94 NEAR of user deposits staked",
    text: "The job's rule is Returns true. LiNEAR returned true after staking with everstake, so the keeper was paid 0.02 NEAR. Look for epoch_stake_success, then Mashpit's job_executed.",
  },
  {
    hash: "9mMPce4GY4emazGNETzLfFJCdWyakkajqYWUgDyu3ays",
    title: "LiNEAR epoch_update_rewards: 15.47 NEAR of rewards recorded",
    text: "The first run through Mashpit: LiNEAR's epoch_update_rewards event for aurora.pool.f863973.m0, then job_executed with Paid.",
  },
];

const OUTCOMES: Outcome[] = ["Paid", "Failed", "ReturnedFalse", "Slashed"];

type JobRow = { job: JobSummary; counts: Record<Outcome, number>; paidOnMisses: bigint; records: number };

async function load() {
  const [stats, config, jobs, keepers] = await Promise.all([getStats(), getConfig(), listJobs(), listKeepers()]);
  const histories = await Promise.all(jobs.map((j) => getHistory(j.id)));
  const rows: JobRow[] = jobs.map((job, i) => {
    const counts: Record<Outcome, number> = { Paid: 0, Failed: 0, ReturnedFalse: 0, Slashed: 0 };
    let paidOnMisses = BigInt(0);
    for (const r of histories[i]) {
      counts[r.outcome] += 1;
      if (r.outcome !== "Paid") paidOnMisses += BigInt(r.paid);
    }
    return { job, counts, paidOnMisses, records: histories[i].length };
  });
  return { stats, config, keepers, rows };
}

/** Targets outside the Mashpit accounts: contracts other teams run. */
const isThirdParty = (target: string) => target !== "mashpit.testnet" && !target.endsWith(".mashpit.testnet");

export function ProofView() {
  const { data, error, loading, refresh } = usePoll(load);

  const keepers = data?.keepers.map(([, k]) => k) ?? [];
  const paidRuns = keepers.reduce((a, k) => a + k.executed, 0);
  const slashes = keepers.reduce((a, k) => a + k.slashed, 0);
  const sum = (o: Outcome) => data?.rows.reduce((a, r) => a + r.counts[o], 0) ?? 0;
  const misses = sum("Failed") + sum("ReturnedFalse");
  const paidOnMisses = data?.rows.reduce((a, r) => a + r.paidOnMisses, BigInt(0)) ?? BigInt(0);
  const feeBps = data?.config.protocol_fee_bps ?? 0;
  const fees = data ? BigInt(data.stats.fees_accrued) : BigInt(0);
  // Fees are feeBps of every paid amount, so gross paid = fees × 10,000 / feeBps.
  const gross = feeBps > 0 ? (fees * BigInt(10_000)) / BigInt(feeBps) : BigInt(0);

  const targets = new Map<string, { methods: Set<string>; jobs: number[] }>();
  for (const { job } of data?.rows ?? []) {
    if (!isThirdParty(job.target)) continue;
    const t = targets.get(job.target) ?? { methods: new Set<string>(), jobs: [] };
    t.methods.add(job.method);
    t.jobs.push(job.id);
    targets.set(job.target, t);
  }

  const facts = [
    {
      label: "Runs paid",
      value: formatInt(paidRuns),
      sub: "Executions whose result passed the job's rule, from every keeper's record.",
    },
    {
      label: "Recent runs that failed or returned false",
      value: formatInt(misses),
      sub: `Among the last ${data?.config.max_history ?? "—"} runs each job keeps on chain.`,
    },
    {
      label: "Paid for those runs",
      value: `${formatNear(paidOnMisses)} NEAR`,
      sub: "The callback pays only a result that passes the rule, so this stays at zero.",
      tone: "text-ok",
    },
    {
      label: "Paid to keepers",
      value: `${formatNear(gross - fees, 3)} NEAR`,
      sub: `Derived from ${formatNear(fees, 4)} NEAR of protocol fees at ${feeBps / 100}%.`,
    },
    {
      label: "Slashes",
      value: formatInt(slashes),
      sub: "Winners that missed their window. Each penalty went to the job's balance.",
    },
    {
      label: "Third-party contracts served",
      value: formatInt(targets.size),
      sub: "Targets outside the Mashpit accounts, listed below.",
    },
  ];

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        title="Proof"
        lede="Every number on this page is read from the Mashpit contract right now. Only the transaction links were picked by us, so you can check those too."
      />
      {error && <ErrorBanner message={error} onRetry={refresh} />}

      {loading && !data ? (
        <Skeleton className="h-[420px]" />
      ) : data ? (
        <>
          <Panel glow>
            <PanelHead title="Paid for outcomes, not attempts" right={`contract ${near.contractId}`} />
            <dl className="grid gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {facts.map((f) => (
                <div key={f.label} className="bg-surface px-6 py-5">
                  <dt className="text-[13px] text-ink-3">{f.label}</dt>
                  <dd className={`mt-1.5 font-display text-[28px] leading-none tabular-nums ${f.tone ?? "text-ink"}`}>{f.value}</dd>
                  <dd className="mt-2 text-[13px] text-ink-3">{f.sub}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHead title="Real protocols, not demo contracts" />
              <ul className="divide-y divide-line border-t border-line">
                {[...targets.entries()].map(([target, t]) => (
                  <li key={target} className="px-6 py-4">
                    <a href={accountUrl(target)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-ink hover:underline">
                      {target} <ExternalLink aria-hidden="true" className="size-3.5 text-ink-3" />
                    </a>
                    <p className="mt-1 text-[13px] text-ink-3">
                      {[...t.methods].join(", ")} · jobs{" "}
                      {t.jobs.map((id, i) => (
                        <span key={id}>
                          {i > 0 && ", "}
                          <Link href={jobHref(id)} className="text-ink-2 underline-offset-2 hover:underline">#{id}</Link>
                        </span>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel>
              <PanelHead title="Transactions worth opening" />
              <ul className="divide-y divide-line border-t border-line">
                {RECEIPTS.map((r) => (
                  <li key={r.hash} className="px-6 py-4">
                    <a href={`${near.explorerUrl}/txns/${r.hash}`} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1.5 text-sm font-semibold text-ink hover:underline">
                      {r.title} <ExternalLink aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                    </a>
                    <p className="mt-1 text-[13px] text-ink-3">{r.text}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel>
            <PanelHead title="Outcomes per job" right="recent history kept on chain" />
            <TableScroll>
              <table className="w-full min-w-[720px]">
                <thead className={thead}>
                  <tr>
                    <th className={th}>Job</th>
                    {OUTCOMES.map((o) => (
                      <th key={o} className={th}>{o === "ReturnedFalse" ? "Returned false" : o}</th>
                    ))}
                    <th className={th}>Paid on misses</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.job.id} className="border-t border-line first:border-t-0">
                      <td className={td}>
                        <Link href={jobHref(r.job.id)} className="font-semibold text-ink hover:underline">
                          #{r.job.id} <span className="font-mono font-medium">{r.job.method}</span>
                        </Link>
                        <span className="mt-0.5 block font-mono text-xs text-ink-3">{r.job.target}</span>
                      </td>
                      {OUTCOMES.map((o) => (
                        <td key={o} className={`${td} tabular-nums ${r.counts[o] ? "font-bold text-ink" : "text-ink-3"}`}>{r.counts[o]}</td>
                      ))}
                      <td className={`${td} tabular-nums text-ok`}>{formatNear(r.paidOnMisses)} NEAR</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </Panel>

          <Panel>
            <PanelHead title="Check it yourself" right="near-cli-rs, no keys needed" />
            <div className="grid gap-3 border-t border-line px-6 py-5">
              {[
                ["Every keeper's executions and slashes", "list_keepers", "{}"],
                ["A job's recent outcomes and what each paid", "get_history", '{"job_id":5}'],
                ["Fees collected, jobs and keepers", "get_stats", "{}"],
              ].map(([label, method, args]) => (
                <div key={method}>
                  <p className="flex items-center gap-2 text-[13px] text-ink-2">
                    <Terminal aria-hidden="true" className="size-3.5 text-ink-3" /> {label}
                  </p>
                  <pre className="mt-1.5 overflow-x-auto rounded-xl bg-bg px-4 py-3 font-mono text-xs text-ink">
                    {`near contract call-function as-read-only ${near.contractId} ${method} json-args '${args}' network-config ${near.network} now`}
                  </pre>
                </div>
              ))}
              <Note>
                Each job keeps its last {data.config.max_history} runs on chain, so the per-job counts cover recent runs. The
                runs paid and the slashes above come from the keepers&rsquo; all-time records.
              </Note>
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
