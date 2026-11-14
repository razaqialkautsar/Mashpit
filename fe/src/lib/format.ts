import type { Schedule, Yocto } from "./types";

const YOCTO = BigInt("1000000000000000000000000"); // 10^24

/** yoctoNEAR → "0.05". BigInt only: a Number would lose digits at this scale. */
export function formatNear(yocto: Yocto | bigint, maxDecimals = 4): string {
  const v = typeof yocto === "bigint" ? yocto : BigInt(yocto);
  const whole = v / YOCTO;
  const frac = (v % YOCTO).toString().padStart(24, "0").slice(0, maxDecimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** "0.05" → yoctoNEAR string, or null when the input is not a valid amount. */
export function parseNear(input: string): string | null {
  const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec(input.trim());
  if (!m) return null;
  return (BigInt(m[1]) * YOCTO + BigInt((m[2] ?? "").padEnd(24, "0"))).toString();
}

export const BLOCK_SECONDS = 0.58; // measured on testnet, can drift

export function blocksToSeconds(blocks: number): number {
  return Math.round(blocks * BLOCK_SECONDS);
}

export function formatDuration(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return m < 90 ? `${m} min` : `${Math.round(m / 60)} h`;
}

/** "12 blocks (≈7s)". Negative counts are clamped to zero. */
export function formatBlocks(blocks: number): string {
  const b = Math.max(0, blocks);
  return `${b.toLocaleString("en-US")} blk (≈${formatDuration(blocksToSeconds(b))})`;
}

export const formatInt = (n: number) => n.toLocaleString("en-US");

/** "alice.testnet" stays whole; a 64-char implicit account becomes "a1b2c3…f9e8". */
export function shortAccount(id: string, max = 22): string {
  return id.length <= max ? id : `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export function scheduleLabel(s: Schedule): string {
  return s === "EveryEpoch" ? "Every epoch" : `Every ${formatInt(s.EveryBlocks.interval)} blocks`;
}

export function decodeArgs(base64: string): string {
  try {
    const text = new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
    return JSON.stringify(JSON.parse(text));
  } catch {
    return base64;
  }
}

export function encodeArgs(json: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify(JSON.parse(json)));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

/** Base64 sha256 → "9f3a…c21e". */
export function shortHash(base64: string): string {
  try {
    const hex = Array.from(atob(base64), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 4)}…${hex.slice(-4)}`;
  } catch {
    return base64.slice(0, 8);
  }
}

/** "k2.mashpit.testnet" → "k2"; "alice.testnet" → "al". Used for keeper avatars. */
export function initials(accountId: string): string {
  const head = accountId.split(".")[0];
  return head.length <= 3 ? head : head.slice(0, 2);
}

/** Decoded args as [key, value] pairs for a one-line summary, or null if not an object. */
export function argEntries(base64: string): [string, string][] | null {
  try {
    const v = JSON.parse(decodeArgs(base64));
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return Object.entries(v).map(([k, x]) => [k, typeof x === "string" ? x : JSON.stringify(x)]);
  } catch {
    return null;
  }
}

/** Pretty-printed args JSON for display. */
export function prettyArgs(base64: string): string {
  try {
    const v = JSON.parse(decodeArgs(base64));
    // { "validator_id": "aurora…" } on one line when short, indented otherwise.
    const flat = JSON.stringify(v, null, 1).replace(/\n\s*/g, " ");
    return flat.length <= 72 ? flat : JSON.stringify(v, null, 2);
  } catch {
    return base64;
  }
}
