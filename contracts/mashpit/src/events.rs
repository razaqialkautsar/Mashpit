//! NEP-297 events (`EVENT_JSON:` logs). See docs/SMART_CONTRACT_SPEC.md §7.

use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};

use crate::types::{JobId, Outcome, Schedule};

#[near(event_json(standard = "mashpit"))]
pub enum MashpitEvent {
    #[event_version("1.0.0")]
    KeeperRegistered { keeper: AccountId, stake: U128 },

    #[event_version("1.0.0")]
    JobRegistered {
        job_id: JobId,
        owner: AccountId,
        target: AccountId,
        method: String,
        schedule: Schedule,
        max_reward: U128,
    },

    #[event_version("1.0.0")]
    BidCommitted {
        job_id: JobId,
        round_id: u64,
        keeper: AccountId,
        block: u64,
    },

    #[event_version("1.0.0")]
    BidRevealed {
        job_id: JobId,
        round_id: u64,
        keeper: AccountId,
        bid: U128,
        memo: Option<String>,
    },

    #[event_version("1.0.0")]
    RoundFinalized {
        job_id: JobId,
        round_id: u64,
        winner: Option<AccountId>,
        bid: Option<U128>,
        open_mode: bool,
    },

    #[event_version("1.0.0")]
    JobExecuted {
        job_id: JobId,
        round_id: u64,
        executor: AccountId,
        outcome: Outcome,
        paid: U128,
        fee: U128,
    },

    #[event_version("1.0.0")]
    KeeperSlashed {
        job_id: JobId,
        round_id: u64,
        keeper: AccountId,
        amount: U128,
    },
}
