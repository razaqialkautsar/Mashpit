# mashpit contract

The on-chain part of Mashpit: an open keeper market for scheduled NEAR contract calls.

A job owner registers a call (target contract, method, args, gas) with a schedule and a maximum
reward. Keeper agents bid for the right to run the next execution in a sealed commit-reveal
auction. The lowest bid wins an exclusive window. The contract makes the call itself and pays the
keeper only if the callback shows the call succeeded. A winner that misses its window is slashed
and the run opens to every keeper.

Full specification: [`docs/SMART_CONTRACT_SPEC.md`](../../docs/SMART_CONTRACT_SPEC.md).
Product context: [`docs/PRD.md`](../../docs/PRD.md).

Status: unit-tested, **not deployed yet**.

## Layout

| File | Contents |
| --- | --- |
| `src/lib.rs` | Contract state, init, owner config, round helpers (due/phase, finalize, slash, history) |
| `src/types.rs` | Jobs, rounds, keepers, execution records, view types |
| `src/keeper.rs` | Keeper registration, stake and rewards |
| `src/job.rs` | Job registration, top-up, pause/resume, close |
| `src/auction.rs` | Commit-reveal auction |
| `src/execute.rs` | Execution, callback, slashing |
| `src/views.rs` | Read-only methods |
| `src/events.rs` | NEP-297 events (`standard: "mashpit"`) |
| `src/errors.rs` | Error format `Mashpit: <Code>: <detail>` |
| `src/tests.rs` | Unit tests |

## Build and test

Requirements: Rust (the toolchain is pinned in `rust-toolchain.toml`), [cargo-near](https://github.com/near/cargo-near).

```sh
cargo test --lib                                        # unit tests
cargo near build non-reproducible-wasm                  # -> target/near/mashpit.wasm
```

### Windows without Visual Studio Build Tools

These are the settings we use on Windows with the GNU toolchain:

```sh
rustup toolchain install 1.95.0-x86_64-pc-windows-gnu
rustup target add --toolchain 1.95.0-x86_64-pc-windows-gnu wasm32-unknown-unknown
rustup override set 1.95.0-x86_64-pc-windows-gnu        # run inside contracts/mashpit

# aws-lc-sys (pulled in by near-sdk's unit-testing feature) needs NASM on Windows;
# this makes it use the prebuilt NASM objects shipped with the crate instead.
AWS_LC_SYS_PREBUILT_NASM=1 cargo test --lib

# ABI generation fails to link with the GNU linker on Windows; the ABI is optional.
AWS_LC_SYS_PREBUILT_NASM=1 cargo near build non-reproducible-wasm --no-abi
```

## Deploy to testnet

Commands use [near-cli-rs](https://github.com/near/near-cli-rs) 0.31 and keys stored in the legacy
keychain (`~/.near-credentials`). Replace the account names with yours.

```sh
# 1. Sub-account for the contract (funded by the parent account)
near account create-account fund-myself contract.mashpit.testnet '5 NEAR' \
  autogenerate-new-keypair save-to-legacy-keychain \
  sign-as mashpit.testnet network-config testnet sign-with-legacy-keychain send

# 2. Deploy and initialize (config: null uses the defaults below)
near contract deploy contract.mashpit.testnet use-file ./target/near/mashpit.wasm \
  with-init-call new json-args '{"owner_id":"mashpit.testnet","treasury_id":"mashpit.testnet","config":null}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-legacy-keychain send
```

The contract code is about 258 KB. At 1E19 yoctoNEAR per byte
([storage staking](https://docs.near.org/protocol/storage/storage-staking)) the code alone locks
about 2.6 NEAR on the contract account, so fund it with more than that.

## Keeper setup

A keeper registers once with its full-access key, then gives its agent a **function-call key**
limited to the contract. Function-call keys cannot attach NEAR
([access keys](https://docs.near.org/protocol/accounts-contracts/access-keys)), which is why every
method an agent calls needs no deposit (commit bonds are locked from stake).

```sh
# Register with a stake (full-access key, run locally)
near contract call-function as-transaction contract.mashpit.testnet register_keeper empty-args \
  prepaid-gas '30 Tgas' attached-deposit '2 NEAR' \
  sign-as k1.mashpit.testnet network-config testnet sign-with-legacy-keychain send

# Function-call key for the agent (this is the key the agent runs with)
near account add-key k1.mashpit.testnet grant-function-call-access \
  --allowance '1 NEAR' --contract-account-id contract.mashpit.testnet \
  --function-names 'commit_bid, reveal_bid, finalize_round, poke, execute, slash_missed, withdraw_rewards' \
  autogenerate-new-keypair save-to-legacy-keychain \
  network-config testnet sign-with-legacy-keychain send
```

An allowance cannot be changed later and an account whose only keys ran out of allowance cannot
sign; pick a generous value.

## Methods

**Payable** methods need an attached deposit and therefore a full-access key. **FC** marks methods a
keeper agent can call with a function-call key.

### Owner

| Method | Notes |
| --- | --- |
| `new(owner_id, treasury_id, config?)` | Init. `config` is a partial `ConfigPatch` |
| `set_config(patch)` | Owner only |
| `withdraw_fees()` | Owner only; sends accrued fees to the treasury |

### Keepers

| Method | Key | Notes |
| --- | --- | --- |
| `register_keeper()` | payable | Stake = attached deposit, at least `min_keeper_stake` |
| `add_stake()` | payable | |
| `withdraw_stake(amount)` | full access | Free (unlocked) stake only |
| `withdraw_rewards()` | FC | |
| `unregister_keeper()` | full access | Requires no locked stake |

### Jobs

| Method | Key | Notes |
| --- | --- | --- |
| `register_job(input)` | payable | Deposit pays the job's storage; the rest is the job balance (must cover one `max_reward`) |
| `top_up(job_id)` | payable | Anyone |
| `pause_job(job_id)` / `resume_job(job_id)` | | Job owner |
| `close_job(job_id)` | | Job owner; removes the job and refunds balance + freed storage |

`JobInput`:

```json
{
  "target": "linear-protocol.testnet",
  "method": "epoch_update_rewards",
  "args": "<base64 of {\"validator_id\":\"aurora.pool.f863973.m0\"}>",
  "gas_tgas": 150,
  "schedule": "EveryEpoch",
  "success_rule": "Any",
  "max_reward": "50000000000000000000000"
}
```

`schedule` is `"EveryEpoch"` or `{"EveryBlocks":{"interval":N}}`; `success_rule` is `"Any"` or
`"ReturnsTrue"` (the call must return JSON `true`).

### Auction and execution

| Method | Key | Notes |
| --- | --- | --- |
| `commit_bid(job_id, hash)` | FC | Commit phase. Locks `max(min_commit_bond, max_reward)` from free stake; free stake must also cover `stake_multiplier × max_reward` |
| `reveal_bid(job_id, bid, salt, memo?)` | FC | Reveal phase. Releases the bond. `memo` (≤ 280 bytes) is shown on the dashboard |
| `finalize_round(job_id)` | FC | After the reveal phase; unrevealed bonds go to the job balance |
| `poke(job_id)` | FC | Records that an `EveryEpoch` job is due, which starts the winner's window |
| `execute(job_id)` | FC | Winner only during its window; any keeper after it or when there is no winner |
| `slash_missed(job_id)` | FC | Anyone, after a missed window |
| `on_executed(job_id, round_id)` | private | Callback; never panics |

Commit hash: `sha256(utf8("{bid_yocto}:{salt}:{keeper_account_id}"))`, base64-encoded in the call.

Winner: lowest bid, then earliest commit block, then the smaller account id. No randomness is used.

### Views

`get_config`, `get_stats`, `get_job(job_id)`, `list_jobs(from_index?, limit?)`,
`get_round(job_id)`, `get_history(job_id)`, `get_keeper(account_id)`,
`list_keepers(from_index?, limit?)`.

`get_job` includes the computed `phase` (`Commit`, `Reveal`, `AwaitingFinalize`, `Awarded`,
`Exclusive`, `Open`, `InFlight`, `Paused`, `Closed`), `is_due`, `due_block`, `exclusive_until`,
and the current block and epoch.

## Default config

| Parameter | Default |
| --- | --- |
| `protocol_fee_bps` | 500 (5% of the keeper reward) |
| `min_keeper_stake` | 1 NEAR |
| `stake_multiplier` | 10 |
| `min_commit_bond` | 0.1 NEAR |
| `commit_blocks` / `reveal_blocks` / `grace_blocks` | 50 / 50 / 50 |
| `max_commits_per_round` | 10 |
| `max_history` | 20 |
| `max_memo_bytes` | 280 |
| `callback_gas_tgas` / `overhead_gas_tgas` / `max_total_gas_tgas` | 20 / 15 / 300 |

## Events

NEP-297 logs (`EVENT_JSON:`) with `standard: "mashpit"`, `version: "1.0.0"`:
`keeper_registered`, `job_registered`, `bid_committed`, `bid_revealed`, `round_finalized`,
`job_executed`, `keeper_slashed`.
