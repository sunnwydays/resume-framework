import type { TablesInsert } from "@/lib/tracker/database.types";
import { todayISO, type JobPosting } from "@/lib/tracker/format";
import { trimRole, type RoleTrimOptions } from "@/lib/tracker/trimRole";

// The application row "Applied" adds for a posting (pass the edited posting).
// The description is kept because the Jobright page it came from disappears;
// "" (read, nothing to keep) and null (not read) both become null.
export function applicationFromPosting(posting: JobPosting, trims: RoleTrimOptions): TablesInsert<"applications"> {
  return {
    company: posting.company,
    role: trimRole(posting.role, trims),
    location: posting.location,
    url: posting.url,
    description: posting.description || null,
    applied_on: todayISO(),
    status: "applied",
    source: "alert",
  };
}
