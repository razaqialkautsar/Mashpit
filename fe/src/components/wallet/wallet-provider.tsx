"use client";

import type { ReactNode } from "react";
import { NearProvider } from "near-connect-hooks";
import { near } from "@/lib/near";

// Module-level so the config identity is stable across renders: the provider
// memoizes its RPC provider on `config.providers`.
const config = {
  network: near.network,
  providers: { mainnet: [], testnet: [near.rpcUrl] },
};

export function WalletProvider({ children }: { children: ReactNode }) {
  return <NearProvider config={config}>{children}</NearProvider>;
}
