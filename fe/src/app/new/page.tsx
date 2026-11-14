import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { NewJobForm } from "./new-job-form";

export const metadata: Metadata = { title: "Post a job · Mashpit" };

export default function NewJobPage() {
  return (
    <AppShell>
      <NewJobForm />
    </AppShell>
  );
}
