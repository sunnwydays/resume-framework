import { ROLE_TYPE_ORDER, roleType } from "@/lib/tracker/roles";
import { REGION_ORDER } from "@/lib/tracker/postings/region";
import type { PostingView } from "@/lib/tracker/postings/view";

export type PostingSortKey = "posted" | "match" | "company" | "role" | "type" | "region";

export function postingSortValue({ posting, region }: PostingView, key: PostingSortKey): string | number | null {
  switch (key) {
    case "posted": {
      const t = new Date(posting.posted_at ?? posting.first_seen_at).getTime();
      return Number.isNaN(t) ? null : t;
    }
    case "match":
      return posting.match_pct;
    case "company":
      return posting.company;
    case "role":
      return posting.role;
    case "type":
      return ROLE_TYPE_ORDER[roleType(posting.role)];
    case "region":
      return REGION_ORDER[region.region];
  }
}
