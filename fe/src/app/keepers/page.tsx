import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { KeepersView } from "./keepers-view";

export const metadata: Metadata = { title: "Keepers · Mashpit" };

export default function KeepersPage() {
  return (
    <AppShell>
      <KeepersView />
    </AppShell>
  );
}
