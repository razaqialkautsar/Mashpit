// RPC reads and transactions against the Mashpit contract.

import { Account, FailoverRpcProvider, JsonRpcProvider, teraToGas } from "near-api-js";
import type { Config } from "./config.ts";

// ---------- View types (contracts/mashpit/src/types.rs, JSON) ----------

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

export interface CommitView {
  keeper: string;
  hash: string; // base64, 32 bytes
  block: number;
  bond: string;
  revealed: boolean;
}

export interface RevealView {
  keeper: string;
  bid: string;
  commit_block: number;
  memo: string | null;
}

export interface RoundView {
  round_id: number;
  opened_at: number;
  commit_end: number;
  reveal_end: number;
  commits: CommitView[];
  reveals: RevealView[];
  finalized: boolean;
  winner: { keeper: string; bid: string; locked: string; settled: boolean } | null;
  open_mode: boolean;
  due_seen_block: number | null;
  in_flight: { executor: string; pay: string; started_block: number } | null;
}

export interface JobSummary {
  id: number;
  status: string;
  phase: Phase;
}

export interface JobView {
  id: number;
  owner: string;
  target: string;
  method: string;
  gas_tgas: number;
  schedule: unknown;
  success_rule: unknown;
  max_reward: string;
  balance: string;
  status: string;
  last_exec_block: number | null;
  last_paid_epoch: number | null;
  round: RoundView;
  phase: Phase;
  is_due: boolean;
  due_block: number | null;
  exclusive_until: number | null;
  current_block: number;
  current_epoch: number;
}

export interface ExecutionRecord {
  round_id: number;
  executor: string;
  paid: string;
  outcome: "Paid" | "Failed" | "ReturnedFalse" | "Slashed";
  exec_block: number;
  epoch: number;
  open_mode: boolean;
}

export interface KeeperView {
  stake: string;
  locked: string;
  rewards: string;
  executed: number;
  slashed: number;
}

export interface ContractConfig {
  min_commit_bond: string;
  stake_multiplier: number;
  max_memo_bytes: number;
  callback_gas_tgas: number;
  overhead_gas_tgas: number;
  max_total_gas_tgas: number;
}

// ---------- Client ----------

export class Mashpit {
  readonly provider: FailoverRpcProvider;
  readonly account: Account;

  constructor(private readonly cfg: Config) {
    this.provider = new FailoverRpcProvider(cfg.rpcUrls.map((url) => new JsonRpcProvider({ url }, { retries: 2, wait: 300 })));
    this.account = new Account(cfg.accountId, this.provider, cfg.privateKey);
  }

  view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.provider.callFunction({
      contractId: this.cfg.contractId,
      method,
      args,
      blockQuery: { finality: "optimistic" },
    }) as Promise<T>;
  }

  config = () => this.view<ContractConfig>("get_config");
  listJobs = () => this.view<JobSummary[]>("list_jobs", { from_index: 0, limit: 100 });
  job = (jobId: number) => this.view<JobView | null>("get_job", { job_id: jobId });
  history = (jobId: number) => this.view<ExecutionRecord[]>("get_history", { job_id: jobId });
  keeper = (accountId = this.cfg.accountId) =>
    this.view<KeeperView | null>("get_keeper", { account_id: accountId });

  /** Gas price in yoctoNEAR per gas unit at the latest block. */
  async gasPrice(): Promise<bigint> {
    const r = (await this.provider.viewGasPrice()) as { gas_price: string };
    return BigInt(r.gas_price);
  }

  /** Send a function call from the keeper account. No deposit: works with a function-call key. */
  call<T>(method: string, args: Record<string, unknown>, gasTgas: number): Promise<T> {
    return this.account.callFunction<never>({
      contractId: this.cfg.contractId,
      methodName: method,
      args,
      gas: teraToGas(gasTgas),
      deposit: 0n,
      waitUntil: "EXECUTED_OPTIMISTIC",
    }) as Promise<T>;
  }
}

/** Extract "Mashpit: Code: detail" from a failed call, if present. */
export function contractError(err: unknown): string {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify(err)}` : String(err);
  const m = text.match(/Mashpit: (\w+): ([^"\\]*)/);
  return m ? `${m[1]}: ${m[2].trim()}` : text.slice(0, 300);
}
