import type { Metadata } from "next";
import DemoShell from "@/components/tracker/demo/DemoShell";

// Outside proxy.ts's matcher on purpose: the demo is public, runs on fake data
// and never touches Supabase or /api/tracker.
export const metadata: Metadata = {
  title: "Job Tracker demo",
  description: "A read-only demo of the job tracker, with fake data.",
  robots: { index: false, follow: false },
};

export default function DemoTrackerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <DemoShell>{children}</DemoShell>;
}
