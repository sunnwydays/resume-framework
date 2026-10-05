import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL(".", import.meta.url)) };

// Much of the tracker works in local calendar days, so the unit tests run in
// a zone with DST (Toronto) and the date-heavy ones again in a zone far ahead
// of UTC, where "today" differs from the UTC date for half the day.
const DATE_SENSITIVE = [
  "tests/unit/tz.test.ts",
  "tests/unit/format.test.ts",
  "tests/unit/stats.test.ts",
  "tests/unit/filters.test.ts",
  "tests/unit/priority.test.ts",
  "tests/unit/import-parsers.test.ts",
  "tests/unit/import-plan.test.ts",
  "tests/unit/import-roundtrip.test.ts",
  "tests/unit/email-rules.test.ts",
  "tests/unit/email-group.test.ts",
  "tests/unit/email-review.test.ts",
  "tests/unit/email-scan.test.ts",
  "tests/unit/arbitrage.test.ts",
  "tests/unit/next-steps.test.ts",
  "tests/unit/postings-list.test.ts",
];

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          env: { TZ: "America/Toronto" },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "unit-tz",
          include: DATE_SENSITIVE,
          env: { TZ: "Pacific/Auckland" },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          env: { TZ: "America/Toronto" },
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/mocks/**", "lib/samples/**", "lib/tracker/database.types.ts", "lib/supabase/**"],
    },
  },
});
