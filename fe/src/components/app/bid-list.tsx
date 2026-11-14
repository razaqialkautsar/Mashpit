import { ArrowDown, Lock, Sparkles } from "lucide-react";
import { formatNear, shortHash } from "@/lib/format";
import type { Round } from "@/lib/types";
import { AccountLink, Avatar } from "./ui";

export type Bid = {
  keeper: string;
  offset: number; // blocks after the round opened
  bond: string;
  hash?: string;
  bid?: string; // yocto, once revealed
  memo?: string | null;
  leading: boolean;
};

/** Commits joined with their reveals; the leader is the winner, or the lowest revealed bid. */
export function bidsOf(round: Round): Bid[] {
  const reveals = new Map(round.reveals.map((r) => [r.keeper, r]));
  const lowest = [...round.reveals].sort((a, b) =>
    BigInt(a.bid) === BigInt(b.bid) ? a.commit_block - b.commit_block : BigInt(a.bid) < BigInt(b.bid) ? -1 : 1,
  )[0]?.keeper;
  const leader = round.winner?.keeper ?? lowest;
  return round.commits
    .map((c) => {
      const r = reveals.get(c.keeper);
      return {
        keeper: c.keeper,
        offset: c.block - round.opened_at,
        bond: c.bond,
        hash: c.hash,
        bid: r?.bid,
        memo: r?.memo,
        leading: c.keeper === leader,
      };
    })
    .sort((a, b) => Number(!!b.bid) - Number(!!a.bid) || (a.bid && b.bid ? (BigInt(a.bid) < BigInt(b.bid) ? -1 : 1) : a.offset - b.offset));
}

/** Bid rows as the Live page shows them: avatar, account, memo, amount on the right. */
export function BidList({ bids, winner }: { bids: Bid[]; winner: boolean }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {bids.map((b) => (
        <li key={b.keeper} className="flex gap-3.5 py-5 sm:gap-4">
          <Avatar id={b.keeper} hot={b.leading} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <AccountLink id={b.keeper} className="text-sm font-semibold text-ink" />
              <span className="hidden text-xs text-ink-3 sm:inline">committed +{b.offset} blocks</span>
              {b.leading && b.bid && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-hover">
                  <ArrowDown aria-hidden="true" className="size-3" /> {winner ? "Winner" : "Lowest"}
                </span>
              )}
            </p>
            {b.bid ? (
              b.memo ? (
                // Keeper-written text: rendered as plain text only (FE-NFR-5).
                <p className="mt-2 flex gap-2 text-sm text-ink-2 sm:text-[15px]">
                  <Sparkles aria-hidden="true" className="mt-1 hidden size-3.5 shrink-0 text-amber sm:block" />
                  <q className="break-words">{b.memo}</q>
                </p>
              ) : (
                <p className="mt-2 text-sm text-ink-3">Revealed without a memo.</p>
              )
            ) : (
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-3">
                <Lock aria-hidden="true" className="size-3.5 shrink-0" />
                {b.hash ? `Hash ${shortHash(b.hash)} · ` : "Sealed · "}{formatNear(b.bond)} NEAR bond forfeits to the job if not revealed
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            {b.bid ? (
              <>
                <p className={`font-display text-xl leading-none sm:text-[26px] ${b.leading ? "text-glow" : "text-ink"}`}>
                  {formatNear(b.bid)}
                </p>
                <p className="mt-1.5 text-xs text-ink-3">NEAR</p>
              </>
            ) : (
              <>
                <p className="font-display text-base text-ink-3 sm:text-lg">Sealed</p>
                <p className="mt-1 hidden text-xs text-ink-3 sm:block">reveals soon</p>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
