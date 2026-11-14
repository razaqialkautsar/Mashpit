//! Mashpit: an open keeper market on NEAR.
//!
//! AI keeper agents bid (commit-reveal) for the right to execute scheduled calls on other
//! contracts. Keepers are paid only when the callback proves the call succeeded; winners that
//! miss their window are slashed. Specification: docs/SMART_CONTRACT_SPEC.md.

use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{AccountId, NearToken, PanicOnDefault, Promise, env, near};

mod auction;
mod errors;
mod events;
mod execute;
mod job;
mod keeper;
pub mod types;
mod views;

pub use types::*;

use errors::{ensure, fail};
use events::MashpitEvent;

const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;

/// Maximum number of bytes read from a target's return value in the callback.
/// Enough to tell `true`, `false` and "no value" apart.
pub(crate) const MAX_RESULT_LEN: usize = 1024;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Mashpit {
    config: Config,
    keepers: LookupMap<AccountId, Keeper>,
    keeper_ids: IterableSet<AccountId>,
    jobs: IterableMap<JobId, Job>,
    next_job_id: JobId,
    fees_accrued: u128,
}

fn default_config(owner_id: AccountId, treasury_id: AccountId) -> Config {
    Config {
        owner_id,
        treasury_id,
        protocol_fee_bps: 500,
        min_keeper_stake: U128(ONE_NEAR),
        stake_multiplier: 10,
        min_commit_bond: U128(ONE_NEAR / 10),
        // ~58 s / ~58 s / ~87 s at the measured ~0.58 s testnet block time. 50-block windows
        // were too short in testnet runs when public RPCs rate-limited the keepers.
        commit_blocks: 100,
        reveal_blocks: 100,
        grace_blocks: 150,
        max_commits_per_round: 10,
        max_history: 20,
        max_memo_bytes: 280,
        callback_gas_tgas: 20,
        overhead_gas_tgas: 15,
        max_total_gas_tgas: 300,
    }
}

fn apply_patch(cfg: &mut Config, p: ConfigPatch) {
    if let Some(v) = p.treasury_id {
        cfg.treasury_id = v;
    }
    if let Some(v) = p.protocol_fee_bps {
        cfg.protocol_fee_bps = v;
    }
    if let Some(v) = p.min_keeper_stake {
        cfg.min_keeper_stake = v;
    }
    if let Some(v) = p.stake_multiplier {
        cfg.stake_multiplier = v;
    }
    if let Some(v) = p.min_commit_bond {
        cfg.min_commit_bond = v;
    }
    if let Some(v) = p.commit_blocks {
        cfg.commit_blocks = v;
    }
    if let Some(v) = p.reveal_blocks {
        cfg.reveal_blocks = v;
    }
    if let Some(v) = p.grace_blocks {
        cfg.grace_blocks = v;
    }
    if let Some(v) = p.max_commits_per_round {
        cfg.max_commits_per_round = v;
    }
    if let Some(v) = p.max_history {
        cfg.max_history = v;
    }
    if let Some(v) = p.max_memo_bytes {
        cfg.max_memo_bytes = v;
    }
    if let Some(v) = p.callback_gas_tgas {
        cfg.callback_gas_tgas = v;
    }
    if let Some(v) = p.overhead_gas_tgas {
        cfg.overhead_gas_tgas = v;
    }
    if let Some(v) = p.max_total_gas_tgas {
        cfg.max_total_gas_tgas = v;
    }
}

fn validate_config(cfg: &Config) {
    ensure(cfg.protocol_fee_bps <= 10_000, "InvalidConfig", "protocol_fee_bps > 10000");
    ensure(cfg.stake_multiplier >= 1, "InvalidConfig", "stake_multiplier must be >= 1");
    ensure(
        cfg.commit_blocks > 0 && cfg.reveal_blocks > 0 && cfg.grace_blocks > 0,
        "InvalidConfig",
        "phase lengths must be > 0",
    );
    ensure(cfg.max_commits_per_round >= 1, "InvalidConfig", "max_commits_per_round must be >= 1");
    ensure(cfg.max_history >= 1, "InvalidConfig", "max_history must be >= 1");
    ensure(
        cfg.callback_gas_tgas + cfg.overhead_gas_tgas < cfg.max_total_gas_tgas,
        "InvalidConfig",
        "callback + overhead gas must leave room for the job",
    );
}

#[near]
impl Mashpit {
    /// Initialize the contract. `config` overrides the defaults in SMART_CONTRACT_SPEC §3.
    #[init]
    pub fn new(owner_id: AccountId, treasury_id: AccountId, config: Option<ConfigPatch>) -> Self {
        let mut cfg = default_config(owner_id, treasury_id);
        if let Some(patch) = config {
            apply_patch(&mut cfg, patch);
        }
        validate_config(&cfg);
        Self {
            config: cfg,
            keepers: LookupMap::new(b"k"),
            keeper_ids: IterableSet::new(b"i"),
            jobs: IterableMap::new(b"j"),
            next_job_id: 0,
            fees_accrued: 0,
        }
    }

    /// Owner only. Applies to rounds opened after the change.
    pub fn set_config(&mut self, patch: ConfigPatch) {
        self.assert_owner();
        let mut cfg = self.config.clone();
        apply_patch(&mut cfg, patch);
        validate_config(&cfg);
        self.config = cfg;
    }

    /// Owner only. Sends accrued protocol fees to the treasury.
    pub fn withdraw_fees(&mut self) -> Promise {
        self.assert_owner();
        let amount = self.fees_accrued;
        ensure(amount > 0, "NothingToWithdraw", "no fees accrued");
        self.fees_accrued = 0;
        Promise::new(self.config.treasury_id.clone()).transfer(NearToken::from_yoctonear(amount))
    }
}

// ---------- Internal helpers (not exposed) ----------

impl Mashpit {
    pub(crate) fn assert_owner(&self) {
        ensure(
            env::predecessor_account_id() == self.config.owner_id,
            "NotOwner",
            "only the contract owner can call this method",
        );
    }

    pub(crate) fn load_job(&self, job_id: JobId) -> Job {
        match self.jobs.get(&job_id) {
            Some(j) => j.clone(),
            None => fail("JobNotFound", &format!("job {job_id}")),
        }
    }

    pub(crate) fn save_job(&mut self, job: Job) {
        self.jobs.insert(job.id, job);
    }

    pub(crate) fn load_keeper(&self, account: &AccountId) -> Keeper {
        match self.keepers.get(account) {
            Some(k) => k.clone(),
            None => fail("NotKeeper", &format!("{account} is not a registered keeper")),
        }
    }

    pub(crate) fn save_keeper(&mut self, account: &AccountId, keeper: Keeper) {
        self.keepers.insert(account.clone(), keeper);
    }

    pub(crate) fn new_round(&self, round_id: u64) -> Round {
        let opened_at = env::block_height();
        let commit_end = opened_at + self.config.commit_blocks;
        Round {
            round_id,
            opened_at,
            commit_end,
            reveal_end: commit_end + self.config.reveal_blocks,
            commits: Vec::new(),
            reveals: Vec::new(),
            finalized: false,
            winner: None,
            open_mode: false,
            due_seen_block: None,
            in_flight: None,
        }
    }

    /// Lock required from the winner of a round.
    pub(crate) fn winner_lock(&self, job: &Job) -> u128 {
        job.max_reward.saturating_mul(self.config.stake_multiplier as u128)
    }

    /// Bond locked from stake when committing.
    pub(crate) fn commit_bond(&self, job: &Job) -> u128 {
        job.max_reward.max(self.config.min_commit_bond.0)
    }

    /// Decide the round winner. Unrevealed bonds are forfeited to the job balance.
    /// Never panics.
    pub(crate) fn finalize_round_internal(&mut self, job: &mut Job) {
        if job.round.finalized {
            return;
        }
        // Forfeit unrevealed bonds.
        let unrevealed: Vec<(AccountId, u128)> = job
            .round
            .commits
            .iter()
            .filter(|c| !c.revealed)
            .map(|c| (c.keeper.clone(), c.bond))
            .collect();
        for (account, bond) in unrevealed {
            if let Some(mut k) = self.keepers.get(&account).cloned() {
                let taken = bond.min(k.stake.0);
                k.stake = U128(k.stake.0 - taken);
                k.locked = U128(k.locked.0.saturating_sub(bond));
                self.save_keeper(&account, k);
                job.balance = job.balance.saturating_add(taken);
            }
        }

        // Pick the winner among reveals whose keeper can still cover the lock.
        let lock = self.winner_lock(job);
        let mut candidates: Vec<Reveal> = job
            .round
            .reveals
            .iter()
            .filter(|r| {
                self.keepers
                    .get(&r.keeper)
                    .map(|k| k.free_stake() >= lock)
                    .unwrap_or(false)
            })
            .cloned()
            .collect();
        candidates.sort_by(|a, b| {
            a.bid
                .0
                .cmp(&b.bid.0)
                .then(a.commit_block.cmp(&b.commit_block))
                .then(a.keeper.as_str().cmp(b.keeper.as_str()))
        });

        match candidates.first() {
            Some(best) => {
                if let Some(mut k) = self.keepers.get(&best.keeper).cloned() {
                    k.locked = U128(k.locked.0.saturating_add(lock));
                    self.save_keeper(&best.keeper, k);
                }
                job.round.winner = Some(Winner {
                    keeper: best.keeper.clone(),
                    bid: best.bid,
                    locked: U128(lock),
                    settled: false,
                });
            }
            None => job.round.open_mode = true,
        }
        job.round.finalized = true;

        MashpitEvent::RoundFinalized {
            job_id: job.id,
            round_id: job.round.round_id,
            winner: job.round.winner.as_ref().map(|w| w.keeper.clone()),
            bid: job.round.winner.as_ref().map(|w| w.bid),
            open_mode: job.round.open_mode,
        }
        .emit();
    }

    /// Release the winner's stake lock without penalty. Never panics.
    pub(crate) fn release_winner_lock(&mut self, job: &mut Job) {
        if let Some(w) = job.round.winner.as_mut() {
            if !w.settled {
                if let Some(mut k) = self.keepers.get(&w.keeper).cloned() {
                    k.locked = U128(k.locked.0.saturating_sub(w.locked.0));
                    self.save_keeper(&w.keeper, k);
                }
                w.settled = true;
            }
        }
    }

    /// Slash a winner that missed its exclusive window. Returns the slashed amount, if any.
    /// Never panics.
    pub(crate) fn slash_if_missed(&mut self, job: &mut Job) -> Option<u128> {
        let block = env::block_height();
        let until = exclusive_until(job, self.config.grace_blocks)?;
        if job.round.open_mode || job.round.in_flight.is_some() || block <= until {
            return None;
        }
        let w = job.round.winner.as_mut()?;
        if w.settled {
            return None;
        }
        let mut k = self.keepers.get(&w.keeper).cloned()?;
        let slash = job.max_reward.min(w.locked.0).min(k.stake.0);
        k.stake = U128(k.stake.0 - slash);
        k.locked = U128(k.locked.0.saturating_sub(w.locked.0));
        k.slashed += 1;
        let keeper_id = w.keeper.clone();
        w.settled = true;
        self.save_keeper(&keeper_id, k);

        job.balance = job.balance.saturating_add(slash);
        job.round.open_mode = true;
        let record = ExecutionRecord {
            round_id: job.round.round_id,
            executor: keeper_id.clone(),
            paid: U128(0),
            outcome: Outcome::Slashed,
            due_block: due_block(job),
            exec_block: block,
            epoch: env::epoch_height(),
            open_mode: true,
            slashed_keeper: Some(keeper_id.clone()),
        };
        self.push_history(job, record);

        MashpitEvent::KeeperSlashed {
            job_id: job.id,
            round_id: job.round.round_id,
            keeper: keeper_id,
            amount: U128(slash),
        }
        .emit();
        Some(slash)
    }

    pub(crate) fn push_history(&self, job: &mut Job, record: ExecutionRecord) {
        let max = self.config.max_history as usize;
        while job.history.len() >= max {
            job.history.remove(0);
        }
        job.history.push(record);
    }
}

// ---------- Schedule helpers ----------

/// Block from which the next execution is due, when it can be known.
pub(crate) fn due_block(job: &Job) -> Option<u64> {
    match job.schedule {
        Schedule::EveryBlocks { interval } => {
            Some(job.last_exec_block.unwrap_or(job.created_at) + interval)
        }
        // The contract cannot know the first block of an epoch; it records the first block at
        // which a call observed the job as due.
        Schedule::EveryEpoch => job.round.due_seen_block,
    }
}

pub(crate) fn is_due(job: &Job, block: u64, epoch: u64) -> bool {
    match job.schedule {
        Schedule::EveryBlocks { interval } => {
            block >= job.last_exec_block.unwrap_or(job.created_at) + interval
        }
        Schedule::EveryEpoch => match job.last_paid_epoch {
            None => true,
            Some(last) => epoch > last,
        },
    }
}

/// Last block of the winner's exclusive window.
pub(crate) fn exclusive_until(job: &Job, grace_blocks: u64) -> Option<u64> {
    due_block(job).map(|d| d.max(job.round.reveal_end) + grace_blocks)
}

pub(crate) fn phase(job: &Job, block: u64, epoch: u64, grace_blocks: u64) -> Phase {
    match job.status {
        JobStatus::Closed => return Phase::Closed,
        JobStatus::Paused => return Phase::Paused,
        JobStatus::Active => {}
    }
    let r = &job.round;
    if r.in_flight.is_some() {
        return Phase::InFlight;
    }
    if block < r.commit_end {
        return Phase::Commit;
    }
    if block < r.reveal_end {
        return Phase::Reveal;
    }
    if !r.finalized {
        return Phase::AwaitingFinalize;
    }
    let winner_active = r.winner.as_ref().map(|w| !w.settled).unwrap_or(false);
    if r.open_mode || !winner_active {
        return Phase::Open;
    }
    if !is_due(job, block, epoch) {
        return Phase::Awarded;
    }
    match exclusive_until(job, grace_blocks) {
        Some(until) if block > until => Phase::Open,
        _ => Phase::Exclusive,
    }
}

#[cfg(test)]
mod tests;
