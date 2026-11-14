// Mirrors the JSON the contract returns (docs/SMART_CONTRACT_SPEC.md §2, §4.6).
// Every NEAR amount is a decimal string of yoctoNEAR (U128).

export type Yocto = string;

export type Schedule = "EveryEpoch" | { EveryBlocks: { interval: number } };
export type SuccessRule = "Any" | "ReturnsTrue";
export type JobStatus = "Active" | "Paused" | "Closed";
export type Phase =
  | "Commit"
  | "Reveal"
  | "AwaitingFinalize"
  | "Awarded"
  | "Exclusive"
  | "Open"
  | "InFlight"
  | "Paused"
  | "Closed";
export type Outcome = "Paid" | "Failed" | "ReturnedFalse" | "Slashed";

export type Config = {
  owner_id: string;
  treasury_id: string;
  protocol_fee_bps: number;
  min_keeper_stake: Yocto;
  stake_multiplier: number;
  min_commit_bond: Yocto;
  commit_blocks: number;
  reveal_blocks: number;
  grace_blocks: number;
  max_commits_per_round: number;
  max_history: number;
  max_memo_bytes: number;
  callback_gas_tgas: number;
  overhead_gas_tgas: number;
  max_total_gas_tgas: number;
};

export type Stats = {
  jobs: number;
  keepers: number;
  total_stake: Yocto;
  fees_accrued: Yocto;
  current_block: number;
  current_epoch: number;
};

export type Winner = { keeper: string; bid: Yocto; locked: Yocto; settled?: boolean };

export type JobSummary = {
  id: number;
  owner: string;
  target: string;
  method: string;
  schedule: Schedule;
  max_reward: Yocto;
  balance: Yocto;
  status: JobStatus;
  phase: Phase;
  round_id: number;
  /** Account id only; the bid is on the full round (get_job). */
  winner: string | null;
  last_outcome: Outcome | null;
};

/** `hash` is base64 sha256 of "{bid}:{salt}:{keeper}". */
export type Commit = { keeper: string; hash?: string; bond: Yocto; block: number; revealed?: boolean };
export type Reveal = { keeper: string; bid: Yocto; commit_block: number; memo: string | null };

export type Round = {
  round_id: number;
  opened_at: number;
  commit_end: number;
  reveal_end: number;
  commits: Commit[];
  reveals: Reveal[];
  finalized: boolean;
  winner: Winner | null;
  open_mode: boolean;
  due_seen_block: number | null;
  in_flight: { executor: string; pay: Yocto; started_block: number } | null;
};

export type ExecutionRecord = {
  round_id: number;
  executor: string;
  paid: Yocto;
  outcome: Outcome;
  due_block: number | null;
  exec_block: number;
  epoch: number;
  open_mode: boolean;
  slashed_keeper: string | null;
};

export type JobView = {
  id: number;
  owner: string;
  target: string;
  method: string;
  args: string; // base64
  gas_tgas: number;
  schedule: Schedule;
  success_rule: SuccessRule;
  max_reward: Yocto;
  balance: Yocto;
  status: JobStatus;
  last_exec_block: number | null;
  last_paid_epoch: number | null;
  created_at: number;
  round: Round;
  phase: Phase;
  is_due: boolean;
  due_block: number | null;
  exclusive_until: number | null;
  current_block: number;
  current_epoch: number;
};

export type Keeper = {
  stake: Yocto;
  locked: Yocto;
  rewards: Yocto;
  executed: number;
  slashed: number;
  registered_at: number;
};

export type KeeperRow = [accountId: string, keeper: Keeper];
