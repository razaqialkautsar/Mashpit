// Mashpit reference keeper agent.
//
// Loop: read every active job, then act on its phase as computed by the contract:
//   Commit           -> decide a bid (AI, else deterministic rule) and commit its hash
//   Reveal           -> reveal bid + salt (+ the decision's reason as memo)
//   AwaitingFinalize -> the expected winner finalizes, or executes if the job is already due
//   Exclusive        -> the winner executes; others poke so the winner's window starts counting
//   Open             -> anyone executes (the contract slashes a winner that missed its window)
// Only methods allowed by a function-call key are used, and none attaches a deposit.

import { aiDecision } from "./ai.ts";
import { deriveSalt, commitHashBase64, gridBid, recoverBid, truncateUtf8 } from "./auction.ts";
import { loadConfig } from "./config.ts";
import { estimateCost, fallbackDecision, minProfitableStep, type Decision, type DecisionInput } from "./fallback.ts";
import { Mashpit, contractError, type ContractConfig, type JobView } from "./near.ts";
import { BID_FAIL_LIMIT, RECENT_RUNS, fundsAction, nextAttemptBlock, recentFailedRuns, roundFailures } from "./policy.ts";

const cfg = loadConfig();
const mp = new Mashpit(cfg);
const me = cfg.accountId;

// In-memory state only. Losing it on restart is fine: salts are derived and bids recovered.
const bids = new Map<string, { bid: bigint; reason: string }>();
const lastTry = new Map<string, number>(); // action key -> block of last attempt
const seenRounds = new Map<number, { roundId: number; commits: number; winningBid: bigint | null }>();
const previousRound = new Map<number, { commits: number; winningBid: bigint | null }>();
let contractConfig: ContractConfig & { protocol_fee_bps: number };
let lowFunds = false; // set by checkFunds: no new commits while the balance is critically low
const noted = new Set<string>(); // log-once keys

const RETRY_BLOCKS = 5;
const OPEN_JITTER_MS = Number(process.env.OPEN_JITTER_MS ?? 4000);
const log = (msg: string) => console.log(`${new Date().toISOString()} [${me}] ${msg}`);
const near = (y: bigint | string) => (Number(BigInt(y)) / 1e24).toFixed(4);
const logOnce = (key: string, msg: string) => {
  if (!noted.has(key)) {
    noted.add(key);
    log(msg);
  }
};

function shouldTry(key: string, block: number): boolean {
  const last = lastTry.get(key);
  if (last !== undefined && block - last < RETRY_BLOCKS) return false;
  lastTry.set(key, block);
  return true;
}

async function send(label: string, method: string, args: Record<string, unknown>, gasTgas: number) {
  try {
    const result = await mp.call<unknown>(method, args, gasTgas);
    log(`${label}: ok${result === null || result === undefined ? "" : ` -> ${JSON.stringify(result)}`}`);
    return true;
  } catch (err) {
    log(`${label}: failed (${contractError(err)})`);
    return false;
  }
}

function trackRound(job: JobView) {
  const r = job.round;
  const seen = seenRounds.get(job.id);
  if (seen && seen.roundId !== r.round_id) {
    previousRound.set(job.id, { commits: seen.commits, winningBid: seen.winningBid });
  }
  seenRounds.set(job.id, {
    roundId: r.round_id,
    commits: r.commits.length,
    winningBid: r.winner ? BigInt(r.winner.bid) : null,
  });
}

let gasPriceCache: { value: bigint; at: number } | null = null;
async function gasPrice(): Promise<bigint> {
  if (!gasPriceCache || Date.now() - gasPriceCache.at > 60_000) {
    gasPriceCache = { value: await mp.gasPrice(), at: Date.now() };
  }
  return gasPriceCache.value;
}

async function decide(job: JobView): Promise<Decision> {
  const maxReward = BigInt(job.max_reward);
  // The commit phase is short (~50 blocks), so read everything in parallel.
  const [keeper, price, history] = await Promise.all([mp.keeper(), gasPrice(), mp.history(job.id)]);
  const freeStake = keeper ? BigInt(keeper.stake) - BigInt(keeper.locked) : 0n;
  const bond = maxReward > BigInt(contractConfig.min_commit_bond) ? maxReward : BigInt(contractConfig.min_commit_bond);
  const input: DecisionInput = {
    jobId: job.id,
    target: job.target,
    method: job.method,
    maxReward,
    estCost: estimateCost(price),
    feeBps: contractConfig.protocol_fee_bps,
    freeStake,
    requiredStake: bond + maxReward * BigInt(contractConfig.stake_multiplier),
    history,
    previousRound: previousRound.get(job.id),
    strategy: cfg.strategy,
  };

  const failed = recentFailedRuns(history);
  if (failed >= BID_FAIL_LIMIT) {
    return {
      participate: false,
      step: 100,
      reason: `Skip: the target call failed in ${failed} of the last ${RECENT_RUNS} runs; failed calls pay nobody and cost gas.`,
      source: "fallback",
    };
  }
  const rule = fallbackDecision(input);
  if (!rule.participate && input.freeStake < input.requiredStake) return rule; // hard limit
  if (BigInt(job.balance) < maxReward) {
    return { participate: false, step: 100, reason: "Skip: job balance below max reward.", source: "fallback" };
  }

  const floor = Math.max(0, minProfitableStep(input, 1));
  const signature = marketSignature(job, input, floor);
  const cached = aiCache.get(job.id);
  if (cached && cached.signature === signature && Date.now() - cached.at < AI_CACHE_MS) {
    return { ...cached.decision, source: "cache", usage: undefined, reason: `${cached.decision.reason} (cached)` };
  }

  const ai = await aiDecision(cfg, input);
  if (!ai) return rule;
  const decision =
    ai.participate && ai.step < floor
      ? { ...ai, step: Math.min(100, floor), reason: `${ai.reason} (raised to breakeven ${floor}%)` }
      : ai;
  aiCache.set(job.id, { signature, decision, at: Date.now() });
  if (ai.usage) log(`job ${job.id}: AI used ${ai.usage.prompt}+${ai.usage.completion} tokens`);
  return decision;
}

// ---------- AI decision cache ----------
// Ask the model again only when the market changes (break-even, competitors, previous winning
// bid, last outcome) or the cached answer is older than AI_CACHE_MS. Cuts AI cost on fast jobs.

const AI_CACHE_MS = Number(process.env.AI_CACHE_MS ?? 30 * 60_000);
const aiCache = new Map<number, { signature: string; decision: Decision; at: number }>();

function marketSignature(job: JobView, input: DecisionInput, breakeven: number): string {
  const last = input.history.at(-1);
  return [
    job.max_reward,
    breakeven,
    input.previousRound?.commits ?? "-",
    input.previousRound?.winningBid?.toString() ?? "-",
    last ? `${last.outcome}:${last.executor === me}` : "-",
  ].join("|");
}

async function handleCommit(job: JobView) {
  const r = job.round;
  if (cfg.noNewBids || r.commits.some((c) => c.keeper === me)) return;
  if (cfg.drainJobs.has(job.id)) return logOnce(`drain:${job.id}`, `job ${job.id}: KEEPER_DRAIN_JOBS, no new bids`);
  if (lowFunds) return logOnce(`low:${job.id}:${r.round_id}`, `job ${job.id} round ${r.round_id}: balance critically low, not bidding`);
  if (job.current_block >= r.commit_end - 3) return; // too late to land in the commit phase
  const key = `commit:${job.id}:${r.round_id}`;
  if (!shouldTry(key, job.current_block)) return;

  const d = await decide(job);
  if (!d.participate) {
    log(`job ${job.id} round ${r.round_id}: no bid. ${d.reason}`);
    lastTry.set(key, Number.MAX_SAFE_INTEGER); // decided for this round
    return;
  }
  const bid = gridBid(BigInt(job.max_reward), d.step);
  const salt = deriveSalt(cfg.secret, cfg.contractId, job.id, r.round_id);
  bids.set(`${job.id}:${r.round_id}`, { bid, reason: d.reason });
  log(`job ${job.id} round ${r.round_id}: bid ${d.step}% = ${near(bid)} NEAR [${d.source}] ${d.reason}`);
  await send(`commit job ${job.id} round ${r.round_id}`, "commit_bid", {
    job_id: job.id,
    hash: commitHashBase64(bid, salt, me),
  }, 30);
}

async function handleReveal(job: JobView) {
  const r = job.round;
  const mine = r.commits.find((c) => c.keeper === me);
  if (!mine || mine.revealed) return;
  if (!shouldTry(`reveal:${job.id}:${r.round_id}`, job.current_block)) return;

  const salt = deriveSalt(cfg.secret, cfg.contractId, job.id, r.round_id);
  let entry = bids.get(`${job.id}:${r.round_id}`);
  if (!entry) {
    const bid = recoverBid(mine.hash, BigInt(job.max_reward), salt, me);
    if (bid === null) {
      log(`job ${job.id} round ${r.round_id}: cannot recover bid from commit hash; bond will be forfeited`);
      return;
    }
    entry = { bid, reason: "Bid recovered after restart from the on-chain commit hash." };
    log(`job ${job.id} round ${r.round_id}: recovered bid ${near(bid)} NEAR after restart`);
  }
  const memo = truncateUtf8(entry.reason, contractConfig.max_memo_bytes);
  await send(`reveal job ${job.id} round ${r.round_id} (${near(entry.bid)} NEAR)`, "reveal_bid", {
    job_id: job.id,
    bid: entry.bid.toString(),
    salt,
    memo,
  }, 30);
}

function expectedWinner(job: JobView): string | null {
  const reveals = [...job.round.reveals].sort((a, b) => {
    const d = BigInt(a.bid) - BigInt(b.bid);
    if (d !== 0n) return d < 0n ? -1 : 1;
    if (a.commit_block !== b.commit_block) return a.commit_block - b.commit_block;
    return a.keeper < b.keeper ? -1 : a.keeper > b.keeper ? 1 : 0;
  });
  return reveals[0]?.keeper ?? null; // the contract may still skip a keeper without free stake
}

async function execute(job: JobView, why: string) {
  if (cfg.skipExecute) {
    return logOnce(`skip:${job.id}:${job.round.round_id}`, `job ${job.id} round ${job.round.round_id}: KEEPER_SKIP_EXECUTE is on, not executing (${why})`);
  }
  if (!shouldTry(`execute:${job.id}:${job.round.round_id}`, job.current_block)) return;
  // A failed call keeps the job due. Back off, and give the round up after repeated failures.
  const failures = roundFailures(await mp.history(job.id), job.round.round_id);
  const next = nextAttemptBlock(failures);
  if (next === null) {
    return logOnce(`giveup:${job.id}:${job.round.round_id}`, `job ${job.id} round ${job.round.round_id}: target failed ${failures.count} times, giving the round up`);
  }
  if (job.current_block < next) {
    return logOnce(`backoff:${job.id}:${job.round.round_id}:${failures.count}`, `job ${job.id}: target failed ${failures.count}x, retrying from block ${next}`);
  }
  // In an open round every keeper may execute, so they all fire on the same block and all but
  // one pay gas for a rejected call. Wait a random moment, then re-read the job and stand down
  // if another keeper is already on it.
  if (why !== "winner" && why !== "exclusive window") {
    await new Promise((r) => setTimeout(r, Math.random() * OPEN_JITTER_MS));
    const fresh = await mp.job(job.id);
    if (!fresh || fresh.round.round_id !== job.round.round_id || fresh.round.in_flight || !fresh.is_due) {
      return log(`job ${job.id} round ${job.round.round_id}: another keeper got there first, standing down`);
    }
  }
  const gas = Math.min(
    contractConfig.max_total_gas_tgas,
    job.gas_tgas + contractConfig.callback_gas_tgas + contractConfig.overhead_gas_tgas + 10,
  );
  await send(`execute job ${job.id} round ${job.round.round_id} (${why})`, "execute", { job_id: job.id }, gas);
}

/** A paused job gets no bids and no runs, but this keeper still reveals a bid it committed. */
async function revealWhilePaused(job: JobView) {
  const r = job.round;
  const mine = r.commits.find((c) => c.keeper === me);
  if (mine && !mine.revealed && job.current_block >= r.commit_end && job.current_block < r.reveal_end) {
    return handleReveal(job);
  }
}

async function poke(job: JobView) {
  // Only EveryEpoch jobs need it: their due block is unknown until a call observes the epoch.
  if (job.schedule !== "EveryEpoch" || job.round.due_seen_block !== null) return;
  if (!shouldTry(`poke:${job.id}:${job.round.round_id}`, job.current_block)) return;
  await send(`poke job ${job.id} round ${job.round.round_id}`, "poke", { job_id: job.id }, 30);
}

async function handleJob(job: JobView) {
  trackRound(job);
  if (job.status === "Paused") return revealWhilePaused(job);
  const r = job.round;
  const winner = r.winner && !r.winner.settled ? r.winner.keeper : null;
  // A drained job only gets this keeper's own obligations: its reveals and the runs it won.
  const drained = cfg.drainJobs.has(job.id);

  switch (job.phase) {
    case "Commit":
      return handleCommit(job);
    case "Reveal":
      return handleReveal(job);
    case "AwaitingFinalize": {
      const expected = expectedWinner(job);
      if (job.is_due) {
        if (expected === me) return execute(job, "winner");
        if (expected === null) return drained ? undefined : execute(job, "no bids");
        return poke(job); // finalizes the round and starts the winner's window
      }
      if (expected === me && shouldTry(`finalize:${job.id}:${r.round_id}`, job.current_block)) {
        await send(`finalize job ${job.id} round ${r.round_id}`, "finalize_round", { job_id: job.id }, 30);
      }
      return;
    }
    case "Exclusive":
      if (winner === me) return execute(job, "exclusive window");
      return poke(job);
    case "Open":
      if (!job.is_due || (drained && winner !== me)) return;
      return execute(job, winner && winner !== me ? `${winner} missed its window` : "open round");
    default:
      return; // Awarded (not due yet), InFlight, Paused, Closed
  }
}

// ---------- Pacing ----------
// Public RPCs rate-limit (FastNEAR free tier, and rpc.testnet.near.org answers 429 as deprecated),
// so poll fast only while a job is in a phase that needs action soon.

const BLOCK_MS = 600; // measured testnet block time is ~0.58 s
const IDLE_MS = Number(process.env.IDLE_POLL_MS ?? 20_000);
const JOB_LIST_TTL_MS = 30_000;
let jobList: { ids: number[]; at: number } | null = null;

async function activeJobIds(): Promise<number[]> {
  if (!jobList || Date.now() - jobList.at > JOB_LIST_TTL_MS) {
    const all = await mp.listJobs();
    // Paused jobs stay watched: the contract still accepts reveals, and an unrevealed commit
    // loses its bond when the round is finalized.
    jobList = { ids: all.filter((s) => s.status === "Active" || s.status === "Paused").map((s) => s.id), at: Date.now() };
  }
  return jobList.ids;
}

/** How long this job can be left alone, in milliseconds. */
function idleFor(job: JobView): number {
  const r = job.round;
  const until = (block: number) => Math.max(0, (block - job.current_block) * BLOCK_MS);
  const mine = r.commits.find((c) => c.keeper === me);
  switch (job.phase) {
    case "Commit":
      return mine ? until(r.commit_end) : 0;
    case "Reveal":
      return mine && !mine.revealed ? 0 : until(r.reveal_end);
    case "Awarded":
    case "Open":
      if (job.is_due) return 0;
      return job.due_block !== null && job.schedule !== "EveryEpoch" ? until(job.due_block) : IDLE_MS;
    case "AwaitingFinalize":
    case "Exclusive":
    case "InFlight":
      return 0;
    case "Paused":
      // Wake up for the reveal window if this keeper has a bid to reveal.
      return mine && !mine.revealed && job.current_block < r.reveal_end ? until(r.commit_end) : IDLE_MS;
    default:
      return IDLE_MS;
  }
}

/** Handle every active job; return how long to sleep before the next tick. */
async function tick(): Promise<number> {
  const ids = await activeJobIds();
  const jobs = (await Promise.all(ids.map((id) => mp.job(id)))).filter((j): j is JobView => j !== null);
  // Transactions stay sequential: one signer, one nonce sequence.
  for (const job of jobs) await handleJob(job);
  const idle = Math.min(IDLE_MS, ...jobs.map(idleFor));
  return Math.max(cfg.pollMs, idle);
}

// ---------- Contract config ----------
// The owner can change the config (windows, gas cap, fee) at any time, so re-read it every few
// minutes instead of only at start-up. A stale gas cap made executes fail with NotEnoughGas.

let configReadAt = 0;
async function refreshConfig() {
  if (Date.now() - configReadAt < 5 * 60_000) return;
  const next = (await mp.config()) as typeof contractConfig;
  if (contractConfig && next.max_total_gas_tgas !== contractConfig.max_total_gas_tgas) {
    log(`contract gas cap changed: ${contractConfig.max_total_gas_tgas} -> ${next.max_total_gas_tgas} Tgas`);
  }
  contractConfig = next;
  configReadAt = Date.now();
}

// ---------- Funds ----------
// Gas comes from the keeper account. Withdraw earned rewards when the balance runs low; stop
// committing when it is critically low, so a commit is never left without gas to reveal it.

let fundsCheckedAt = 0;
async function checkFunds() {
  if (Date.now() - fundsCheckedAt < cfg.funds.checkMs) return;
  fundsCheckedAt = Date.now();
  const [state, keeper] = await Promise.all([mp.account.getState(), mp.keeper()]);
  const available = state.balance.available;
  const rewards = keeper ? BigInt(keeper.rewards) : 0n;
  const action = fundsAction(available, rewards, cfg.funds.low, cfg.funds.critical, cfg.funds.minWithdraw);
  if (action === "withdraw") {
    log(`balance ${near(available)} NEAR is low; withdrawing ${near(rewards)} NEAR of rewards`);
    await send("withdraw_rewards", "withdraw_rewards", {}, 30);
    fundsCheckedAt = 0; // re-check on the next tick
  }
  const wasLow = lowFunds;
  lowFunds = action === "low";
  if (lowFunds && !wasLow) log(`balance ${near(available)} NEAR is critically low and no rewards to withdraw: not bidding until topped up`);
  if (!lowFunds && wasLow) log(`balance ${near(available)} NEAR: bidding again`);
}

async function main() {
  await refreshConfig();
  const keeper = await mp.keeper();
  if (!keeper) throw new Error(`${me} is not a registered keeper on ${cfg.contractId}`);
  log(
    `started: contract ${cfg.contractId}, strategy ${cfg.strategy}, ` +
      `AI ${cfg.ai.apiKey && cfg.ai.model ? cfg.ai.model : "off (deterministic rule)"}, ` +
      `stake ${near(keeper.stake)} NEAR, rewards ${near(keeper.rewards)} NEAR` +
      (cfg.skipExecute ? ", SKIP_EXECUTE on" : "") +
      (cfg.noNewBids ? ", DRAIN on (no new bids)" : "") +
      (cfg.drainJobs.size ? `, draining jobs ${[...cfg.drainJobs].join(",")}` : ""),
  );
  for (;;) {
    let wait = cfg.pollMs;
    try {
      await refreshConfig();
      await checkFunds();
      wait = await tick();
    } catch (err) {
      log(`tick error: ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise((r) => setTimeout(r, wait));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
