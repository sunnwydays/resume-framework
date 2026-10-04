"use client";

import StatsPanel from "@/components/tracker/stats/StatsPanel";
import {
  formatMultiplier,
  formatRate,
  type ExchangeRates,
  type RateRow,
} from "@/lib/tracker/arbitrage";
import { channelLabel, formatHours } from "@/lib/tracker/format";

interface Props {
  rates: ExchangeRates;
  minutesPerApp: number;
  onMinutesPerApp: (n: number) => void;
}

function Row({ label, row, strong, muted }: { label: React.ReactNode; row: RateRow; strong?: boolean; muted?: boolean }) {
  return (
    <tr className={`${strong ? "font-medium" : ""} ${muted ? "text-neutral-500" : ""}`}>
      <td className="py-1.5 pr-3">{label}</td>
      <td className="px-3 text-right tabular-nums">{row.moves}</td>
      <td className="px-3 text-right tabular-nums">{formatHours(row.minutes * 60)}</td>
      <td className="px-3 text-right tabular-nums">{formatRate(row.replies, row.minutes)}</td>
      <td className="px-3 text-right tabular-nums">{formatRate(row.conversations, row.minutes)}</td>
      <td className="pl-3 text-right tabular-nums">{formatRate(row.positives, row.minutes)}</td>
    </tr>
  );
}

// Reward per hour by channel, against what the same hours would have bought
// cold applying. The baseline uses a flat time per application, since
// applications aren't timed individually.
export default function ExchangeRate({ rates, minutesPerApp, onMinutesPerApp }: Props) {
  const m = rates.multiplier;
  const headline = m
    ? `${formatMultiplier(m.value)} the ${m.basis === "positives" ? "positive responses" : "replies"} per hour of cold applying`
    : null;

  return (
    <StatsPanel id="arbitrage-exchange-rate" title="Exchange rate" summary={headline ?? "reward per hour by channel"}>
      {headline ? (
        <p className="text-sm">
          Your arbitrage moves are getting{" "}
          <span className="text-lg font-semibold text-blue-800 dark:text-blue-300">{formatMultiplier(m!.value)}</span>{" "}
          the {m!.basis === "positives" ? "positive responses" : "replies"} per hour of cold applying.
        </p>
      ) : (
        <p className="text-sm text-neutral-500">
          Log a few moves with their time and this compares them to cold applying.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
              <th className="py-1.5 pr-3 font-medium">Channel</th>
              <th className="px-3 text-right font-medium">Moves</th>
              <th className="px-3 text-right font-medium">Time</th>
              <th className="px-3 text-right font-medium">Replies</th>
              <th className="px-3 text-right font-medium">Conversations</th>
              <th className="pl-3 text-right font-medium">Positive</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {rates.channels.map((c) => (
              <Row key={c.channel} label={channelLabel(c.channel)} row={c} />
            ))}
            {rates.channels.length > 1 && <Row label="All arbitrage" row={rates.arbitrage} strong />}
            <Row
              muted
              row={rates.cold}
              label={
                <span className="flex flex-wrap items-center gap-1">
                  Cold applying at
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={minutesPerApp}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isInteger(n) && n >= 1 && n <= 600) onMinutesPerApp(n);
                    }}
                    aria-label="Minutes per application"
                    className="w-14 rounded border border-neutral-300 bg-surface px-1.5 py-0.5 text-right tabular-nums text-foreground dark:border-neutral-700"
                  />
                  min/app
                </span>
              }
            />
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        Rates are per hour of logged time. For cold applications, a reply is any response (rejections included)
        and positive means it reached an OA or further. Applications linked to a move count toward that move instead.
      </p>
    </StatsPanel>
  );
}
