//! Unit tests. Integration tests (real cross-contract calls and callbacks) live in `tests/`.

use super::*;
use crate::auction::commit_hash;
use near_sdk::json_types::Base64VecU8;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{Gas, testing_env};

const NEAR: u128 = ONE_NEAR;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(predecessor: &str, block: u64, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("mashpit.testnet"))
        .predecessor_account_id(acc(predecessor))
        .signer_account_id(acc(predecessor))
        .block_height(block)
        .epoch_height(10)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .prepaid_gas(Gas::from_tgas(300))
        .account_balance(NearToken::from_near(100));
    testing_env!(b.build());
}

fn setup() -> Mashpit {
    ctx("owner.testnet", 100, 0);
    Mashpit::new(acc("owner.testnet"), acc("treasury.testnet"), None)
}

fn job_input(max_reward: u128) -> JobInput {
    JobInput {
        target: acc("linear-protocol.testnet"),
        method: "epoch_update_rewards".into(),
        args: Base64VecU8(br#"{"validator_id":"aurora.pool.f863973.m0"}"#.to_vec()),
        gas_tgas: 150,
        schedule: Schedule::EveryEpoch,
        success_rule: SuccessRule::Any,
        max_reward: U128(max_reward),
    }
}

fn register(c: &mut Mashpit, who: &str, stake: u128) {
    ctx(who, 100, stake);
    c.register_keeper();
}

/// Registers a job at block 100 (commit phase 100..150, reveal 150..200).
fn new_job(c: &mut Mashpit, max_reward: u128) -> JobId {
    ctx("owner.testnet", 100, 2 * NEAR);
    c.register_job(job_input(max_reward))
}

fn commit(c: &mut Mashpit, who: &str, job: JobId, bid: u128, salt: &str, block: u64) {
    ctx(who, block, 0);
    let h = commit_hash(bid, salt, who);
    c.commit_bid(job, Base64VecU8(h.to_vec()));
}

fn reveal(c: &mut Mashpit, who: &str, job: JobId, bid: u128, salt: &str) {
    ctx(who, 160, 0);
    c.reveal_bid(job, U128(bid), salt.into(), Some(format!("{who} reason")));
}

#[test]
fn defaults_match_spec() {
    let c = setup();
    let cfg = c.get_config();
    assert_eq!(cfg.protocol_fee_bps, 500);
    assert_eq!(cfg.min_keeper_stake.0, NEAR);
    assert_eq!(cfg.min_commit_bond.0, NEAR / 10);
    assert_eq!((cfg.commit_blocks, cfg.reveal_blocks, cfg.grace_blocks), (50, 50, 50));
}

#[test]
#[should_panic(expected = "Mashpit: StakeTooLow")]
fn register_keeper_requires_min_stake() {
    let mut c = setup();
    register(&mut c, "k1.testnet", NEAR / 2);
}

#[test]
fn register_job_charges_storage() {
    let mut c = setup();
    let id = new_job(&mut c, NEAR / 10);
    let job = c.get_job(id).unwrap();
    assert!(job.balance.0 < 2 * NEAR, "storage must be deducted");
    assert!(job.balance.0 >= NEAR / 10);
    assert_eq!(job.phase, Phase::Commit);
    assert!(job.is_due);
}

#[test]
#[should_panic(expected = "Mashpit: InvalidJob")]
fn register_job_rejects_too_much_gas() {
    let mut c = setup();
    let mut input = job_input(NEAR / 10);
    input.gas_tgas = 280;
    ctx("owner.testnet", 100, 2 * NEAR);
    c.register_job(input);
}

#[test]
fn lowest_bid_wins_and_ties_go_to_earlier_commit() {
    let mut c = setup();
    for k in ["k1.testnet", "k2.testnet", "k3.testnet"] {
        register(&mut c, k, 5 * NEAR);
    }
    let id = new_job(&mut c, NEAR / 10);
    commit(&mut c, "k1.testnet", id, 30, "s1", 110);
    commit(&mut c, "k2.testnet", id, 20, "s2", 120);
    commit(&mut c, "k3.testnet", id, 20, "s3", 115);
    // bond (0.1 NEAR) is locked from stake on commit
    assert_eq!(c.get_keeper(acc("k1.testnet")).unwrap().locked.0, NEAR / 10);

    reveal(&mut c, "k1.testnet", id, 30, "s1");
    reveal(&mut c, "k2.testnet", id, 20, "s2");
    reveal(&mut c, "k3.testnet", id, 20, "s3");
    // bond released on reveal
    assert_eq!(c.get_keeper(acc("k1.testnet")).unwrap().locked.0, 0);

    ctx("anyone.testnet", 200, 0);
    c.finalize_round(id);
    let w = c.get_job(id).unwrap().round.winner.unwrap();
    assert_eq!(w.keeper, acc("k3.testnet")); // same bid as k2, committed earlier
    assert_eq!(w.bid.0, 20);
    // winner locks stake_multiplier * max_reward
    assert_eq!(c.get_keeper(acc("k3.testnet")).unwrap().locked.0, NEAR);
}

#[test]
fn unrevealed_bond_is_forfeited_to_job() {
    let mut c = setup();
    register(&mut c, "k1.testnet", 5 * NEAR);
    register(&mut c, "k2.testnet", 5 * NEAR);
    let id = new_job(&mut c, NEAR / 10);
    let balance_before = c.get_job(id).unwrap().balance.0;
    commit(&mut c, "k1.testnet", id, 30, "s1", 110);
    commit(&mut c, "k2.testnet", id, 20, "s2", 120);
    reveal(&mut c, "k1.testnet", id, 30, "s1"); // k2 never reveals

    ctx("anyone.testnet", 200, 0);
    c.finalize_round(id);
    let k2 = c.get_keeper(acc("k2.testnet")).unwrap();
    assert_eq!(k2.stake.0, 5 * NEAR - NEAR / 10);
    assert_eq!(k2.locked.0, 0);
    assert_eq!(c.get_job(id).unwrap().balance.0, balance_before + NEAR / 10);
    assert_eq!(c.get_job(id).unwrap().round.winner.unwrap().keeper, acc("k1.testnet"));
}

#[test]
#[should_panic(expected = "Mashpit: HashMismatch")]
fn reveal_with_wrong_salt_fails() {
    let mut c = setup();
    register(&mut c, "k1.testnet", 5 * NEAR);
    let id = new_job(&mut c, NEAR / 10);
    commit(&mut c, "k1.testnet", id, 30, "right", 110);
    reveal(&mut c, "k1.testnet", id, 30, "wrong");
}

#[test]
#[should_panic(expected = "Mashpit: InsufficientFreeStake")]
fn commit_requires_free_stake_for_bond_and_lock() {
    let mut c = setup();
    register(&mut c, "k1.testnet", NEAR); // needs 0.1 bond + 1.0 lock
    let id = new_job(&mut c, NEAR / 10);
    commit(&mut c, "k1.testnet", id, 30, "s", 110);
}

fn awarded_job(c: &mut Mashpit) -> JobId {
    register(c, "k1.testnet", 5 * NEAR);
    register(c, "k2.testnet", 5 * NEAR);
    let id = new_job(c, NEAR / 10);
    commit(c, "k1.testnet", id, 50, "s1", 110);
    reveal(c, "k1.testnet", id, 50, "s1");
    ctx("anyone.testnet", 200, 0);
    c.finalize_round(id);
    id
}

#[test]
#[should_panic(expected = "Mashpit: NotAuthorized")]
fn non_winner_cannot_execute_in_exclusive_window() {
    let mut c = setup();
    let id = awarded_job(&mut c);
    ctx("k2.testnet", 210, 0);
    let _ = c.execute(id);
}

#[test]
fn winner_executes_in_exclusive_window() {
    let mut c = setup();
    let id = awarded_job(&mut c);
    ctx("k1.testnet", 210, 0);
    let _ = c.execute(id);
    let job = c.get_job(id).unwrap();
    assert_eq!(job.phase, Phase::InFlight);
    assert_eq!(job.round.in_flight.unwrap().pay.0, 50);
}

#[test]
fn missed_window_slashes_winner_and_opens_round() {
    let mut c = setup();
    let id = awarded_job(&mut c);
    // Due is first observed at block 210 -> exclusive until 260.
    ctx("anyone.testnet", 210, 0);
    c.poke(id);
    let balance_before = c.get_job(id).unwrap().balance.0;

    ctx("anyone.testnet", 300, 0);
    let slashed = c.slash_missed(id);
    assert_eq!(slashed.0, NEAR / 10);
    let k1 = c.get_keeper(acc("k1.testnet")).unwrap();
    assert_eq!(k1.stake.0, 5 * NEAR - NEAR / 10);
    assert_eq!(k1.locked.0, 0);
    assert_eq!(k1.slashed, 1);
    let job = c.get_job(id).unwrap();
    assert!(job.round.open_mode);
    assert_eq!(job.balance.0, balance_before + NEAR / 10);
    assert_eq!(c.get_history(id).last().unwrap().outcome, Outcome::Slashed);

    // Any keeper can now execute, paid max_reward.
    ctx("k2.testnet", 301, 0);
    let _ = c.execute(id);
    assert_eq!(c.get_job(id).unwrap().round.in_flight.unwrap().pay.0, NEAR / 10);
}

#[test]
fn no_reveals_means_open_mode() {
    let mut c = setup();
    register(&mut c, "k1.testnet", 5 * NEAR);
    let id = new_job(&mut c, NEAR / 10);
    ctx("anyone.testnet", 200, 0);
    c.finalize_round(id);
    let job = c.get_job(id).unwrap();
    assert!(job.round.open_mode);
    assert_eq!(job.phase, Phase::Open);
    ctx("k1.testnet", 201, 0);
    let _ = c.execute(id);
}

#[test]
fn every_epoch_due_rules() {
    let mut c = setup();
    let id = new_job(&mut c, NEAR / 10);
    let mut job = c.load_job(id);
    assert!(is_due(&job, 100, 10));
    job.last_paid_epoch = Some(10);
    assert!(!is_due(&job, 100, 10));
    assert!(is_due(&job, 100, 11));
}

#[test]
#[should_panic(expected = "Mashpit: NotOwner")]
fn only_owner_sets_config() {
    let mut c = setup();
    ctx("someone.testnet", 100, 0);
    c.set_config(ConfigPatch::default());
}
