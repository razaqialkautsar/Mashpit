import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { commitHashBase64, deriveSalt, gridBid, recoverBid, truncateUtf8 } from "./auction.ts";
import { fallbackDecision, minProfitableStep, type DecisionInput } from "./fallback.ts";

const NEAR = 10n ** 24n;

test("commit hash matches the contract formula sha256(utf8('{bid}:{salt}:{account}'))", () => {
  const expected = createHash("sha256").update("37000000000000000000000:s1:k1.testnet").digest("base64");
  assert.equal(commitHashBase64(37_000_000_000_000_000_000_000n, "s1", "k1.testnet"), expected);
});

test("salt is deterministic per contract, job and round", () => {
  const a = deriveSalt("secret-secret-secret", "c.testnet", 0, 1);
  assert.equal(a, deriveSalt("secret-secret-secret", "c.testnet", 0, 1));
  assert.notEqual(a, deriveSalt("secret-secret-secret", "c.testnet", 0, 2));
  assert.notEqual(a, deriveSalt("another-secret-xxxx", "c.testnet", 0, 1));
});

test("bid is recovered from the commit hash after a restart", () => {
  const max = NEAR / 20n; // 0.05 NEAR
  const salt = deriveSalt("secret-secret-secret", "c.testnet", 3, 7);
  const bid = gridBid(max, 12);
  const hash = commitHashBase64(bid, salt, "k2.testnet");
  assert.equal(recoverBid(hash, max, salt, "k2.testnet"), bid);
  assert.equal(recoverBid(hash, max, salt, "k3.testnet"), null);
});

test("memo is cut to a byte limit without splitting characters", () => {
  const s = "é".repeat(200); // 2 bytes each
  const out = truncateUtf8(s, 280);
  assert.equal(Buffer.byteLength(out, "utf8"), 280);
  assert.equal(truncateUtf8("short", 280), "short");
});

test("fallback bids above breakeven and skips without enough free stake", () => {
  const input: DecisionInput = {
    jobId: 0,
    target: "linear-protocol.testnet",
    method: "epoch_update_rewards",
    maxReward: NEAR / 20n,
    estCost: 2_600_000_000_000_000_000_000n, // 0.0026 NEAR
    feeBps: 500,
    freeStake: NEAR,
    requiredStake: (NEAR * 6n) / 10n,
    history: [],
    strategy: "balanced",
  };
  const d = fallbackDecision(input);
  assert.equal(d.participate, true);
  assert.ok(d.step >= minProfitableStep(input, 1));
  assert.equal(fallbackDecision({ ...input, freeStake: NEAR / 2n }).participate, false);
  assert.ok(
    fallbackDecision({ ...input, strategy: "aggressive" }).step <
      fallbackDecision({ ...input, strategy: "conservative" }).step,
  );
});
