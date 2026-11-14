# Mashpit

**Keepers get paid for outcomes, not attempts.** Mashpit is an open market where AI keeper agents
bid to run scheduled NEAR contract calls. The Mashpit contract makes each call itself, checks the
result in its callback, and pays the keeper only when the result proves the job was done.

On NEAR testnet a Mashpit keeper ran LiNEAR's `epoch_stake`, which staked **284.94 NEAR** of pending
user deposits with a validator and returned `true`. The keeper was paid for it
([transaction](https://testnet.nearblocks.io/txns/GcdTUemupyBHbLDKqPrLBbEoArjCQwqnyPbkzSjpmE95)).
When a call has nothing to do or fails, nobody is paid.

**Live dashboard:** [mashpit-near.vercel.app](https://mashpit-near.vercel.app) ·
[proof page](https://mashpit-near.vercel.app/proof) · contract
[`contract.mashpit.testnet`](https://testnet.nearblocks.io/address/contract.mashpit.testnet)

Built for NEAR Hackathon 2026, tracks **AI Swarms** (agents competing in a sealed-bid market) and
**Open Innovation** (a pay-on-proof primitive for scheduled execution that any NEAR contract can
use). **Testnet only, not audited.**

## Verify in 5 minutes

Every claim below can be checked without keys or accounts: a read-only call with
[near-cli-rs](https://github.com/near/near-cli-rs), a transaction page on NearBlocks, or a test run.
The checks still work if the keepers are offline.

| Claim | Check | What you should see |
| --- | --- | --- |
| The contract is live with the parameters this README describes | `near contract call-function as-read-only contract.mashpit.testnet get_config json-args '{}' network-config testnet now` | `commit_blocks` 100, `reveal_blocks` 100, `grace_blocks` 150, `stake_multiplier` 10, `protocol_fee_bps` 500, `max_total_gas_tgas` 400 |
| It serves third-party protocols, not demo contracts | `near contract call-function as-read-only contract.mashpit.testnet list_jobs json-args '{}' network-config testnet now` | Six jobs: five target `linear-protocol.testnet` (`epoch_update_rewards`, `epoch_stake`), one targets the validator pool `aurora.pool.f863973.m0` (`ping`, paused) |
| A keeper is paid only when the result proves the work | [`GcdTUemu…`](https://testnet.nearblocks.io/txns/GcdTUemupyBHbLDKqPrLBbEoArjCQwqnyPbkzSjpmE95) on NearBlocks | LiNEAR `epoch_cleanup` and `epoch_stake_success` (284.94 NEAR to `everstake.pool.f863973.m0`), then Mashpit `job_executed` with `"outcome":"Paid"` on a job whose rule is `Returns true` |
| A failed call pays nothing | [`3AHW7tRs…`](https://testnet.nearblocks.io/txns/3AHW7tRsFjDpGZ48XPQzB6Z4NJ5mJStNsbXuHDVTFVi1) | `job_executed` with `"outcome":"Failed","paid":"0"` (a test job calling a method that does not exist) |
| A winner that misses its window is slashed, and another keeper takes over | [`BPwawiqN…`](https://testnet.nearblocks.io/txns/BPwawiqNf9zWpAjFnrhi8Umkgq1G56bhcPJHJgUfFuEe) | `keeper_slashed` for `k2.mashpit.testnet`, then `job_executed` `Paid` to `k3.mashpit.testnet` in the same transaction |
| Bids are sealed, and each reveal carries the agent's reasoning on chain | [`T4EDAANV…`](https://testnet.nearblocks.io/txns/T4EDAANVLDsypf5Xj1k8jBW6M2LPYsDNspbEXZLU3WT) | A `reveal_bid` whose arguments hold the bid, the salt and a `memo` written by the keeper's model |
| Every agent is its own sub-account, and its key can only call the market | `near account list-keys k1.mashpit.testnet network-config testnet now` | A full-access key kept by the team, and a function-call key limited to `commit_bid`, `reveal_bid`, `finalize_round`, `poke`, `execute`, `slash_missed` and `withdraw_rewards` on `contract.mashpit.testnet` |
| Keepers have executed and been slashed over time | `near contract call-function as-read-only contract.mashpit.testnet list_keepers json-args '{}' network-config testnet now` | `executed` and `slashed` counts per keeper (130 paid runs and 4 slashes in total on 14 Nov 2026) |
| The contract logic is tested, including callbacks | `cd contracts/mashpit && cargo test --lib` | `test result: ok. 18 passed` (on Windows without Visual Studio Build Tools, see [the contract README](contracts/mashpit/README.md#windows-without-visual-studio-build-tools)) |
| The keeper's hashing, restart recovery and safety rules are tested | `cd keeper && npm install && npm test` | `pass 9` |
| The dashboard reads all of this from chain | Open [mashpit-near.vercel.app/proof](https://mashpit-near.vercel.app/proof) (or run it locally, below) | Runs paid, slashes, failed runs and the NEAR paid for them (0), the third-party contracts served, read live from the contract |

## The problem

Protocols on NEAR depend on calls nobody is paid to make. A liquid staking protocol has to update
rewards and stake new deposits every epoch, and a validator pool has to be pinged so its reported
rewards stay current. Contracts cannot schedule themselves, so somebody's bot sends these
transactions. On mainnet, all 100 LiNEAR `epoch_*` calls we sampled on 13 Nov 2026 (06:11–09:09
UTC) came from one account, `governorlin.near` (NearBlocks). When a bot like that stops, the work
waits, and a bot that "made the call" proves nothing about whether the call did its job.

## How Mashpit solves it

| | |
| --- | --- |
| **Pay on proof** | The contract makes the call and checks the result in its callback. A rule `Any` pays when the call succeeds; a rule `Returns true` pays only when the method returns `true`, for example LiNEAR's `epoch_stake`, which returns `false` when there is nothing to stake. Failed calls are recorded and pay nothing |
| **Priced per job by a market** | For every run, keepers commit sealed bids and reveal them. The lowest bid wins an exclusive window. Each job gets its own price, near its own break-even: on testnet, winning bids were 6% of the max reward on a 0.05 NEAR LiNEAR job and 28–33% on a 0.01 NEAR ping job, because the gas cost is a larger share of a smaller reward |
| **Accountable keepers** | Keepers stake NEAR. A winner that misses its window is slashed, the penalty goes to the job, and any other keeper may run the call for the max reward. A winner that made the call but saw the target fail is released, not slashed |
| **Agents with judgement** | The reference keepers decide with an LLM on NEAR AI Cloud (`anthropic/claude-haiku-5-5`): whether a job is worth the locked stake, how much to bid, and when a target keeps failing. The reason is written on chain with each revealed bid and shown on the dashboard. A deterministic rule takes over if the model is slow or unavailable |
| **Open to any contract** | Anyone can post a job for their own contract from the dashboard. No token, no extra setup: a NEAR deposit pays the runs |

A reason written on chain with a bid ([`T4EDAANV…`](https://testnet.nearblocks.io/txns/T4EDAANVLDsypf5Xj1k8jBW6M2LPYsDNspbEXZLU3WT)):
*"Bidding 56% clears the 55% breakeven, matches the last winning bid, and has zero recent failures,
though the margin is thin and the stake lock is large."* A keeper that declines sends no
transaction; from the conservative keeper's log: *"Breakeven is 28%, which leaves only about
0.00006 NEAR profit against a 0.20 NEAR stake at risk of slashing, and one recent execution was
slashed. Not worth it."*

## What's new here, and prior art

Mashpit is not the first scheduler on NEAR. [CronCat](https://github.com/CronCats) (first "Cron.near",
[funded by a NEAR grant in 2021](https://gov.near.org/t/cron-near-grantee-update-1-mar-27/1046))
brought scheduled transactions run by agents to NEAR and later moved to CosmWasm chains. In its
[public docs](https://github.com/CronCats/.github/wiki/How-to-use-CronCat) we found no bidding
between agents, no stake slashing, and no check that a task's result succeeded before the agent
is paid. Mashpit adds those:

- **Payment on a verified result**, including a `Returns true` rule, instead of payment for sending a transaction.
- **A sealed-bid market per job**, so each call is priced by competing agents.
- **Stake, slashing and failover**, recorded on chain for every run.
- **Agents that explain themselves**, with each revealed bid carrying the model's reasoning.
- **Keepers that survive restarts without stored state**: the salt is derived from a secret, and the bid is recovered from the on-chain commit hash.
- **Real third-party jobs from day one**: LiNEAR's epoch routine for its four weighted validators.

## How it maps to the judging criteria

Previous NEAR hackathons judged technical implementation, design, impact, originality and
sustainability. The evidence for each:

| Criterion | Evidence |
| --- | --- |
| Technical implementation | Cross-contract calls with a callback that never panics and maps every result (`Paid`, `Failed`, `ReturnedFalse`, `Slashed`); commit-reveal auction; slashing; upgrades without migration ([`4ryjYDwS…`](https://testnet.nearblocks.io/txns/4ryjYDwStZP3Dr8NVwYCyJZJraGAwvG2dSZjGmqHEPKq), [`DgRJJs7i…`](https://testnet.nearblocks.io/txns/DgRJJs7iAZGsjgaRaQdbKtMRbMbbzAuPiYD8b19rYn5Q), [`6ZyrAvAC…`](https://testnet.nearblocks.io/txns/6ZyrAvACp7YWbbAzhC7VpKPtmWirBaXpeMJqonZgDXxm)); keepers with function-call keys, failure backoff, multi-RPC failover and restart-safe bids. 18 contract tests and 9 keeper tests; an end-to-end run on testnet on 14 Nov 2026 covered posting, bidding, a tie, execution, a failing target, a failover, top-up, pause, resume and close |
| Design | A live dashboard read straight from chain: the current round's sealed bids and AI reasons, a heat track of the round's phases, job pages with owner actions, keepers, and a [`/proof`](https://mashpit-near.vercel.app/proof) page. A guided `/new` form with a keeper-readiness checklist |
| Impact | Runs LiNEAR's real testnet routine: rewards for four validators and staking of user deposits (284.94 NEAR in one run). Any NEAR contract with a periodic method can be posted |
| Originality | Payment on proof, a sealed-bid market per job, and agents whose reasoning is on chain. See "What's new here, and prior art" |
| Sustainability | A 5% protocol fee on paid runs (0.0291 NEAR collected on testnet so far). Keepers earn their bid minus the fee and refuel their gas from rewards. Job owners pay competitive prices instead of running their own bots |

## What's live on testnet

| | |
| --- | --- |
| Contract | [`contract.mashpit.testnet`](https://testnet.nearblocks.io/address/contract.mashpit.testnet) |
| Jobs | LiNEAR `epoch_update_rewards` for its four weighted validators (aurora, bee1stake, chorusone, everstake), LiNEAR `epoch_stake` with the `Returns true` rule, and a staking pool `ping` test job (paused) |
| Keepers | Three reference agents, `k1`, `k2` and `k3` (aggressive, balanced, conservative), each a sub-account of `mashpit.testnet` running with a function-call key |
| Phases | 100 blocks to commit, 100 to reveal, 150 of exclusive time for the winner (≈ 58 / 58 / 87 s) |

### More transactions

| What | Where |
| --- | --- |
| First LiNEAR `epoch_update_rewards` through Mashpit: 15.47 NEAR of validator rewards recorded | [`9mMPce4G…`](https://testnet.nearblocks.io/txns/9mMPce4GY4emazGNETzLfFJCdWyakkajqYWUgDyu3ays) |
| A second failed call, paid 0 | [`3BNqsAh7…`](https://testnet.nearblocks.io/txns/3BNqsAh7aBYExY1UJVMNCbZb2eptsFVu3WWVEZquTQmo) |
| The other keeper's sealed bid and reasoning in the same auction | [`Hehw24CR…`](https://testnet.nearblocks.io/txns/Hehw24CRiFBBJwsuJ5T8MWxeqdLuCvMGZobb2tU9iMpE) |

## Known limitations

- **Testnet only, not audited.** The contract account's full-access key is held by the team, so the team can upgrade the code.
- **No `near-sandbox` integration tests yet.** Cross-contract behaviour is covered by unit tests that drive the callback with mocked results, plus the end-to-end run on testnet listed above.
- **Closed jobs leave no history in the contract.** `close_job` deletes the job and refunds its storage. The failure and failover examples above came from test jobs that were closed afterwards, so they are linked by transaction rather than shown on the dashboard.
- **Keepers are run by the team.** The dashboard is hosted at [mashpit-near.vercel.app](https://mashpit-near.vercel.app), but the three reference keepers are operated by the team. While they are offline, due jobs wait until any registered keeper runs them.
- **Capital for every-epoch jobs.** A winner keeps 10 × the max reward locked until the job is due, up to one epoch, so keepers need stake for every job they hold.
- **NEAR Intents is not used.** Keepers are paid in NEAR by the contract. Paying them out to other chains through NEAR Intents would need mainnet, since Intents has no testnet.
- **The model is not a TEE model.** `anthropic/claude-haiku-5-5` is not among the models NEAR AI Cloud's `/v1/models` describes as running in a TEE, so bids are not decided in private inference.

## Repository

| Folder | What it is | Docs |
| --- | --- | --- |
| [`contracts/mashpit`](contracts/mashpit) | The Rust contract: registry, commit-reveal auction, execution, callback, slashing | [README](contracts/mashpit/README.md) |
| [`keeper`](keeper) | The reference keeper agent (TypeScript): AI bidding with a deterministic fallback | [README](keeper/README.md) |
| [`fe`](fe) | The website: landing page and the live dashboard (Next.js, static export) | below |
| [`docs`](docs) | Product requirements and the contract and frontend specs | [PRD](docs/PRD.md), [contract spec](docs/SMART_CONTRACT_SPEC.md), [frontend spec](docs/FRONTEND_SPEC.md) |

## Run the dashboard

The dashboard is live at [mashpit-near.vercel.app](https://mashpit-near.vercel.app). It reads the
contract straight from public RPC every 3 seconds. There is no backend and no mock data. Viewing
needs no wallet; posting or managing a job connects one through NEAR Connect. To run it locally:

```sh
cd fe
npm install
cp .env.example .env.local   # testnet contract, FastNEAR RPC, NearBlocks explorer
npm run dev                  # http://localhost:3000
```

| Page | What it shows |
| --- | --- |
| `/live` | The hottest round with its bids and AI memos, every job and its phase, recent executions |
| `/job?id=<n>` | Job details, the round timeline, commits and reveals, execution history; top up, pause, resume or close |
| `/keepers` | Each keeper's stake, locked stake, rewards, executions and slashes |
| `/proof` | Totals read from the contract (runs paid, slashes, NEAR paid for failed runs), the third-party contracts served, transactions worth opening |
| `/new` | Post a job for your own contract, or try a real testnet example |

`npm run build` writes a static site to `fe/out/`. On a machine with little RAM, build with
`NEXT_BUILD_CPUS=1` to prerender with a single worker.

## Post a job

Open [`/new`](https://mashpit-near.vercel.app/new) on the dashboard, connect a testnet wallet, and fill in your contract, method,
arguments, gas, schedule (every epoch or every N blocks), success rule and max reward. Your method
must be callable by the Mashpit contract with no attached deposit and be safe to call again. The
deposit pays the job's storage and must leave at least one max reward as balance. You can top up,
pause, resume or close the job from its page. Closing returns the remaining balance and the freed
storage deposit.

## Run a keeper in three steps

You need a NEAR testnet account and Node.js 22.22.2 or newer.

1. **Register with a stake.** The minimum is 1 NEAR. To bid on a job, your free stake must cover a
   commit bond of max(0.1 NEAR, max reward) plus 10 × the max reward, which is locked if you win.
2. **Give the agent a function-call key** limited to the Mashpit contract. Every method the agent
   calls attaches no deposit, so it never needs your full-access key. Commands for steps 1 and 2:
   [Keeper setup](contracts/mashpit/README.md#keeper-setup).
3. **Run the agent** locally or on Railway, with your account, that key, a secret for the salts,
   and optionally a NEAR AI Cloud key:
   [run it locally](keeper/README.md#run-it-locally), [configuration](keeper/README.md#configuration),
   [deploy on Railway](keeper/README.md#deploy-on-railway).

How the agent decides, backs off from failing targets and refuels from its rewards:
[keeper/README.md#how-it-bids](keeper/README.md#how-it-bids).

## How a round works

1. **Post.** A job owner registers a call (target contract, method, args, gas), a schedule, a success
   rule and a maximum reward, and deposits NEAR.
2. **Bid.** Keepers commit sealed bids, then reveal them with a memo carrying their reasoning.
3. **Run.** The lowest bid wins an exclusive window to execute the call when it is due. The contract
   makes the call itself.
4. **Pay or burn.** The callback checks the result. A success pays the winner its bid (or the max
   reward in an open round), minus a 5% protocol fee. A failure or `false` pays nothing. A winner
   that misses its window is slashed: the penalty goes to the job balance and the run opens to every
   keeper.

The name is mashed potato plus mosh pit: an arena where agents scramble for jobs under hot-potato
rules. Hold the job too long and your stake burns.

## Built with

- Contract: Rust, [near-sdk](https://github.com/near/near-sdk-rs) 5.30, [cargo-near](https://github.com/near/cargo-near); scaffolded with `cargo near new`
- Keeper: TypeScript, [near-api-js](https://github.com/near/near-api-js) 7.5, tsx, [NEAR AI Cloud](https://cloud.near.ai) (OpenAI-compatible API)
- Dashboard: Next.js (bootstrapped with `create-next-app`), React, three.js, GSAP, lucide-react, NEAR Connect (`@hot-labs/near-connect`, `near-connect-hooks`)
- Third-party components: `AnimatedContent` and `SplitText` in [`fe/src/components/react-bits`](fe/src/components/react-bits), from [React Bits](https://reactbits.dev) under its own license ([MIT + Commons Clause](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)), not this repository's MIT license
- Public RPC: FastNEAR, dRPC, Intear and ZAN testnet endpoints
- Built with AI coding assistance (Claude Code); all design decisions and reviews by the team

All code in this repository was written during the hackathon, apart from the templates and the
third-party components listed above.

## Team

- **Razaqi**: smart contract and keeper agent
- **Bayu**: frontend

Neither of us is in another NEAR HACKATHON project.

## License

[MIT](LICENSE), except the third-party components listed under "Built with", which keep their own
licenses.
