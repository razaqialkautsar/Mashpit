// Commit-reveal helpers. Must match the contract (contracts/mashpit/src/auction.rs):
//   hash = sha256(utf8("{bid_yocto}:{salt}:{keeper_account_id}"))
//
// Restart safety without stored state:
// - the salt is derived from KEEPER_SECRET + contract + job + round, so it can be recomputed;
// - bids are restricted to a 1% grid of max_reward, so after a restart the keeper recovers its
//   bid by matching the 101 grid values against its own commit hash read from get_round.

import { createHash, createHmac } from "node:crypto";

export const GRID_STEPS = 100n;

export function deriveSalt(secret: string, contractId: string, jobId: number, roundId: number): string {
  return createHmac("sha256", secret).update(`${contractId}:${jobId}:${roundId}`).digest("hex");
}

/** Bid for a grid step (0..100) as a fraction of max_reward. */
export function gridBid(maxReward: bigint, step: number): bigint {
  const s = BigInt(Math.min(100, Math.max(0, Math.round(step))));
  return (maxReward * s) / GRID_STEPS;
}

export function commitHash(bid: bigint, salt: string, accountId: string): Buffer {
  return createHash("sha256").update(`${bid}:${salt}:${accountId}`, "utf8").digest();
}

export function commitHashBase64(bid: bigint, salt: string, accountId: string): string {
  return commitHash(bid, salt, accountId).toString("base64");
}

/** Find the grid bid whose hash equals `hashBase64`, or null. */
export function recoverBid(
  hashBase64: string,
  maxReward: bigint,
  salt: string,
  accountId: string,
): bigint | null {
  for (let step = 0; step <= Number(GRID_STEPS); step++) {
    const bid = gridBid(maxReward, step);
    if (commitHashBase64(bid, salt, accountId) === hashBase64) return bid;
  }
  return null;
}

/** Cut a string to at most `maxBytes` UTF-8 bytes without splitting a character. */
export function truncateUtf8(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return s;
  let out = "";
  for (const ch of s) {
    if (Buffer.byteLength(out + ch, "utf8") > maxBytes) break;
    out += ch;
  }
  return out;
}
