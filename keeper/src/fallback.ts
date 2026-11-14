// Deterministic bidding rule, used when the AI model is not configured, fails, times out or
// returns an invalid answer (PRD FR-K3).
//
// Cost model (estimates, tune with EST_* env vars):
//   cost = gas_price × (commit + reveal + execute gas burnt)
// Defaults come from a measured testnet run of job 0 (LiNEAR epoch_update_rewards, 13 Nov 2026):
// the whole execute transaction burnt 14.5 Tgas (0.0013 NEAR) with 250 Tgas prepaid; a simple
// contract call (register_keeper) burnt 2.6 Tgas. Unused prepaid gas is refunded.

import { GRID_STEPS } from "./auction.ts";
import type { Strategy } from "./config.ts";
import type { ExecutionRecord } from "./near.ts";

export interface DecisionInput {
  jobId: number;
  target: string;
  method: string;
  maxReward: bigint;
  estCost: bigint;
  feeBps: number;
  freeStake: bigint;
  requiredStake: bigint;
  history: ExecutionRecord[];
  previousRound?: { commits: number; winningBid: bigint | null };
  strategy: Strategy;
}

export interface Decision {
  participate: boolean;
  step: number; // 0..100, bid = max_reward × step / 100
  reason: string;
  source: "ai" | "fallback" | "cache";
  usage?: { prompt: number; completion: number }; // AI tokens, when the model reports them
}

const MARGIN: Record<Strategy, number> = { aggressive: 1.2, balanced: 1.5, conservative: 2.0 };

export function estimateCost(gasPrice: bigint): bigint {
  const tgas =
    Number(process.env.EST_COMMIT_TGAS ?? 3) +
    Number(process.env.EST_REVEAL_TGAS ?? 3) +
    Number(process.env.EST_EXECUTE_TGAS ?? 20);
  return gasPrice * BigInt(Math.ceil(tgas * 1e12));
}

/** Smallest grid step whose reward, after the protocol fee, covers cost × margin. */
export function minProfitableStep(input: DecisionInput, margin: number): number {
  if (input.maxReward === 0n) return Number(GRID_STEPS) + 1;
  const keep = 10_000 - input.feeBps; // share of the bid the keeper keeps, in bps
  const needed = (Number(input.estCost) * margin * 10_000) / keep;
  return Math.ceil((needed * Number(GRID_STEPS)) / Number(input.maxReward));
}

export function fallbackDecision(input: DecisionInput): Decision {
  const nearStr = (y: bigint) => (Number(y) / 1e24).toFixed(4);
  if (input.freeStake < input.requiredStake) {
    return {
      participate: false,
      step: 100,
      reason: `Skip: free stake ${nearStr(input.freeStake)} NEAR < required ${nearStr(input.requiredStake)} NEAR.`,
      source: "fallback",
    };
  }
  const margin = MARGIN[input.strategy];
  const step = Math.max(0, minProfitableStep(input, margin));
  if (step > Number(GRID_STEPS)) {
    return {
      participate: false,
      step: 100,
      reason: `Skip: max reward ${nearStr(input.maxReward)} NEAR does not cover est. cost ${nearStr(input.estCost)} NEAR x${margin}.`,
      source: "fallback",
    };
  }
  return {
    participate: true,
    step,
    reason: `Rule (${input.strategy}): est. cost ${nearStr(input.estCost)} NEAR x${margin} margin after ${input.feeBps / 100}% fee -> ${step}% of max reward.`,
    source: "fallback",
  };
}
