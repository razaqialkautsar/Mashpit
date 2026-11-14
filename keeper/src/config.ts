// Keeper configuration, read from environment variables (see .env.example).
// Secrets (private key, salt secret, AI key) only ever come from the environment.

export type Strategy = "aggressive" | "balanced" | "conservative";

export interface Config {
  network: string;
  rpcUrls: string[];
  contractId: string;
  accountId: string;
  privateKey: `ed25519:${string}`;
  secret: string;
  strategy: Strategy;
  pollMs: number;
  // Demo switch: keep bidding but never execute, so the contract slashes this keeper.
  skipExecute: boolean;
  // Drain mode: finish pending reveals and executions, but never commit to a new round.
  // Use it before stopping a keeper so no committed bond is left unrevealed.
  noNewBids: boolean;
  // Jobs this keeper stops bidding on (it still reveals and executes what it already committed).
  drainJobs: Set<number>;
  funds: {
    low: bigint; // withdraw rewards below this balance
    critical: bigint; // stop committing new bids below this balance
    minWithdraw: bigint; // smallest reward worth a withdraw_rewards call
    checkMs: number;
  };
  ai: {
    apiKey?: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
  };
}

/** "0.1" -> yoctoNEAR. */
function nearToYocto(near: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec(near.trim());
  if (!m) throw new Error(`Not a NEAR amount: ${near}`);
  return BigInt(m[1]) * 10n ** 24n + BigInt((m[2] ?? "").padEnd(24, "0"));
}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function loadConfig(): Config {
  const privateKey = required("KEEPER_PRIVATE_KEY");
  if (!privateKey.startsWith("ed25519:")) {
    throw new Error("KEEPER_PRIVATE_KEY must look like ed25519:...");
  }
  const secret = required("KEEPER_SECRET");
  if (secret.length < 16) throw new Error("KEEPER_SECRET must be at least 16 characters");

  const strategy = optional("KEEPER_STRATEGY", "balanced");
  if (!["aggressive", "balanced", "conservative"].includes(strategy)) {
    throw new Error(`KEEPER_STRATEGY must be aggressive, balanced or conservative, got ${strategy}`);
  }

  return {
    network: optional("NEAR_NETWORK", "testnet"),
    rpcUrls: optional("RPC_URLS", "https://test.rpc.fastnear.com,https://rpc.testnet.near.org")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    contractId: optional("CONTRACT_ID", "contract.mashpit.testnet"),
    accountId: required("KEEPER_ACCOUNT_ID"),
    privateKey: privateKey as `ed25519:${string}`,
    secret,
    strategy: strategy as Strategy,
    pollMs: Number(optional("POLL_MS", "3000")),
    skipExecute: optional("KEEPER_SKIP_EXECUTE", "false") === "true",
    noNewBids: optional("KEEPER_DRAIN", "false") === "true",
    drainJobs: new Set(
      optional("KEEPER_DRAIN_JOBS", "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter(Number.isInteger),
    ),
    funds: {
      low: nearToYocto(optional("LOW_BALANCE_NEAR", "0.1")),
      critical: nearToYocto(optional("CRITICAL_BALANCE_NEAR", "0.03")),
      minWithdraw: nearToYocto(optional("MIN_WITHDRAW_NEAR", "0.01")),
      checkMs: Number(optional("FUNDS_CHECK_MS", "300000")),
    },
    ai: {
      apiKey: process.env.NEAR_AI_API_KEY?.trim() || undefined,
      baseUrl: optional("NEAR_AI_BASE_URL", "https://cloud-api.near.ai/v1"),
      model: optional("NEAR_AI_MODEL", ""),
      timeoutMs: Number(optional("NEAR_AI_TIMEOUT_MS", "15000")),
    },
  };
}
