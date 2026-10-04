import { notFound } from "next/navigation";
import GmailInspector from "@/components/tracker/email/GmailInspector";

// Development tool for tuning the Gmail rules: never served in production,
// even after the rest of the tracker is deployed.
export default function GmailDebugPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GmailInspector />;
}
