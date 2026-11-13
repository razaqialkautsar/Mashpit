//! Read-only methods for the dashboard and keeper agents. See docs/SMART_CONTRACT_SPEC.md §4.6.

use near_sdk::json_types::U128;
use near_sdk::{AccountId, env, near};

use crate::MashpitExt;
use crate::{
    CommitView, Config, ExecutionRecord, Job, JobId, JobSummary, JobView, Keeper, Mashpit, Phase,
    RoundView, Stats, due_block, exclusive_until, is_due, phase,
};

const MAX_LIMIT: u64 = 100;

impl Mashpit {
    fn round_view(&self, job: &Job) -> RoundView {
        let r = &job.round;
        RoundView {
            round_id: r.round_id,
            opened_at: r.opened_at,
            commit_end: r.commit_end,
            reveal_end: r.reveal_end,
            commits: r
                .commits
                .iter()
                .map(|c| CommitView {
                    keeper: c.keeper.clone(),
                    block: c.block,
                    bond: U128(c.bond),
                    revealed: c.revealed,
                })
                .collect(),
            reveals: r.reveals.clone(),
            finalized: r.finalized,
            winner: r.winner.clone(),
            open_mode: r.open_mode,
            due_seen_block: r.due_seen_block,
            in_flight: r.in_flight.clone(),
        }
    }

    fn job_phase(&self, job: &Job) -> Phase {
        phase(job, env::block_height(), env::epoch_height(), self.config.grace_blocks)
    }
}

#[near]
impl Mashpit {
    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_stats(&self) -> Stats {
        let total_stake: u128 = self
            .keeper_ids
            .iter()
            .filter_map(|id| self.keepers.get(id).map(|k| k.stake.0))
            .sum();
        Stats {
            jobs: self.jobs.len() as u64,
            keepers: self.keeper_ids.len() as u64,
            total_stake: U128(total_stake),
            fees_accrued: U128(self.fees_accrued),
            current_block: env::block_height(),
            current_epoch: env::epoch_height(),
        }
    }

    pub fn get_job(&self, job_id: JobId) -> Option<JobView> {
        let job = self.jobs.get(&job_id)?;
        let block = env::block_height();
        let epoch = env::epoch_height();
        Some(JobView {
            id: job.id,
            owner: job.owner.clone(),
            target: job.target.clone(),
            method: job.method.clone(),
            args: job.args.clone(),
            gas_tgas: job.gas_tgas,
            schedule: job.schedule.clone(),
            success_rule: job.success_rule.clone(),
            max_reward: U128(job.max_reward),
            balance: U128(job.balance),
            status: job.status.clone(),
            last_exec_block: job.last_exec_block,
            last_paid_epoch: job.last_paid_epoch,
            created_at: job.created_at,
            round: self.round_view(job),
            phase: self.job_phase(job),
            is_due: is_due(job, block, epoch),
            due_block: due_block(job),
            exclusive_until: exclusive_until(job, self.config.grace_blocks),
            current_block: block,
            current_epoch: epoch,
        })
    }

    pub fn list_jobs(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<JobSummary> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(MAX_LIMIT).min(MAX_LIMIT) as usize;
        self.jobs
            .iter()
            .skip(from)
            .take(limit)
            .map(|(_, job)| JobSummary {
                id: job.id,
                owner: job.owner.clone(),
                target: job.target.clone(),
                method: job.method.clone(),
                schedule: job.schedule.clone(),
                max_reward: U128(job.max_reward),
                balance: U128(job.balance),
                status: job.status.clone(),
                phase: self.job_phase(job),
                round_id: job.round.round_id,
                winner: job.round.winner.as_ref().map(|w| w.keeper.clone()),
                last_outcome: job.history.last().map(|h| h.outcome.clone()),
            })
            .collect()
    }

    pub fn get_round(&self, job_id: JobId) -> Option<RoundView> {
        self.jobs.get(&job_id).map(|job| self.round_view(job))
    }

    pub fn get_history(&self, job_id: JobId) -> Vec<ExecutionRecord> {
        self.jobs
            .get(&job_id)
            .map(|job| job.history.clone())
            .unwrap_or_default()
    }

    pub fn get_keeper(&self, account_id: AccountId) -> Option<Keeper> {
        self.keepers.get(&account_id).cloned()
    }

    pub fn list_keepers(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<(AccountId, Keeper)> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(MAX_LIMIT).min(MAX_LIMIT) as usize;
        self.keeper_ids
            .iter()
            .skip(from)
            .take(limit)
            .filter_map(|id| self.keepers.get(id).map(|k| (id.clone(), k.clone())))
            .collect()
    }
}
