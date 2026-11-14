//! Job registry. See docs/SMART_CONTRACT_SPEC.md §4.3.

use near_sdk::json_types::U128;
use near_sdk::{NearToken, Promise, env, near};

use crate::MashpitExt;
use crate::errors::{ensure, fail};
use crate::events::MashpitEvent;
use crate::{Job, JobId, JobInput, JobStatus, Mashpit, Schedule};

#[near]
impl Mashpit {
    /// Register a scheduled call. The attached deposit pays the storage of the job; the rest
    /// becomes the job balance, which must cover at least one `max_reward`.
    #[payable]
    pub fn register_job(&mut self, input: JobInput) -> JobId {
        let cfg = &self.config;
        let max_reward = input.max_reward.0;
        ensure(max_reward > 0, "InvalidJob", "max_reward must be > 0");
        ensure(
            input.target != env::current_account_id(),
            "InvalidJob",
            "a job cannot call the Mashpit contract itself",
        );
        ensure(!input.method.is_empty(), "InvalidJob", "method is empty");
        ensure(input.gas_tgas > 0, "InvalidJob", "gas_tgas must be > 0");
        ensure(
            input.gas_tgas + cfg.callback_gas_tgas + cfg.overhead_gas_tgas <= cfg.max_total_gas_tgas,
            "InvalidJob",
            &format!(
                "gas_tgas + {} (callback) + {} (overhead) must be <= {}",
                cfg.callback_gas_tgas, cfg.overhead_gas_tgas, cfg.max_total_gas_tgas
            ),
        );
        if let Schedule::EveryBlocks { interval } = input.schedule {
            ensure(
                interval >= cfg.commit_blocks + cfg.reveal_blocks,
                "InvalidJob",
                "interval must be >= commit_blocks + reveal_blocks",
            );
        }

        let id = self.next_job_id;
        self.next_job_id += 1;
        let job = Job {
            id,
            owner: env::predecessor_account_id(),
            target: input.target,
            method: input.method,
            args: input.args,
            gas_tgas: input.gas_tgas,
            schedule: input.schedule,
            success_rule: input.success_rule,
            max_reward,
            balance: 0,
            status: JobStatus::Active,
            last_exec_block: None,
            last_paid_epoch: None,
            created_at: env::block_height(),
            round: self.new_round(0),
            history: Vec::new(),
        };

        let before = env::storage_usage();
        self.save_job(job.clone());
        self.jobs.flush();
        let used = env::storage_usage().saturating_sub(before);
        let storage_cost = used as u128 * env::storage_byte_cost().as_yoctonear();
        let attached = env::attached_deposit().as_yoctonear();
        ensure(
            attached >= storage_cost + max_reward,
            "InsufficientDeposit",
            &format!("attach at least {} yoctoNEAR (storage + one max_reward)", storage_cost + max_reward),
        );

        let mut job = job;
        job.balance = attached - storage_cost;
        MashpitEvent::JobRegistered {
            job_id: id,
            owner: job.owner.clone(),
            target: job.target.clone(),
            method: job.method.clone(),
            schedule: job.schedule.clone(),
            max_reward: U128(max_reward),
        }
        .emit();
        self.save_job(job);
        id
    }

    /// Add the attached deposit to a job's balance. Anyone can top up.
    #[payable]
    pub fn top_up(&mut self, job_id: JobId) {
        let mut job = self.load_job(job_id);
        ensure(job.status != JobStatus::Closed, "JobClosed", "job is closed");
        let amount = env::attached_deposit().as_yoctonear();
        ensure(amount > 0, "InvalidAmount", "attach a deposit");
        job.balance += amount;
        self.save_job(job);
    }

    pub fn pause_job(&mut self, job_id: JobId) {
        let mut job = self.owned_job(job_id);
        ensure(job.status == JobStatus::Active, "JobNotActive", "job is not active");
        job.status = JobStatus::Paused;
        self.save_job(job);
    }

    pub fn resume_job(&mut self, job_id: JobId) {
        let mut job = self.owned_job(job_id);
        ensure(job.status == JobStatus::Paused, "JobNotPaused", "job is not paused");
        job.status = JobStatus::Active;
        self.save_job(job);
    }

    /// Close a job: release keeper locks, remove the job, refund its balance plus the freed
    /// storage to the owner.
    pub fn close_job(&mut self, job_id: JobId) -> Promise {
        let mut job = self.owned_job(job_id);
        ensure(job.round.in_flight.is_none(), "ExecutionInFlight", "an execution is in flight");

        // Release the winner lock and any unrevealed commit bonds without penalty.
        self.release_winner_lock(&mut job);
        let pending: Vec<_> = job
            .round
            .commits
            .iter()
            .filter(|c| !c.revealed)
            .map(|c| (c.keeper.clone(), c.bond))
            .collect();
        for (account, bond) in pending {
            if let Some(mut k) = self.keepers.get(&account).cloned() {
                k.locked = U128(k.locked.0.saturating_sub(bond));
                self.save_keeper(&account, k);
            }
        }

        let before = env::storage_usage();
        self.jobs.remove(&job_id);
        self.jobs.flush();
        let freed = before.saturating_sub(env::storage_usage());
        let refund = job.balance + freed as u128 * env::storage_byte_cost().as_yoctonear();
        Promise::new(job.owner).transfer(NearToken::from_yoctonear(refund))
    }
}

impl Mashpit {
    fn owned_job(&self, job_id: JobId) -> Job {
        let job = self.load_job(job_id);
        if env::predecessor_account_id() != job.owner {
            fail("NotJobOwner", "only the job owner can call this method");
        }
        job
    }
}
