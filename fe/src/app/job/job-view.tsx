"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getConfig, getHistory, getJob } from "@/lib/contract";
import { formatInt, formatNear, prettyArgs, scheduleLabel } from "@/lib/format";
import { accountUrl } from "@/lib/near";
import { routes } from "@/lib/routes";
import { usePoll } from "@/hooks/use-poll";
import { GasMeter } from "@/components/app/gas-meter";
import { HistoryTable } from "@/components/app/history-table";
import { JobActions } from "@/components/app/job-actions";
import { RoundPanel } from "@/components/app/round-panel";
import { AccountLink, BackLink, EmptyState, ErrorBanner, Panel, Skeleton, StatusPill } from "@/components/app/ui";

export function JobView() {
  const raw = useSearchParams().get("id");
  const id = raw != null && /^\d+$/.test(raw) ? Number(raw) : null;

  const { data, error, loading, refresh } = usePoll(async () => {
    if (id == null) return null;
    const [job, history, config] = await Promise.all([getJob(id), getHistory(id), getConfig()]);
    return job ? { job, history, config } : null;
  }, [id]);

  const crumb = <BackLink href={routes.live} label="Live arena" current={id != null ? `Job #${id}` : undefined} />;

  if (id == null || (!loading && data === null && !error)) {
    return (
      <div className="grid gap-6">
        <div className="hidden md:block">{crumb}</div>
        <Panel>
          <EmptyState title="Job not found">
            {id == null
              ? "This link has no job id."
              : `There is no job #${id} on the contract. Closing a job removes it, so it may have been closed.`}
          </EmptyState>
        </Panel>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-6">
        {error && <ErrorBanner message={error} onRetry={refresh} />}
        <Skeleton className="h-40" />
        <Skeleton className="h-[480px]" />
      </div>
    );
  }

  const { job, history, config } = data;
  const runs = BigInt(job.max_reward) > BigInt(0) ? (BigInt(job.balance) / BigInt(job.max_reward)).toString() : "—";
  const fee = config.protocol_fee_bps / 100;
  const facts: { label: string; value: ReactNode; sub: string; tone?: string }[] = [
    { label: "Balance", value: `${formatNear(job.balance, 2)} NEAR`, sub: `≈ ${runs} runs at max reward`, tone: "text-glow text-[26px] sm:text-[28px]" },
    { label: "Max reward", value: `${formatNear(job.max_reward)} NEAR`, sub: `per execution, fee ${fee}%` },
    {
      label: "Schedule",
      value: scheduleLabel(job.schedule),
      sub: job.schedule === "EveryEpoch" ? "paid at most once per epoch" : `≈ every ${Math.round(job.schedule.EveryBlocks.interval * 0.58 / 60)} min`,
    },
    {
      label: "Pays when",
      value: job.success_rule === "Any" ? "Call succeeds" : "Returns true",
      sub: job.success_rule === "Any" ? "callback sees success" : "and the value is true",
    },
    { label: "Owner", value: <AccountLink id={job.owner} className="font-sans font-bold text-ink" />, sub: `created at #${formatInt(job.created_at)}` },
  ];

  return (
    <div className="grid gap-6 md:gap-7">
      <div className="hidden md:block">{crumb}</div>
      {error && <ErrorBanner message={error} onRetry={refresh} />}

      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <h1 className="text-[clamp(1.875rem,5vw,3.25rem)] leading-[1.05] break-words">{job.method}</h1>
          <p className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <a
              href={accountUrl(job.target)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-sm text-ink-2 hover:text-ink"
            >
              {job.target} <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
            {job.status !== "Active" && <StatusPill status={job.status} />}
          </p>
        </div>
        <JobActions job={job} onDone={refresh} layout="header" />
      </header>

      {/* gap-px over the line colour draws 1px dividers at every breakpoint. */}
      <Panel>
        <dl className="grid grid-cols-2 gap-px bg-line md:grid-cols-3 lg:grid-cols-5">
          {facts.map((f, i) => (
            <div key={f.label} className={`bg-surface px-4 py-4 sm:px-6 sm:py-5 ${i === 4 ? "col-span-2 lg:col-span-1" : ""}`}>
              <dt className="text-xs text-ink-3">{f.label}</dt>
              <dd className={`mt-1.5 font-bold ${f.tone ?? "text-base sm:text-lg"}`}>{f.value}</dd>
              <dd className="mt-1 hidden text-xs text-ink-3 sm:block">{f.sub}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel className="px-6 py-5">
          <h2 className="font-sans text-[13px] font-normal tracking-normal text-ink-3">Arguments (JSON)</h2>
          <pre className="mt-3 overflow-x-auto font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-amber sm:text-sm">
            {prettyArgs(job.args)}
          </pre>
        </Panel>
        <Panel className="px-6 py-5">
          <GasMeter gas={job.gas_tgas} config={config} />
        </Panel>
      </div>

      <RoundPanel job={job} config={config} />
      <HistoryTable history={history} kept={config.max_history} feeBps={config.protocol_fee_bps} />

      <JobActions job={job} onDone={refresh} layout="bar" />
    </div>
  );
}
