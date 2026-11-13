//! Data types shared by all modules. See docs/SMART_CONTRACT_SPEC.md §2.

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{AccountId, near};

pub type JobId = u64;

/// When a job becomes due.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub enum Schedule {
    /// Due when `env::epoch_height() > last_paid_epoch`.
    EveryEpoch,
    /// Due when `block_height >= last_exec_block (or created_at) + interval`.
    EveryBlocks { interval: u64 },
}

/// What counts as a successful execution.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub enum SuccessRule {
    /// The call to the target succeeded.
    Any,
    /// The call succeeded and returned the JSON value `true`.
    ReturnsTrue,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub enum JobStatus {
    Active,
    Paused,
    Closed,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    /// Rule satisfied, keeper paid.
    Paid,
    /// Call failed (target panicked or ran out of gas); not paid, round stays open.
    Failed,
    /// Call succeeded but returned something other than `true` under `ReturnsTrue`; not paid.
    ReturnedFalse,
    /// Winner missed its exclusive window and was slashed; round switched to open mode.
    Slashed,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Config {
    pub owner_id: AccountId,
    pub treasury_id: AccountId,
    pub protocol_fee_bps: u16,
    pub min_keeper_stake: U128,
    pub stake_multiplier: u8,
    pub min_commit_bond: U128,
    pub commit_blocks: u64,
    pub reveal_blocks: u64,
    pub grace_blocks: u64,
    pub max_commits_per_round: u8,
    pub max_history: u8,
    pub max_memo_bytes: u16,
    pub callback_gas_tgas: u64,
    pub overhead_gas_tgas: u64,
    pub max_total_gas_tgas: u64,
}

/// Optional overrides for `new` and `set_config`. `None` keeps the current/default value.
#[near(serializers = [json])]
#[derive(Clone, Debug, Default)]
pub struct ConfigPatch {
    pub treasury_id: Option<AccountId>,
    pub protocol_fee_bps: Option<u16>,
    pub min_keeper_stake: Option<U128>,
    pub stake_multiplier: Option<u8>,
    pub min_commit_bond: Option<U128>,
    pub commit_blocks: Option<u64>,
    pub reveal_blocks: Option<u64>,
    pub grace_blocks: Option<u64>,
    pub max_commits_per_round: Option<u8>,
    pub max_history: Option<u8>,
    pub max_memo_bytes: Option<u16>,
    pub callback_gas_tgas: Option<u64>,
    pub overhead_gas_tgas: Option<u64>,
    pub max_total_gas_tgas: Option<u64>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, Default)]
pub struct Keeper {
    pub stake: U128,
    /// Unrevealed commit bonds plus the lock for rounds this keeper won.
    pub locked: U128,
    /// Rewards that can be withdrawn.
    pub rewards: U128,
    pub executed: u64,
    pub slashed: u64,
    pub registered_at: u64,
}

impl Keeper {
    pub fn free_stake(&self) -> u128 {
        self.stake.0.saturating_sub(self.locked.0)
    }
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Commit {
    pub keeper: AccountId,
    pub hash: [u8; 32],
    pub bond: u128,
    pub block: u64,
    pub revealed: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Reveal {
    pub keeper: AccountId,
    pub bid: U128,
    pub commit_block: u64,
    pub memo: Option<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Winner {
    pub keeper: AccountId,
    pub bid: U128,
    /// Stake locked from the winner for this round.
    pub locked: U128,
    /// True once the lock was released or slashed.
    pub settled: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct InFlight {
    pub executor: AccountId,
    pub pay: U128,
    pub started_block: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Round {
    pub round_id: u64,
    pub opened_at: u64,
    pub commit_end: u64,
    pub reveal_end: u64,
    pub commits: Vec<Commit>,
    pub reveals: Vec<Reveal>,
    pub finalized: bool,
    pub winner: Option<Winner>,
    pub open_mode: bool,
    pub due_seen_block: Option<u64>,
    pub in_flight: Option<InFlight>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct ExecutionRecord {
    pub round_id: u64,
    pub executor: AccountId,
    pub paid: U128,
    pub outcome: Outcome,
    pub due_block: Option<u64>,
    pub exec_block: u64,
    pub epoch: u64,
    pub open_mode: bool,
    pub slashed_keeper: Option<AccountId>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Job {
    pub id: JobId,
    pub owner: AccountId,
    pub target: AccountId,
    pub method: String,
    pub args: Base64VecU8,
    pub gas_tgas: u64,
    pub schedule: Schedule,
    pub success_rule: SuccessRule,
    pub max_reward: u128,
    pub balance: u128,
    pub status: JobStatus,
    pub last_exec_block: Option<u64>,
    pub last_paid_epoch: Option<u64>,
    pub created_at: u64,
    pub round: Round,
    pub history: Vec<ExecutionRecord>,
}

/// Input for `register_job`.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct JobInput {
    pub target: AccountId,
    pub method: String,
    pub args: Base64VecU8,
    pub gas_tgas: u64,
    pub schedule: Schedule,
    pub success_rule: SuccessRule,
    pub max_reward: U128,
}

// ---------- Views ----------

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub enum Phase {
    Commit,
    Reveal,
    AwaitingFinalize,
    Awarded,
    Exclusive,
    Open,
    InFlight,
    Paused,
    Closed,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct CommitView {
    pub keeper: AccountId,
    /// The sealed commit hash (32 bytes, base64). Lets a keeper that restarted between commit
    /// and reveal recover its bid by checking candidate bids against its own hash off-chain.
    pub hash: Base64VecU8,
    pub block: u64,
    pub bond: U128,
    pub revealed: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct RoundView {
    pub round_id: u64,
    pub opened_at: u64,
    pub commit_end: u64,
    pub reveal_end: u64,
    pub commits: Vec<CommitView>,
    pub reveals: Vec<Reveal>,
    pub finalized: bool,
    pub winner: Option<Winner>,
    pub open_mode: bool,
    pub due_seen_block: Option<u64>,
    pub in_flight: Option<InFlight>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct JobView {
    pub id: JobId,
    pub owner: AccountId,
    pub target: AccountId,
    pub method: String,
    pub args: Base64VecU8,
    pub gas_tgas: u64,
    pub schedule: Schedule,
    pub success_rule: SuccessRule,
    pub max_reward: U128,
    pub balance: U128,
    pub status: JobStatus,
    pub last_exec_block: Option<u64>,
    pub last_paid_epoch: Option<u64>,
    pub created_at: u64,
    pub round: RoundView,
    pub phase: Phase,
    pub is_due: bool,
    pub due_block: Option<u64>,
    pub exclusive_until: Option<u64>,
    pub current_block: u64,
    pub current_epoch: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct JobSummary {
    pub id: JobId,
    pub owner: AccountId,
    pub target: AccountId,
    pub method: String,
    pub schedule: Schedule,
    pub max_reward: U128,
    pub balance: U128,
    pub status: JobStatus,
    pub phase: Phase,
    pub round_id: u64,
    pub winner: Option<AccountId>,
    pub last_outcome: Option<Outcome>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Stats {
    pub jobs: u64,
    pub keepers: u64,
    pub total_stake: U128,
    pub fees_accrued: U128,
    pub current_block: u64,
    pub current_epoch: u64,
}
