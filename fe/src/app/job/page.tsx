import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/app/ui";
import { routes } from "@/lib/routes";
import { JobView } from "./job-view";

export const metadata: Metadata = { title: "Job · Mashpit" };

// ?id=<n>: a static export cannot know job ids at build time (FRONTEND_SPEC §3.1),
// so the id is read on the client. useSearchParams needs this Suspense boundary.
export default function JobPage() {
  return (
    <AppShell back={{ href: routes.live, label: "Job", withId: true }} hideTabs>
      <Suspense fallback={<Skeleton className="h-[480px]" />}>
        <JobView />
      </Suspense>
    </AppShell>
  );
}
