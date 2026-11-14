"use client";

import { useNearWallet } from "near-connect-hooks";
import { Wallet } from "lucide-react";
import { shortAccount } from "@/lib/format";
import { dismissed } from "@/lib/near";
import { buttonClasses } from "../landing/button";

/**
 * Connect / account chip. `compact` is the round icon-only button the phone
 * top bar uses; the account id then lives in its title and label.
 */
export function WalletButton({
  size = "sm",
  compact = false,
  className = "",
}: {
  size?: "sm" | "md";
  compact?: boolean;
  className?: string;
}) {
  const { loading, signedAccountId, signIn, signOut } = useNearWallet();

  if (compact) {
    const connected = !!signedAccountId;
    return (
      <button
        type="button"
        disabled={loading}
        onClick={() => (connected ? signOut() : signIn()).catch(dismissed)}
        aria-label={connected ? `${signedAccountId}, disconnect wallet` : "Connect wallet"}
        title={connected ? `${signedAccountId} · tap to disconnect` : "Connect wallet"}
        className={`grid size-10 place-items-center rounded-full transition-colors disabled:opacity-60 ${
          connected ? "bg-surface-3 text-ok" : "bg-accent text-accent-ink hover:bg-accent-hover"
        } ${className}`}
      >
        <Wallet aria-hidden="true" className="size-[18px]" />
      </button>
    );
  }

  if (signedAccountId) {
    return (
      <button
        type="button"
        onClick={() => signOut()}
        title={`${signedAccountId} · click to disconnect`}
        className={`${buttonClasses("ghost", size)} border-transparent bg-surface-3 hover:bg-surface-2 ${className}`}
      >
        <Wallet aria-hidden="true" className="size-4 text-ok" />
        {shortAccount(signedAccountId, 20)}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => signIn().catch(dismissed)}
      className={`${buttonClasses("primary", size)} disabled:opacity-60 ${className}`}
    >
      <Wallet aria-hidden="true" className="size-4" />
      <span className="max-[380px]:sr-only">Connect wallet</span>
    </button>
  );
}
