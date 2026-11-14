import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { ProofView } from "./proof-view";

export const metadata: Metadata = { title: "Proof · Mashpit" };

export default function ProofPage() {
  return (
    <AppShell>
      <ProofView />
    </AppShell>
  );
}
