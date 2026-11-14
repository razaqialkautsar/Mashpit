import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/app-shell";
import { LiveView } from "./live-view";

export const metadata: Metadata = { title: "Live arena · Mashpit" };

export default function LivePage() {
  return (
    <AppShell>
      {/* LiveView reads ?closed= with useSearchParams, which needs a Suspense boundary. */}
      <Suspense>
        <LiveView />
      </Suspense>
    </AppShell>
  );
}
