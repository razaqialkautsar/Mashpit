// Keeper safety policies: back off from targets that keep failing, and keep the account funded.
// Pure functions so they can be unit tested.

import type { ExecutionRecord } from "./near.ts";

/** Blocks to wait after the first failed attempt in a round; doubles after each further failure. */
export const FAIL_BACKOFF_BLOCKS = 50;
/** Failed attempts in one round after which the keeper stops trying that round. */
export const FAIL_LIMIT = 3;
/** Failed runs among the last RECENT_RUNS after which the keeper stops bidding on a job. */
export const BID_FAIL_LIMIT = 3;
export const RECENT_RUNS = 5;

/**
 * A failed call leaves the job due, so without a limit a keeper would retry a broken target
 * every few blocks and pay gas each time.
 */
export function roundFailures(history: ExecutionRecord[], roundId: number): { count: number; lastBlock: number } {
  const failed = history.filter((h) => h.round_id === roundId && h.outcome === "Failed");
  return { count: failed.length, lastBlock: failed.reduce((m, h) => Math.max(m, h.exec_block), 0) };
}

/** Block from which the next attempt is allowed, or null when the keeper should give up the round. */
export function nextAttemptBlock(failures: { count: number; lastBlock: number }): number | null {
  if (failures.count === 0) return 0;
  if (failures.count >= FAIL_LIMIT) return null;
  return failures.lastBlock + FAIL_BACKOFF_BLOCKS * 2 ** (failures.count - 1);
}

/** Failed runs among the job's most recent runs (Slashed rows are not runs and are skipped). */
export function recentFailedRuns(history: ExecutionRecord[], n = RECENT_RUNS): number {
  return history
    .filter((h) => h.outcome !== "Slashed")
    .slice(-n)
    .filter((h) => h.outcome === "Failed").length;
}

export type Funds = "ok" | "withdraw" | "low";

/**
 * What to do about the account balance: withdraw earned rewards when it runs low, and stop
 * committing new bids when it is critically low (a commit that cannot be revealed loses its bond).
 */
export function fundsAction(available: bigint, rewards: bigint, low: bigint, critical: bigint, minWithdraw: bigint): Funds {
  if (available < low && rewards >= minWithdraw) return "withdraw";
  if (available < critical) return "low";
  return "ok";
}
