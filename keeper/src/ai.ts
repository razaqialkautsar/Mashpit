// Bid decisions from a NEAR AI Cloud model (OpenAI-compatible chat completions API).
// Any failure (no key, timeout, HTTP error, invalid JSON, out-of-range answer) returns null so
// the caller falls back to the deterministic rule.

import type { Config } from "./config.ts";
import { minProfitableStep, type Decision, type DecisionInput } from "./fallback.ts";

const PERSONA: Record<string, string> = {
  aggressive: "You want to win as many rounds as possible and accept thin margins.",
  balanced: "You balance win rate against profit.",
  conservative: "You only bid when the profit is clearly worth the locked stake and the risk of failure.",
};

const near = (y: bigint) => (Number(y) / 1e24).toFixed(5);

function prompt(input: DecisionInput): string {
  const recent = input.history.slice(-5).map((h) => ({
    outcome: h.outcome,
    paid_near: near(BigInt(h.paid)),
    open_mode: h.open_mode,
  }));
  return JSON.stringify(
    {
      job: { id: input.jobId, call: `${input.target}.${input.method}` },
      max_reward_near: near(input.maxReward),
      protocol_fee_percent: input.feeBps / 100,
      estimated_gas_cost_near: near(input.estCost),
      breakeven_bid_percent: minProfitableStep(input, 1),
      stake_locked_if_you_win_near: near(input.requiredStake),
      free_stake_near: near(input.freeStake),
      recent_executions: recent,
      failed_runs_in_last_5: input.history.filter((h) => h.outcome !== "Slashed").slice(-5).filter((h) => h.outcome === "Failed").length,
      previous_round: input.previousRound
        ? {
            commits: input.previousRound.commits,
            winning_bid_percent:
              input.previousRound.winningBid === null || input.maxReward === 0n
                ? null
                : Number((input.previousRound.winningBid * 100n) / input.maxReward),
          }
        : null,
    },
    null,
    1,
  );
}

const SYSTEM = `You are a keeper agent in Mashpit, a sealed-bid market on NEAR where keepers bid to run a scheduled contract call.
Rules: the LOWEST bid wins the exclusive right to execute the next run and is paid its bid minus the protocol fee, only if the call succeeds.
The winner locks stake while it holds the round and is slashed if it misses its window. Bids are a whole percent (0-100) of max_reward.
Bidding below breakeven_bid_percent loses money. Other keepers are also bidding.
A "Failed" execution means the target call failed: nobody was paid, the executor still paid gas, and the winner can be slashed if it cannot execute in time. Be wary of jobs whose target keeps failing.
Answer with ONLY a JSON object: {"participate": boolean, "bid_percent": integer 0-100, "reason": "one sentence, max 200 characters"}.`;

export async function aiDecision(cfg: Config, input: DecisionInput): Promise<Decision | null> {
  if (!cfg.ai.apiKey || !cfg.ai.model) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.ai.timeoutMs);
  try {
    const res = await fetch(`${cfg.ai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.ai.apiKey}` },
      body: JSON.stringify({
        model: cfg.ai.model,
        // No temperature: some models (e.g. openai/gpt-5-nano) accept only their default.
        // Room for reasoning models, which spend tokens before answering; billing is per token used.
        max_tokens: 800,
        messages: [
          { role: "system", content: `${SYSTEM}\nYour strategy: ${PERSONA[input.strategy]}` },
          { role: "user", content: prompt(input) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[ai] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) {
      console.warn(`[ai] no JSON in answer: ${text.slice(0, 200)}`);
      return null;
    }
    const parsed = JSON.parse(json) as { participate?: unknown; bid_percent?: unknown; reason?: unknown };
    const step = Number(parsed.bid_percent);
    if (typeof parsed.participate !== "boolean" || !Number.isInteger(step) || step < 0 || step > 100) {
      console.warn(`[ai] invalid answer: ${json.slice(0, 200)}`);
      return null;
    }
    return {
      participate: parsed.participate,
      step,
      reason: `AI (${cfg.ai.model}): ${String(parsed.reason ?? "").slice(0, 220)}`,
      source: "ai",
      usage: body.usage
        ? { prompt: body.usage.prompt_tokens ?? 0, completion: body.usage.completion_tokens ?? 0 }
        : undefined,
    };
  } catch (err) {
    console.warn(`[ai] ${err instanceof Error && err.name === "AbortError" ? "timeout" : String(err)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
