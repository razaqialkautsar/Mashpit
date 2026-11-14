import { JsonRpcProvider } from "near-api-js";
import { near } from "./near";
import type {
  Config,
  ExecutionRecord,
  JobSummary,
  JobView,
  KeeperRow,
  Round,
  Stats,
} from "./types";

// One provider for every read. Views need no wallet (FE-NFR-6).
const provider = new JsonRpcProvider({ url: near.rpcUrl });

function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  return provider.callFunction({ contractId: near.contractId, method, args }) as unknown as Promise<T>;
}

const PAGE = 50;

export const getStats = () => view<Stats>("get_stats");
export const getConfig = () => view<Config>("get_config");
export const listJobs = () => view<JobSummary[]>("list_jobs", { from_index: 0, limit: PAGE });
export const listKeepers = () => view<KeeperRow[]>("list_keepers", { from_index: 0, limit: PAGE });
export const getJob = (id: number) => view<JobView | null>("get_job", { job_id: id });
export const getRound = (id: number) => view<Round>("get_round", { job_id: id });
export const getHistory = (id: number) => view<ExecutionRecord[]>("get_history", { job_id: id });

/** Contract errors look like "Mashpit: <Code>: <detail>" (SMART_CONTRACT_SPEC §6). */
export function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /Mashpit: ([A-Za-z]+)(?:: ([^\n"]+))?/.exec(msg);
  if (m) return m[2] ? `${m[1]}: ${m[2]}` : m[1];
  return msg.length > 180 ? `${msg.slice(0, 180)}…` : msg;
}
