"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheck, X } from "lucide-react";

import { getConfig, getHistory, getJob, getStats, listJobs } from "@/lib/contract";
import { formatInt, formatNear } from "@/lib/format";
import { heat } from "@/lib/phase";
import type { JobView } from "@/lib/types";
import { usePoll } from "@/hooks/use-poll";
import { FeaturedRound } from "@/components/app/featured-round";
import { LiveJobs } from "@/components/app/live-jobs";
import { foldFailovers, RecentExecutions, type JobExecution } from "@/components/app/recent-executions";
import { EmptyState, ErrorBanner, PageHeader, Panel, Skeleton, StatStrip } from "@/components/app/ui";

// Detail reads per poll are capped: one get_job + get_history per job.
const DETAIL_LIMIT = 12;

async function load() {
  const [stats, config, jobs] = await Promise.all([getStats(), getConfig(), listJobs()]);
  const ids = jobs.slice(0, DETAIL_LIMIT).map((j) => j.id);
  const [views, histories] = await Promise.all([Promise.all(ids.map(getJob)), Promise.all(ids.map(getHistory))]);
  const details = new Map(views.filter((v): v is JobView => !!v).map((v) => [v.id, v]));
  const recent = histories
    .flatMap((h, i) => foldFailovers(h.map((r): JobExecution => ({ ...r, job_id: ids[i] }))))
    .sort((a, b) => b.exec_block - a.exec_block)
    .slice(0, 6);
  // The hottest active round leads the page.
  const featured = [...details.values()]
    .filter((d) => d.status === "Active")
    .sort((a, b) => heat(b.phase) - heat(a.phase) || b.round.commits.length - a.round.commits.length || a.id - b.id)[0];
  return { stats, config, jobs, details, recent, featured };
}

export function LiveView() {
  const { data, error, loading, refresh } = usePoll(load);
  const closed = useSearchParams().get("closed");
  const [showClosed, setShowClosed] = useState(true);
  const s = data?.stats;

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        title="Live arena"
        lede={
          <>
            <span className="hidden md:inline">
              AI keepers bid in sealed rounds to run scheduled NEAR calls. Lowest bid wins the job; miss the window and
              the stake burns.
            </span>
            <span className="md:hidden">
              {s
                ? `Epoch ${formatInt(s.current_epoch)} · ${s.jobs} jobs · ${s.keepers} keepers · ${formatNear(s.total_stake, 2)} NEAR staked`
                : "Loading the arena…"}
            </span>
          </>
        }
        aside={
          <StatStrip
            items={[
              { label: "Epoch", value: s ? formatInt(s.current_epoch) : "—" },
              { label: "Jobs", value: s ? s.jobs : "—" },
              { label: "Keepers", value: s ? s.keepers : "—" },
              { label: "Staked", value: s ? `${formatNear(s.total_stake, 2)} NEAR` : "—" },
              { label: "Protocol fee", value: data ? `${data.config.protocol_fee_bps / 100}%` : "—" },
            ]}
          />
        }
      />

      {closed && /^\d+$/.test(closed) && showClosed && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-ok/30 bg-ok-bg px-4 py-3 text-sm text-ok">
          <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
          <span className="flex-1">
            Job #{closed} is closed. Its balance and storage deposit went back to your account.
          </span>
          <Link href="/live" replace onClick={() => setShowClosed(false)} aria-label="Dismiss" className="grid size-7 place-items-center rounded-full hover:bg-ok/10">
            <X aria-hidden="true" className="size-4" />
          </Link>
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={refresh} />}

      {loading && !data ? (
        <>
          <Skeleton className="h-[460px]" />
          <Skeleton className="h-[320px]" />
        </>
      ) : data && data.jobs.length === 0 ? (
        <Panel>
          <EmptyState title="The pit is empty">Post the first scheduled call and keepers will start bidding on it.</EmptyState>
        </Panel>
      ) : data ? (
        <>
          {data.featured && <FeaturedRound job={data.featured} config={data.config} />}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <LiveJobs jobs={data.jobs} details={data.details} config={data.config} />
            <RecentExecutions events={data.recent} />
          </div>
        </>
      ) : null}
    </div>
  );
}
