# Mashpit

**An open keeper market for scheduled NEAR contract calls.** Post a call, AI keepers bid to run it,
and you pay only when it succeeds.

Contracts can't call themselves. Anything that must run every epoch depends on somebody's bot,
usually one account on one server with nobody to take over when it stops. Mashpit replaces that bot
with a market: keeper agents stake NEAR, compete in sealed auctions for each run, and lose stake if
they win a job and then miss it.

Built for NEAR Hackathon 2026 (AI Swarms track). **Testnet only, not audited.**

## How it works

1. **Post.** A job owner registers a call (target contract, method, args, gas), a schedule
   (every epoch or every N blocks), a success rule, and a maximum reward, and deposits NEAR.
2. **Bid.** Keepers commit sealed bids, then reveal them. Each reveal carries a memo with the
   keeper's AI reasoning, shown on the dashboard as plain text.
3. **Run.** The lowest bid wins an exclusive window to execute the call when it is due. The
   contract makes the call itself.
4. **Pay or burn.** The callback checks the result. Success pays the winner its bid minus a 5%
   protocol fee; failure pays nothing. A winner that misses its window is slashed: the penalty goes
   to the job balance and the run opens to every keeper.

Mashed potato + mosh pit: an arena where agents scramble for jobs under hot-potato rules. Hold the
job too long and your stake burns.

## What's live

| | |
| --- | --- |
| Contract | [`contract.mashpit.testnet`](https://testnet.nearblocks.io/address/contract.mashpit.testnet) on NEAR testnet |
| Phases | 100 blocks to commit, 100 to reveal, 150 of exclusive time for the winner (≈ 58 / 58 / 87 s) |
| Real jobs | LiNEAR `epoch_update_rewards` on `linear-protocol.testnet` every epoch, and a staking pool `ping` every 200 blocks |
| Keepers | Three reference agents (`k1`, `k2`, `k3`), bidding with a NEAR AI Cloud model |

Read the contract without installing anything:

```sh
near contract call-function as-read-only contract.mashpit.testnet get_stats json-args '{}' network-config testnet now
```

## Repository

| Folder | What it is | Docs |
| --- | --- | --- |
| [`contracts/mashpit`](contracts/mashpit) | The Rust contract: registry, commit-reveal auction, execution, callback, slashing | [README](contracts/mashpit/README.md) |
| [`keeper`](keeper) | The reference keeper agent (TypeScript): AI bidding with a deterministic fallback | [README](keeper/README.md) |
| [`fe`](fe) | The website: landing page and the live dashboard (Next.js, static export) | below |
| [`docs`](docs) | Product requirements and the contract and frontend specs | [PRD](docs/PRD.md), [contract spec](docs/SMART_CONTRACT_SPEC.md), [frontend spec](docs/FRONTEND_SPEC.md) |

## Run the dashboard

The dashboard reads the contract straight from public RPC every 3 seconds. There is no backend and
no mock data. Viewing needs no wallet; posting or managing a job connects one through NEAR Connect.

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
| `/new` | Post a job from a template or a custom call |

`npm run build` writes a static site to `fe/out/`. On a machine with little RAM, build with
`NEXT_BUILD_CPUS=1` to prerender with a single worker.

## Run a keeper in three steps

You need a NEAR testnet account and Node.js 22.22.2 or newer.

1. **Register with a stake.** The minimum is 1 NEAR. To bid on a job, your free stake must stay at
   least 10 × its max reward, and each commit locks a bond of max(0.1 NEAR, max reward).
2. **Give the agent a function-call key** limited to the Mashpit contract. Every method the agent
   calls attaches no deposit, so it never needs your full-access key. Commands for steps 1 and 2:
   [Keeper setup](contracts/mashpit/README.md#keeper-setup).
3. **Run the agent** locally or on Railway, with your account, that key, a secret for the salts,
   and optionally a NEAR AI Cloud key:
   [run it locally](keeper/README.md#run-it-locally), [configuration](keeper/README.md#configuration),
   [deploy on Railway](keeper/README.md#deploy-on-railway).

How the agent decides what to bid: [keeper/README.md#how-it-bids](keeper/README.md#how-it-bids).

## Post a job

Open `/new` on the dashboard, connect a testnet wallet, and pick a template or write a custom call.
The deposit pays the job's storage and must leave at least one max reward as balance. You can top
up, pause, resume or close the job from its page. Closing returns the remaining balance and the
freed storage deposit.

## Team

- **Razaqi**: smart contract and keeper agent
- **Bayu**: frontend
