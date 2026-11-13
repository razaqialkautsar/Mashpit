//! Execution, callback and slashing. See docs/SMART_CONTRACT_SPEC.md §4.5 and §5.3–5.5.

use near_sdk::json_types::U128;
use near_sdk::{Gas, NearToken, Promise, env, near};

use crate::MashpitExt;
use crate::errors::{ensure, fail};
use crate::events::MashpitEvent;
use crate::{
    ExecutionRecord, InFlight, JobId, JobStatus, MAX_RESULT_LEN, Mashpit, Outcome, Schedule,
    SuccessRule, due_block, exclusive_until, is_due,
};

#[near]
impl Mashpit {
    /// Record that a job is due, which starts the winner's exclusive window for `EveryEpoch`
    /// jobs. Anyone can call it.
    pub fn poke(&mut self, job_id: JobId) {
        let mut job = self.load_job(job_id);
        ensure(job.status == JobStatus::Active, "JobNotActive", "job is not active");
        if env::block_height() >= job.round.reveal_end {
            self.finalize_round_internal(&mut job);
        }
        ensure(
            is_due(&job, env::block_height(), env::epoch_height()),
            "NotDue",
            "job is not due yet",
        );
        if job.round.due_seen_block.is_none() {
            job.round.due_seen_block = Some(env::block_height());
        }
        self.save_job(job);
    }

    /// Execute the job's call. Only the round winner may call during its exclusive window;
    /// after the window (or when the round has no winner) any registered keeper may call.
    pub fn execute(&mut self, job_id: JobId) -> Promise {
        let caller = env::predecessor_account_id();
        let _ = self.load_keeper(&caller); // must be a registered keeper
        let mut job = self.load_job(job_id);
        let cfg = self.config.clone();
        let block = env::block_height();

        ensure(job.status == JobStatus::Active, "JobNotActive", "job is not active");
        ensure(
            block >= job.round.reveal_end,
            "WrongPhase",
            &format!("auction ends at block {}", job.round.reveal_end),
        );
        self.finalize_round_internal(&mut job);
        ensure(is_due(&job, block, env::epoch_height()), "NotDue", "job is not due yet");
        ensure(job.round.in_flight.is_none(), "ExecutionInFlight", "an execution is in flight");
        let needed = job.gas_tgas + cfg.callback_gas_tgas + cfg.overhead_gas_tgas;
        ensure(
            env::prepaid_gas() >= Gas::from_tgas(needed),
            "NotEnoughGas",
            &format!("attach at least {needed} Tgas"),
        );

        if job.round.due_seen_block.is_none() && job.schedule == Schedule::EveryEpoch {
            job.round.due_seen_block = Some(block);
        }

        // A winner that missed its window is slashed before anyone else executes.
        self.slash_if_missed(&mut job);

        let winner_active = job
            .round
            .winner
            .as_ref()
            .map(|w| !w.settled)
            .unwrap_or(false);
        let exclusive = !job.round.open_mode
            && winner_active
            && exclusive_until(&job, cfg.grace_blocks)
                .map(|until| block <= until)
                .unwrap_or(true);

        let pay = if exclusive {
            let w = job.round.winner.as_ref().unwrap();
            if w.keeper != caller {
                fail(
                    "NotAuthorized",
                    &format!("{} holds the exclusive window", w.keeper),
                );
            }
            w.bid.0
        } else {
            job.round.open_mode = true;
            job.max_reward
        };
        ensure(
            job.balance >= pay,
            "InsufficientJobBalance",
            "job balance cannot cover the payment; top up the job",
        );

        job.round.in_flight = Some(InFlight {
            executor: caller,
            pay: U128(pay),
            started_block: block,
        });
        let round_id = job.round.round_id;
        let target = job.target.clone();
        let method = job.method.clone();
        let args = job.args.0.clone();
        let gas = Gas::from_tgas(job.gas_tgas);
        self.save_job(job);

        Promise::new(target)
            .function_call(method, args, NearToken::from_yoctonear(0), gas)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(cfg.callback_gas_tgas))
                    .on_executed(job_id, round_id),
            )
    }

    /// Callback after the job's call. Never panics (docs: "Do not panic in callbacks").
    #[private]
    pub fn on_executed(&mut self, job_id: JobId, round_id: u64) -> Outcome {
        let result = env::promise_result_checked(0, MAX_RESULT_LEN);

        let Some(mut job) = self.jobs.get(&job_id).cloned() else {
            env::log_str(&format!("Mashpit: job {job_id} not found in callback"));
            return Outcome::Failed;
        };
        if job.round.round_id != round_id {
            env::log_str(&format!("Mashpit: stale callback for round {round_id}"));
            return Outcome::Failed;
        }
        let Some(flight) = job.round.in_flight.take() else {
            env::log_str("Mashpit: callback without an in-flight execution");
            return Outcome::Failed;
        };

        let outcome = match (&result, &job.success_rule) {
            (Err(_), _) => Outcome::Failed,
            (Ok(_), SuccessRule::Any) => Outcome::Paid,
            (Ok(bytes), SuccessRule::ReturnsTrue) => {
                if bytes.as_slice() == b"true" {
                    Outcome::Paid
                } else {
                    Outcome::ReturnedFalse
                }
            }
        };

        let block = env::block_height();
        let epoch = env::epoch_height();
        let mut paid = 0u128;
        let mut fee = 0u128;

        match outcome {
            Outcome::Paid => {
                let pay = flight.pay.0.min(job.balance);
                fee = pay * self.config.protocol_fee_bps as u128 / 10_000;
                if let Some(mut k) = self.keepers.get(&flight.executor).cloned() {
                    k.rewards = U128(k.rewards.0 + (pay - fee));
                    k.executed += 1;
                    self.save_keeper(&flight.executor, k);
                    job.balance -= pay;
                    self.fees_accrued += fee;
                    paid = pay;
                } else {
                    // Executor left the market between execute and callback: keep the funds
                    // in the job.
                    fee = 0;
                }
            }
            Outcome::ReturnedFalse | Outcome::Failed | Outcome::Slashed => {}
        }

        let record = ExecutionRecord {
            round_id,
            executor: flight.executor.clone(),
            paid: U128(paid),
            outcome: outcome.clone(),
            due_block: due_block(&job),
            exec_block: block,
            epoch,
            open_mode: job.round.open_mode,
            slashed_keeper: None,
        };
        self.push_history(&mut job, record);

        if outcome != Outcome::Failed {
            // Close this run: update the schedule, release the winner lock, open a new round.
            job.last_exec_block = Some(block);
            if job.schedule == Schedule::EveryEpoch {
                job.last_paid_epoch = Some(epoch);
            }
            self.release_winner_lock(&mut job);
            job.round = self.new_round(round_id + 1);
        }
        // On failure the round stays as it is, so the job remains due and can be retried.

        MashpitEvent::JobExecuted {
            job_id,
            round_id,
            executor: flight.executor,
            outcome: outcome.clone(),
            paid: U128(paid),
            fee: U128(fee),
        }
        .emit();
        self.save_job(job);
        outcome
    }

    /// Slash a winner that missed its exclusive window and open the round to every keeper.
    /// Anyone can call it.
    pub fn slash_missed(&mut self, job_id: JobId) -> U128 {
        let mut job = self.load_job(job_id);
        ensure(job.round.in_flight.is_none(), "ExecutionInFlight", "an execution is in flight");
        ensure(job.round.winner.is_some(), "NoWinner", "round has no winner");
        ensure(!job.round.open_mode, "AlreadyOpen", "round is already open");
        match self.slash_if_missed(&mut job) {
            Some(amount) => {
                self.save_job(job);
                U128(amount)
            }
            None => fail(
                "WindowNotOver",
                "the winner's exclusive window has not ended (or the job is not due)",
            ),
        }
    }
}
