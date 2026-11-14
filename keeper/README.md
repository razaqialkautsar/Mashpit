# Mashpit keeper agent

The reference keeper for the [Mashpit contract](../contracts/mashpit/README.md). A keeper is an
always-on process that bids in Mashpit's sealed auctions and runs the scheduled call when it wins.
It earns its bid (minus a 5% protocol fee) only if the call succeeds, and it is slashed if it wins
and then misses its window.

The agent decides each bid with a NEAR AI Cloud model when one is configured. Without one, or when
the model fails or times out, it uses a deterministic rule.

## What it does

Every few seconds it reads each active job from the contract and acts on the phase the contract
reports:

| Phase | Action | Contract method |
| --- | --- | --- |
| `Commit` | Decide whether and how much to bid, then commit the sealed hash | `commit_bid` |
| `Reveal` | Reveal bid and salt, with the decision's reason as the memo | `reveal_bid` |
| `AwaitingFinalize` | The expected winner finalizes the round, or executes if the job is already due | `finalize_round` / `execute` |
| `Exclusive` | The winner executes; for `EveryEpoch` jobs, others `poke` so the winner's window starts counting | `execute` / `poke` |
| `Open` | Any keeper executes when the job is due; the contract first slashes a winner that missed its window | `execute` |

Every method it calls attaches no deposit, so the agent runs with a **function-call key** limited
to the Mashpit contract. It never needs the account's full-access key.

## Run it locally

Requirements: Node.js ≥ 22.22.2 (required by near-api-js 7.5.3), a keeper account registered on
the contract, and a function-call key for it (see [Keeper setup](../contracts/mashpit/README.md#keeper-setup)).

```sh
cd keeper
npm install
cp .env.example .env        # fill in the keeper account, its function-call key and a secret
node --env-file=.env --import tsx src/index.ts
```

Checks:

```sh
npm run typecheck
npm test
```

To run several keepers on one machine, give each its own env file (`.env.k1`, `.env.k2`, …; any
`.env.*` file is git-ignored) and start one process per file.

## Configuration

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `KEEPER_ACCOUNT_ID` | yes | | Keeper account, e.g. `k1.mashpit.testnet` |
| `KEEPER_PRIVATE_KEY` | yes | | The account's **function-call** key, `ed25519:...` |
| `KEEPER_SECRET` | yes | | ≥ 16 characters. Salts are derived from it, so keep it the same across restarts and redeploys |
| `KEEPER_STRATEGY` | | `balanced` | `aggressive`, `balanced` or `conservative` |
| `KEEPER_DRAIN` | | `false` | Finish pending reveals and executions but never bid in a new round |
| `KEEPER_DRAIN_JOBS` | | empty | Job ids to stop bidding on; what is already committed still gets revealed and executed |
| `KEEPER_SKIP_EXECUTE` | | `false` | Demo switch: keep bidding but never execute, so the contract slashes this keeper |
| `LOW_BALANCE_NEAR` / `CRITICAL_BALANCE_NEAR` / `MIN_WITHDRAW_NEAR` | | `0.1` / `0.03` / `0.01` | Below LOW the keeper withdraws its rewards; below CRITICAL with nothing to withdraw it stops bidding |
| `CONTRACT_ID` | | `contract.mashpit.testnet` | |
| `RPC_URLS` | | FastNEAR testnet, then `rpc.testnet.near.org` | Comma-separated, tried in order |
| `POLL_MS` / `IDLE_POLL_MS` | | `3000` / `20000` | Poll interval when an action is near / when every job is idle |
| `NEAR_AI_API_KEY`, `NEAR_AI_MODEL` | | empty | Both set: bids come from the model. Otherwise the deterministic rule is used |
| `NEAR_AI_BASE_URL` | | `https://cloud-api.near.ai/v1` | OpenAI-compatible endpoint |
| `NEAR_AI_TIMEOUT_MS` | | `15000` | After this the keeper falls back to the rule |
| `AI_CACHE_MS` | | `1800000` | Reuse the last AI decision for a job while the market is unchanged, up to this age |
| `EST_COMMIT_TGAS` / `EST_REVEAL_TGAS` / `EST_EXECUTE_TGAS` | | `3` / `3` / `20` | Gas burnt per step, used to estimate cost |

## How it bids

**Cost.** `cost = gas price × (commit + reveal + execute gas burnt)`. The defaults come from a
measured testnet run: executing job 0 (LiNEAR `epoch_update_rewards`) burnt 14.5 Tgas
(about 0.0013 NEAR) with 250 Tgas prepaid, and a plain contract call burnt about 2.6 Tgas. Unused
prepaid gas is refunded.

**Deterministic rule.** Bid the smallest whole percent of `max_reward` that covers
`cost × margin` after the protocol fee. The margin is 1.2× (aggressive), 1.5× (balanced) or
2× (conservative). The rule skips a round when the keeper's free stake cannot cover the commit
bond plus the winner's lock, or when the job's balance cannot pay `max_reward`.

**AI.** The model receives the job, `max_reward`, the fee, the estimated cost, the break-even
percent, the stake it would lock, the job's recent executions and how the previous round went. It
answers `{"participate", "bid_percent", "reason"}`. Invalid answers and timeouts fall back to the
rule, and a bid below break-even is raised to break-even. The reason becomes the reveal memo, which
the dashboard shows.

The model is asked again only when the market changes (break-even, number of competitors, the
previous winning bid, or the last outcome) or the cached answer is older than `AI_CACHE_MS`.
Otherwise the last decision is reused and its memo is marked "(cached)".

Model benchmark (14 Nov 2026, two calls per model through `aiDecision`, job 1 data, break-even 28%,
previous winning bid 33%; cost = tokens used × the price listed at `/v1/models`):

| Model | Valid | Latency | Bid balanced / aggressive | Cost per decision |
| --- | --- | --- | --- | --- |
| `openai/gpt-6-luna` | yes | 2.8–4.3 s | 32% / 29% | ~$0.00014 |
| `anthropic/claude-haiku-5-5` | yes | 2.2–2.8 s | 31% / 29% | ~$0.00025 |
| `google/gemini-2.5-flash-lite` | yes | 1.5–1.8 s | 30% / 34% (aggressive above the previous winner) | ~$0.00006 |
| `deepseek/deepseek-v3.2` | yes | 8–9 s | 29% / 27% (below break-even, raised to 28%) | ~$0.00047 |
| `openai/gpt-5-nano` | no (empty answer) | | | |
| `z-ai/glm-5.3-flash` | no (timeout) | | | |

Reasoning models can spend their whole token budget before answering. The keeper therefore sends
no `temperature` (some models accept only their default) and allows up to 800 tokens.

**Failing targets.** A failed call pays nobody and leaves the job due, so the keeper backs off
after each failure in a round (50, then 100 blocks) and gives the round up after 3 failures. It
stops bidding on a job whose target failed in 3 of its last 5 runs, and the AI sees the failure
count too.

**Gas money.** Every few minutes the keeper checks its balance. When it runs low it calls
`withdraw_rewards`; when it is critically low with nothing to withdraw, it stops committing new
bids, because a commit that cannot be revealed loses its bond.

**Restart safety without stored state.** The salt is
`HMAC-SHA256(KEEPER_SECRET, "{contract}:{job_id}:{round_id}")`. Bids are restricted to a 1% grid
of `max_reward`. After a restart the keeper reads its own commit hash from `get_round`, tries the
101 grid values, and reveals the one that matches.

## Deploy on Railway

The reference setup is three Railway services (one per keeper) built from this repository. The
steps below follow Railway's docs; setting names may differ slightly in the UI.

For each keeper (`k1`, `k2`, `k3`):

1. **Create a service from the GitHub repo.** Railway builds it with
   [Railpack](https://railpack.com/languages/node).
2. **Root directory.** In the service **Settings**, set the root directory to `/keeper` so only this
   package is deployed ([monorepo docs](https://docs.railway.com/deployments/monorepo)).
3. **Watch paths.** Set them to `/keeper/**` so changes elsewhere in the repo do not redeploy the
   keeper. Watch paths still match from the repo root when a root directory is set.
4. **Start command.** Railpack uses the `start` script in `package.json` (`tsx src/index.ts`) by
   default. You can also set `npm start` explicitly in the service settings.
5. **Node version.** Railpack reads `engines.node` from `package.json` (`>=22.22.2`). To pin a
   version, set `RAILPACK_NODE_VERSION`, which takes precedence.
6. **Variables.** Add the variables from [Configuration](#configuration). Then **seal**
   `KEEPER_PRIVATE_KEY`, `KEEPER_SECRET` and `NEAR_AI_API_KEY` (3-dot menu → Seal). A sealed value
   reaches deployments but is never shown in the UI or returned by the API. A sealed variable
   cannot be unsealed, and its value is not copied to PR environments or duplicated services
   ([variables docs](https://docs.railway.com/variables)).
7. **Keep Serverless (App Sleeping) off.** A keeper makes outbound calls only and must not sleep
   ([serverless docs](https://docs.railway.com/deployments/serverless)).

**Redeploys.** Railway deploys automatically when commits are pushed to the linked branch, and
autodeploy can be disabled in the service settings
([autodeploy docs](https://docs.railway.com/deployments/github-autodeploys)). A keeper restarted
between commit and reveal recovers its bid. To be safe anyway, set `KEEPER_DRAIN=true`, wait for
the keeper's current round to finish, then redeploy and set it back to `false`.

## Tested on testnet (13 Nov 2026)

Three local keepers (`k1` aggressive, `k2` balanced, `k3` conservative) ran against
`contract.mashpit.testnet` on job 1, a `ping` of `aurora.pool.f863973.m0` every 200 blocks. The
following happened on-chain:

- Rounds with no bids opened to every keeper, and the first one to execute was paid `max_reward`.
- Lowest-bid wins: k1 won at 33% of `max_reward` and was paid its bid after executing in its
  exclusive window.
- A keeper that committed but did not reveal lost its 0.1 NEAR bond to the job balance.
- A winner that missed its window was slashed, and another keeper executed instead.
- k2 was stopped after committing and restarted during the reveal phase. It recovered its bid from
  the on-chain hash and revealed successfully. Two more keepers did the same in drain mode, and
  their stake ended fully unlocked.

The first runs also showed that public RPCs rate-limit three keepers polling from one IP:
`rpc.testnet.near.org` answers HTTP 429 with a deprecation notice, and FastNEAR's free tier
answers "Rate limits exceeded". The keeper now polls fast only near an action, and the contract's
windows were widened to 100 / 100 / 150 blocks (commit / reveal / grace).

## Files

| File | Contents |
| --- | --- |
| `src/index.ts` | Main loop, phase handling, pacing, drain and skip-execute switches |
| `src/near.ts` | RPC client (failover) and contract calls |
| `src/auction.ts` | Salt, commit hash, bid grid, bid recovery |
| `src/fallback.ts` | Cost estimate and deterministic bidding rule |
| `src/ai.ts` | NEAR AI Cloud decision |
| `src/config.ts` | Environment variables |
| `src/auction.test.ts` | Unit tests |
