//! Commit-reveal auction for the right to execute the next run of a job.
//! See docs/SMART_CONTRACT_SPEC.md §4.4 and §5.2.
//!
//! Commit hash: `sha256(utf8("{bid_yocto}:{salt}:{keeper_account_id}"))`.
//! The bond is locked from the keeper's free stake (no attached deposit), so keepers can call
//! these methods with a function-call key.

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{env, near};

use crate::MashpitExt;
use crate::errors::{ensure, fail};
use crate::events::MashpitEvent;
use crate::{Commit, JobId, JobStatus, Mashpit, Reveal};

/// Compute the commit hash a keeper must submit. Exposed for keeper agents and tests.
pub fn commit_hash(bid: u128, salt: &str, keeper: &str) -> [u8; 32] {
    let digest = env::sha256(format!("{bid}:{salt}:{keeper}").as_bytes());
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    out
}

#[near]
impl Mashpit {
    /// Commit a sealed bid during the commit phase.
    pub fn commit_bid(&mut self, job_id: JobId, hash: Base64VecU8) {
        let account = env::predecessor_account_id();
        let mut keeper = self.load_keeper(&account);
        let mut job = self.load_job(job_id);
        let block = env::block_height();

        ensure(job.status == JobStatus::Active, "JobNotActive", "job is not active");
        ensure(
            block < job.round.commit_end,
            "WrongPhase",
            &format!("commit phase ended at block {}", job.round.commit_end),
        );
        ensure(
            !job.round.commits.iter().any(|c| c.keeper == account),
            "AlreadyCommitted",
            "this keeper already committed in this round",
        );
        ensure(
            job.round.commits.len() < self.config.max_commits_per_round as usize,
            "TooManyCommits",
            "round is full",
        );
        ensure(hash.0.len() == 32, "InvalidHash", "hash must be 32 bytes");

        let bond = self.commit_bond(&job);
        let lock = self.winner_lock(&job);
        ensure(
            keeper.free_stake() >= bond.saturating_add(lock),
            "InsufficientFreeStake",
            &format!("need free stake >= {} (bond {} + lock {})", bond + lock, bond, lock),
        );
        keeper.locked = U128(keeper.locked.0 + bond);
        self.save_keeper(&account, keeper);

        let mut h = [0u8; 32];
        h.copy_from_slice(&hash.0);
        job.round.commits.push(Commit {
            keeper: account.clone(),
            hash: h,
            bond,
            block,
            revealed: false,
        });
        let round_id = job.round.round_id;
        self.save_job(job);
        MashpitEvent::BidCommitted { job_id, round_id, keeper: account, block }.emit();
    }

    /// Reveal a committed bid during the reveal phase. Releases the bond.
    /// `memo` is a short free-text reason (e.g. the AI keeper's rationale), shown on the dashboard.
    pub fn reveal_bid(&mut self, job_id: JobId, bid: U128, salt: String, memo: Option<String>) {
        let account = env::predecessor_account_id();
        let mut job = self.load_job(job_id);
        let block = env::block_height();

        ensure(
            block >= job.round.commit_end && block < job.round.reveal_end,
            "WrongPhase",
            &format!(
                "reveal phase is blocks {}..{}",
                job.round.commit_end, job.round.reveal_end
            ),
        );
        if let Some(m) = &memo {
            ensure(
                m.len() <= self.config.max_memo_bytes as usize,
                "MemoTooLong",
                &format!("memo must be <= {} bytes", self.config.max_memo_bytes),
            );
        }
        ensure(bid.0 <= job.max_reward, "BidAboveMax", "bid is above max_reward");

        let idx = match job.round.commits.iter().position(|c| c.keeper == account) {
            Some(i) => i,
            None => fail("NoCommit", "no commit from this keeper in this round"),
        };
        ensure(!job.round.commits[idx].revealed, "AlreadyRevealed", "bid already revealed");
        ensure(
            commit_hash(bid.0, &salt, account.as_str()) == job.round.commits[idx].hash,
            "HashMismatch",
            "bid, salt and account do not match the commit",
        );

        job.round.commits[idx].revealed = true;
        let bond = job.round.commits[idx].bond;
        let commit_block = job.round.commits[idx].block;
        let mut keeper = self.load_keeper(&account);
        keeper.locked = U128(keeper.locked.0.saturating_sub(bond));
        self.save_keeper(&account, keeper);

        job.round.reveals.push(Reveal {
            keeper: account.clone(),
            bid,
            commit_block,
            memo: memo.clone(),
        });
        let round_id = job.round.round_id;
        self.save_job(job);
        MashpitEvent::BidRevealed { job_id, round_id, keeper: account, bid, memo }.emit();
    }

    /// Decide the winner after the reveal phase. Anyone can call it; `execute` and `poke` also
    /// call it automatically.
    pub fn finalize_round(&mut self, job_id: JobId) {
        let mut job = self.load_job(job_id);
        ensure(
            env::block_height() >= job.round.reveal_end,
            "WrongPhase",
            &format!("reveal phase ends at block {}", job.round.reveal_end),
        );
        ensure(!job.round.finalized, "AlreadyFinalized", "round already finalized");
        self.finalize_round_internal(&mut job);
        self.save_job(job);
    }
}
