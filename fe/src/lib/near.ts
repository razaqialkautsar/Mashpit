// Public NEAR config, read from NEXT_PUBLIC_* (see .env.example).
const network = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

export const near = {
  network,
  contractId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "contract.mashpit.testnet",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://test.rpc.fastnear.com",
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet.nearblocks.io",
} as const;

export const accountUrl = (accountId: string) => `${near.explorerUrl}/address/${accountId}`;

/** Closing the wallet picker or rejecting in the wallet rejects the promise; nothing to report. */
export const dismissed = () => {};
