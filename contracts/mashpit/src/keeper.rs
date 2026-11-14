//! Keeper registry and stake. See docs/SMART_CONTRACT_SPEC.md §4.2.
//!
//! `register_keeper`, `add_stake` and `unregister_keeper` are meant for the keeper's full-access
//! key. Everything else a keeper agent calls needs no attached deposit, so it works with a
//! function-call key (function-call keys cannot attach NEAR).

use near_sdk::json_types::U128;
use near_sdk::{NearToken, Promise, env, near};

use crate::MashpitExt;
use crate::errors::ensure;
use crate::events::MashpitEvent;
use crate::{Keeper, Mashpit};

#[near]
impl Mashpit {
    /// Register the caller as a keeper. Attach at least `min_keeper_stake`.
    #[payable]
    pub fn register_keeper(&mut self) {
        let account = env::predecessor_account_id();
        ensure(
            !self.keeper_ids.contains(&account),
            "AlreadyRegistered",
            &format!("{account} is already a keeper"),
        );
        let stake = env::attached_deposit().as_yoctonear();
        ensure(
            stake >= self.config.min_keeper_stake.0,
            "StakeTooLow",
            &format!("attach at least {} yoctoNEAR", self.config.min_keeper_stake.0),
        );
        let keeper = Keeper {
            stake: U128(stake),
            registered_at: env::block_height(),
            ..Default::default()
        };
        self.save_keeper(&account, keeper);
        self.keeper_ids.insert(account.clone());
        MashpitEvent::KeeperRegistered { keeper: account, stake: U128(stake) }.emit();
    }

    /// Add the attached deposit to the caller's stake.
    #[payable]
    pub fn add_stake(&mut self) {
        let account = env::predecessor_account_id();
        let mut k = self.load_keeper(&account);
        let amount = env::attached_deposit().as_yoctonear();
        ensure(amount > 0, "InvalidAmount", "attach a deposit");
        k.stake = U128(k.stake.0 + amount);
        self.save_keeper(&account, k);
    }

    /// Withdraw stake that is not locked by commits or won rounds.
    pub fn withdraw_stake(&mut self, amount: U128) -> Promise {
        let account = env::predecessor_account_id();
        let mut k = self.load_keeper(&account);
        ensure(amount.0 > 0, "InvalidAmount", "amount must be > 0");
        ensure(
            amount.0 <= k.free_stake(),
            "InsufficientFreeStake",
            &format!("free stake is {}", k.free_stake()),
        );
        k.stake = U128(k.stake.0 - amount.0);
        self.save_keeper(&account, k);
        Promise::new(account).transfer(NearToken::from_yoctonear(amount.0))
    }

    /// Withdraw accumulated rewards.
    pub fn withdraw_rewards(&mut self) -> Promise {
        let account = env::predecessor_account_id();
        let mut k = self.load_keeper(&account);
        let amount = k.rewards.0;
        ensure(amount > 0, "NothingToWithdraw", "no rewards to withdraw");
        k.rewards = U128(0);
        self.save_keeper(&account, k);
        Promise::new(account).transfer(NearToken::from_yoctonear(amount))
    }

    /// Leave the market. Requires no locked stake. Returns stake + rewards.
    pub fn unregister_keeper(&mut self) -> Promise {
        let account = env::predecessor_account_id();
        let k = self.load_keeper(&account);
        ensure(k.locked.0 == 0, "StakeLocked", "stake is locked by an open round");
        self.keepers.remove(&account);
        self.keeper_ids.remove(&account);
        Promise::new(account).transfer(NearToken::from_yoctonear(k.stake.0 + k.rewards.0))
    }
}
