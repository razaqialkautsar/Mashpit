import type { Config, JobView, Phase } from "./types";

/** The five steps of the heat track (DESIGN.md → signature move). */
export const TRACK = ["Commit", "Reveal", "Awarded", "Exclusive", "Settled"] as const;
export type TrackStep = (typeof TRACK)[number];

/** Where each contract phase sits on the track. */
export const STEP: Record<Phase, number> = {
  Commit: 0,
  Reveal: 1,
  AwaitingFinalize: 2,
  Awarded: 2,
  Exclusive: 3,
  Open: 3,
  InFlight: 4,
  // Off the track: nothing is current while paused; everything is done once closed.
  Paused: -1,
  Closed: 5,
};

export type PhaseClock = {
  /** Blocks left in the current phase, when the phase has an end block. */
  left?: number;
  /** 0–1 through the current phase. */
  progress: number;
  /** Block the phase ends at. */
  endBlock?: number;
  /** "blocks left to reveal", or a sentence when there is no countdown. */
  label: string;
  /** Short line for tables: "12 blocks", "Due now". */
  short: string;
  /** Second line for tables. */
  hint: string;
};

/**
 * Countdown for the job's current phase, derived only from fields the contract
 * returns (`phase` is computed on-chain; the frontend never re-derives it).
 */
export function phaseClock(job: JobView, config?: Config): PhaseClock {
  const r = job.round;
  const now = job.current_block;
  const span = (start: number, end: number, label: string, hint: (left: number) => string): PhaseClock => {
    const left = Math.max(0, end - now);
    return {
      left,
      endBlock: end,
      progress: Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start))),
      label,
      short: `${left.toLocaleString("en-US")} blocks`,
      hint: hint(left),
    };
  };
  const secs = (b: number) => `≈ ${Math.round(b * 0.58)} s`;

  switch (job.phase) {
    case "Commit":
      return span(r.opened_at, r.commit_end, "blocks left to commit", secs);
    case "Reveal":
      return span(r.commit_end, r.reveal_end, "blocks left to reveal", secs);
    case "Awarded":
      if (job.due_block != null)
        return span(r.reveal_end, job.due_block, "blocks until the job is due", (b) => `${secs(b)} to due`);
      break;
    case "Exclusive":
      if (job.exclusive_until != null)
        return span(
          job.exclusive_until - (config?.grace_blocks ?? 0),
          job.exclusive_until,
          "blocks for the winner to execute",
          (b) => `${secs(b)} to execute`,
        );
      break;
    case "Open":
      return { progress: 1, label: "Due now. Any registered keeper can execute for the max reward.", short: "Due now", hint: "any keeper, pays max" };
    case "InFlight":
      return { progress: 1, label: "A keeper's call is in flight. The callback settles payment.", short: "Running", hint: "waiting for callback" };
    case "Paused":
      return { progress: 0, label: "Paused by the owner. Keepers skip this job until it resumes.", short: "Paused", hint: "owner paused" };
    case "Closed":
      return { progress: 1, label: "Closed by the owner.", short: "Closed", hint: "" };
    case "AwaitingFinalize":
      return {
        progress: 1,
        label: "Bidding closed. The next keeper call finalizes the round and picks the winner.",
        short: "Finalizing",
        hint: job.is_due ? "job is due" : "next keeper call",
      };
  }
  return { progress: 1, label: "Waiting for the next keeper call.", short: "—", hint: "" };
}

/** How "hot" a job is, for picking the round to feature on the Live page. */
export function heat(phase: Phase): number {
  const scores: Record<Phase, number> = { Reveal: 6, Commit: 5, Exclusive: 4, InFlight: 4, Awarded: 3, Open: 2, AwaitingFinalize: 1, Paused: 0, Closed: 0 };
  return scores[phase];
}
