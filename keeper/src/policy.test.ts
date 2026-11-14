import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExecutionRecord } from "./near.ts";
import { FAIL_BACKOFF_BLOCKS, FAIL_LIMIT, fundsAction, nextAttemptBlock, recentFailedRuns, roundFailures } from "./policy.ts";

const rec = (round_id: number, outcome: ExecutionRecord["outcome"], exec_block: number): ExecutionRecord => ({
  round_id,
  executor: "k1.testnet",
  paid: "0",
  outcome,
  exec_block,
  epoch: 1,
  open_mode: false,
});

test("no failures: execute right away", () => {
  assert.equal(nextAttemptBlock(roundFailures([rec(4, "Paid", 100)], 5)), 0);
});

test("failures in the round back off exponentially, then the round is given up", () => {
  const h = [rec(5, "Failed", 1000)];
  assert.equal(nextAttemptBlock(roundFailures(h, 5)), 1000 + FAIL_BACKOFF_BLOCKS);
  h.push(rec(5, "Failed", 1100));
  assert.equal(nextAttemptBlock(roundFailures(h, 5)), 1100 + FAIL_BACKOFF_BLOCKS * 2);
  while (h.length < FAIL_LIMIT) h.push(rec(5, "Failed", 1200));
  assert.equal(nextAttemptBlock(roundFailures(h, 5)), null);
  // Failures of an earlier round do not count against the current one.
  assert.equal(nextAttemptBlock(roundFailures(h, 6)), 0);
});

test("recent failed runs ignore Slashed rows and older runs", () => {
  const h = [rec(1, "Failed", 1), rec(2, "Paid", 2), rec(3, "Slashed", 3), rec(3, "Failed", 4), rec(3, "Failed", 5), rec(3, "Failed", 6), rec(4, "Paid", 7)];
  assert.equal(recentFailedRuns(h, 5), 3);
  assert.equal(recentFailedRuns(h, 2), 1);
});

test("funds: withdraw rewards when low, stop bidding when critical and nothing to withdraw", () => {
  const N = 10n ** 24n;
  const low = N / 10n, critical = (N * 3n) / 100n, min = N / 100n;
  assert.equal(fundsAction(N, N, low, critical, min), "ok");
  assert.equal(fundsAction(N / 20n, N / 10n, low, critical, min), "withdraw");
  assert.equal(fundsAction(N / 20n, 0n, low, critical, min), "ok");
  assert.equal(fundsAction(N / 100n, 0n, low, critical, min), "low");
  assert.equal(fundsAction(N / 100n, N / 10n, low, critical, min), "withdraw");
});
