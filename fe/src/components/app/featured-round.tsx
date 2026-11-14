import Link from "next/link";
import { ArrowRight, Repeat } from "lucide-react";
import { argEntries, formatInt, formatNear, scheduleLabel } from "@/lib/format";
import { phaseClock } from "@/lib/phase";
import { jobHref } from "@/lib/routes";
import type { Config, JobView } from "@/lib/types";
import { BidList, bidsOf } from "./bid-list";
import { HeatTrack } from "./heat-track";
import { Chip, Note, Panel } from "./ui";

/** The one live round worth watching right now, with its bids beside it. */
export function FeaturedRound({ job, config }: { job: JobView; config?: Config }) {
  const clock = phaseClock(job, config);
  const bids = bidsOf(job.round);
  const revealed = bids.filter((b) => b.bid).length;
  const args = argEntries(job.args);

  return (
    <Panel className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {/* Left: the job and where its round stands. */}
      <div className="relative flex flex-col border-line p-5 sm:p-9 lg:border-r">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-radial-[ellipse_75%_65%_at_0%_0%] from-accent/30 to-transparent"
        />
        <div className="relative flex flex-wrap items-center gap-2">
          <Chip>Job #{job.id}</Chip>
          <Chip>Round #{job.round.round_id}</Chip>
          <span className="hidden items-center gap-1.5 px-2 text-[13px] font-semibold text-ink-2 sm:inline-flex">
            <Repeat aria-hidden="true" className="size-3.5" /> {scheduleLabel(job.schedule)}
          </span>
        </div>

        <h2 className="relative mt-6 font-display text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight break-words">
          <Link href={jobHref(job.id)} className="hover:text-amber">
            {job.method}
          </Link>
        </h2>
        <p className="relative mt-2 flex flex-wrap gap-x-3 font-mono text-[13px] text-ink-2">
          <span className="break-all">{job.target}</span>
          {args?.slice(0, 1).map(([k, v]) => (
            <span key={k} className="hidden truncate sm:inline">
              · {k.replace(/_id$/, "")} {v}
            </span>
          ))}
        </p>

        <div className="relative mt-7">
          <HeatTrack phase={job.phase} progress={clock.progress} />
        </div>

        <div className="relative mt-7 flex items-center gap-4 sm:gap-5">
          {clock.left != null ? (
            <>
              <span className="font-display text-[clamp(4rem,8vw,5.5rem)] leading-[0.85] text-glow tabular-nums">
                {clock.left}
              </span>
              <span>
                <span className="block text-base font-semibold sm:text-lg">{clock.label}</span>
                <span className="mt-0.5 block text-[13px] text-ink-2">
                  ≈ {Math.round(clock.left * 0.58)} s at 0.58 s/block
                  {clock.endBlock != null && <span className="hidden sm:inline"> · ends #{formatInt(clock.endBlock)}</span>}
                </span>
              </span>
            </>
          ) : (
            <p className="text-base text-ink-2">{clock.label}</p>
          )}
        </div>

        <dl className="relative mt-auto grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          {[
            ["Max reward", `${formatNear(job.max_reward)} NEAR`],
            ["Gas", `${job.gas_tgas} Tgas`],
            ["Success rule", job.success_rule === "Any" ? "Any" : "Returns true"],
            ["Job balance", `${formatNear(job.balance, 2)} NEAR`],
          ].map(([l, v]) => (
            <div key={l}>
              <dt className="text-xs text-ink-3">{l}</dt>
              <dd className="mt-1 font-bold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Right: this round's sealed and revealed bids. */}
      <div className="flex flex-col border-t border-line p-5 sm:p-9 lg:border-t-0">
        <h3 className="text-[22px] leading-none">Bids this round</h3>
        <p className="mt-2 text-[13px] text-ink-2">
          {bids.length} sealed commit{bids.length === 1 ? "" : "s"} · {revealed} revealed · lowest bid wins, ties go to the
          earlier commit
        </p>
        <div className="mt-5 flex-1">
          {bids.length ? (
            <BidList bids={bids} winner={!!job.round.winner} />
          ) : (
            <p className="border-y border-line py-10 text-center text-base text-ink-3">No bids this round yet.</p>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <Note>
            Memos are written by each keeper’s AI model and shown as plain text. The winner gets{" "}
            {config?.grace_blocks ?? "—"} blocks of exclusive time once the job is due.
          </Note>
          <Link href={jobHref(job.id)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
            Open job <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </Panel>
  );
}
