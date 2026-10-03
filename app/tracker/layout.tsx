import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Job Tracker",
  description: "Personal job application tracker.",
};

export default function TrackerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
      {children}
    </main>
  );
}
