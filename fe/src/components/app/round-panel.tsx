import { ArrowDown, Check, Circle, Eye, Flame, Lock, Trophy, CircleCheck, type LucideIcon } from "lucide-react";
import { formatInt, formatNear, initials, shortHash } from "@/lib/format";
import { phaseClock, STEP, type TrackStep } from "@/lib/phase";
import type { Config, JobView } from "@/lib/types";
import { BidList, bidsOf } from "./bid-list";
import { HeatTrack } from "./heat-track";
import { AccountLink, PhasePill, TableScroll, td, th, thead } from "./ui";

const ICON: Record<TrackStep, LucideIcon> = { Commit: Lock, Reveal: Eye, Awarded: Trophy, Exclusive: Flame, Settled: CircleCheck };
const tail = (b: number) => `#…${String(b).slice(-3)}`;

/** Round #n: vertical phase timeline on the left, commits and reveals on the right. */
export function RoundPanel({ job, config }: { job: JobView; config?: Config }) {
  const r = job.round;
  const clock = phaseClock(job, config);
  const step = STEP[job.phase] ?? 0;
  const bids = bidsOf(r);
  const perPhase = config ? config.commit_blocks : r.commit_end - r.opened_at;

  const steps: { name: TrackStep; text: string; meta?: string }[] = [
    {
      name: "Commit",
      text: r.commits.length ? `${r.commits.length} keeper${r.commits.length === 1 ? "" : "s"} sealed a bid` : "Keepers seal a hashed bid",
      meta: `${tail(r.opened_at)} → ${tail(r.commit_end)}`,
    },
    {
      name: "Reveal",
      text:
        job.phase === "Reveal" && clock.left != null
          ? `${clock.left} blocks left · ≈ ${Math.round(clock.left * 0.58)} s`
          : `${r.reveals.length} revealed`,
      meta: `ends ${tail(r.reveal_end)}`,
    },
    {
      name: "Awarded",
      text: r.winner
        ? `${initials(r.winner.keeper)} won at ${formatNear(r.winner.bid)} NEAR`
        : r.finalized && r.open_mode
          ? "No valid bid. The round went open"
          : "Lowest revealed bid takes the job",
    },
    {
      name: "Exclusive",
      text:
        job.phase === "Exclusive" && clock.left != null
          ? `${clock.left} blocks left for the winner`
          : `Winner has ${config?.grace_blocks ?? "—"} blocks once due`,
      meta: "miss it → slashed",
    },
    {
      name: "Settled",
      text: `Pay bid − ${config ? config.protocol_fee_bps / 100 : "—"}% fee, open round #${r.round_id + 1}`,
    },
  ];

  return (
    <section className="overflow-hidden rounded-[24px] border border-line bg-surface lg:grid lg:grid-cols-[380px_minmax(0,1fr)]">
      {/* Timeline */}
      <div className="relative border-line p-5 sm:p-8 lg:border-r">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-radial-[ellipse_90%_60%_at_0%_0%] from-accent/30 to-transparent" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[clamp(1.5rem,3vw,2rem)] leading-none">Round #{r.round_id}</h2>
          <span className="lg:hidden">
            <PhasePill phase={job.phase} suffix={clock.left != null ? `${clock.left} blocks` : undefined} />
          </span>
        </div>
        <p className="relative mt-2 text-[13px] text-ink-2">
          Opened at #{formatInt(r.opened_at)} · {perPhase} blocks per phase
        </p>

        {/* Phones: the compact horizontal track. */}
        <div className="relative mt-5 lg:hidden">
          <HeatTrack phase={job.phase} progress={clock.progress} labels="short" />
          {clock.left == null && <p className="mt-4 text-sm text-ink-2">{clock.label}</p>}
        </div>

        {/* Desktop: the vertical timeline. */}
        <ol className="relative mt-7 hidden lg:block">
          {steps.map((s, i) => {
            const done = i < step;
            const now = i === step;
            const Icon = done ? Check : now ? ICON[s.name] : Circle;
            return (
              <li key={s.name} aria-current={now ? "step" : undefined} className="relative flex gap-4 pb-7 last:pb-0">
                {i < steps.length - 1 && (
                  <span aria-hidden="true" className={`absolute top-8 left-[13px] h-[calc(100%-28px)] w-0.5 ${done ? "bg-accent-deep" : "bg-line-strong"}`} />
                )}
                <span
                  className={`relative grid size-7 shrink-0 place-items-center rounded-full ${
                    done
                      ? "bg-accent-deep text-ink"
                      : now
                        ? "bg-amber text-accent-ink shadow-[0_0_0_4px] shadow-amber/20"
                        : "border border-dashed border-line-strong text-ink-3"
                  }`}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={`font-bold ${now ? "text-amber" : done ? "text-ink" : "text-ink-2"}`}>{s.name}</span>
                    {s.meta && <span className={`font-mono text-[11px] ${now ? "text-amber" : "text-ink-3"}`}>{s.meta}</span>}
                  </span>
                  <span className={`mt-0.5 block text-[13px] ${now ? "text-amber/90" : "text-ink-3"}`}>{s.text}</span>
                </span>
              </li>
            );
          })}
        </ol>
        {["AwaitingFinalize", "Open", "InFlight", "Paused"].includes(job.phase) && (
          <p className="relative mt-6 hidden rounded-xl bg-bg/60 px-4 py-3 text-[13px] text-ink-2 lg:block">{clock.label}</p>
        )}
      </div>

      {/* Commits and reveals */}
      <div className="border-t border-line lg:border-t-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-6 pb-4 sm:px-6">
          <h3 className="text-[22px] leading-none">Commits and reveals</h3>
          <span className="text-[13px] text-ink-3">
            Bond ≥ max({config ? formatNear(config.min_commit_bond) : "0.1"}, max reward) per commit
          </span>
        </div>
        {bids.length === 0 ? (
          <p className="border-t border-line px-6 py-12 text-center text-base text-ink-3">No bids this round yet.</p>
        ) : (
          <>
            <TableScroll>
              <table className="hidden w-full min-w-[640px] md:table">
                <thead className={thead}>
                  <tr>
                    <th className={th}>Keeper</th>
                    <th className={th}>Commit</th>
                    <th className={th}>Bid</th>
                    <th className={th}>AI reasoning</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.map((b) => (
                    <tr key={b.keeper} className="border-t border-line first:border-t-0">
                      <td className={`${td} align-top`}>
                        <AccountLink id={b.keeper} className="text-sm font-semibold text-ink" />
                        {b.leading && b.bid && (
                          <span className="mt-2 flex w-fit items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-hover">
                            <ArrowDown aria-hidden="true" className="size-3" /> {r.winner ? "Winner" : "Leading"}
                          </span>
                        )}
                      </td>
                      <td className={`${td} align-top font-mono text-[13px] text-ink-2`}>+{b.offset} blk</td>
                      <td className={`${td} align-top font-bold whitespace-nowrap ${b.leading ? "text-glow" : "text-ink"}`}>
                        {b.bid ? (
                          `${formatNear(b.bid)} NEAR`
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-ink-2">
                            <Lock aria-hidden="true" className="size-3.5" /> Sealed
                          </span>
                        )}
                      </td>
                      {/* Keeper-written text: rendered as plain text only (FE-NFR-5). */}
                      <td className={`${td} max-w-[48ch] align-top text-ink-2`}>
                        {b.bid ? (
                          b.memo ? <q>{b.memo}</q> : <span className="text-ink-3">No memo.</span>
                        ) : (
                          <span className="text-ink-3">
                            Not revealed yet.{b.hash && ` Commit hash ${shortHash(b.hash)}.`} If it stays sealed, the {formatNear(b.bond)} NEAR bond goes to this job’s balance.
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <div className="px-5 pb-2 md:hidden">
              <BidList bids={bids} winner={!!r.winner} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
