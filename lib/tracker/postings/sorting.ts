import { ROLE_TYPE_ORDER, roleType } from "@/lib/tracker/roles";
import { LEVEL_ORDER } from "@/lib/tracker/postings/level";
import { REGION_ORDER } from "@/lib/tracker/postings/region";
import type { PostingView } from "@/lib/tracker/postings/view";

export type PostingSortKey = "posted" | "level" | "company" | "role" | "type" | "region";

export function postingSortValue({ posting, region, level }: PostingView, key: PostingSortKey): string | number | null {
  switch (key) {
    case "posted": {
      const t = new Date(posting.posted_at ?? posting.first_seen_at).getTime();
      return Number.isNaN(t) ? null : t;
    }
    case "level":
      return LEVEL_ORDER[level.level];
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
