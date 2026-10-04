"use client";

import { useMemo, useState } from "react";
import ApplicationPicker from "@/components/tracker/ApplicationPicker";
import Chip from "@/components/tracker/Chip";
import { DEFAULT_MOVE_MINUTES, effectiveStage, stagePatch, type AppContext } from "@/lib/tracker/arbitrage";
import {
  MOVE_CHANNELS,
  MOVE_STAGES,
  MOVE_STAGE_META,
  buttonCls,
  channelLabel,
  formatDate,
  formatHours,
  inputCls,
  isOutreach,
  moveStageLabel,
  parseDuration,
  primaryButtonCls,
  type Application,
  type Move,
  type MoveChannel,
  type MoveStage,
} from "@/lib/tracker/format";
import type { ApplicationOption } from "@/lib/tracker/io";
import type { MovesStore } from "@/lib/tracker/useMoves";

type Filter = "open" | "mine" | "closed" | "all";

const TIME_PRESETS = [5, 15, 30, 60, 180];

const presetLabel = (m: number) => (m >= 60 ? `${m / 60}h` : `${m}m`);

interface Props {
  moves: Move[];
  applications: Application[];
  ctx: AppContext;
  store: MovesStore;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onDraftFollowUp: (move: Move) => void;
  // Bumped by "Log a project" in next steps to preselect the quick-log form.
  quickLogChannel: MoveChannel;
}

function QuickLog({ store, initialChannel }: { store: MovesStore; initialChannel: MoveChannel }) {
  const [channel, setChannel] = useState<MoveChannel>(initialChannel);
  const [target, setTarget] = useState("");
  const [minutes, setMinutes] = useState(DEFAULT_MOVE_MINUTES[initialChannel]);
  const [custom, setCustom] = useState("");
  const customMinutes = custom.trim() ? parseDuration(custom) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target.trim()) return;
    const total = customMinutes !== null ? Math.round(customMinutes / 60) : minutes;
    const row = await store.addMove({ channel, target: target.trim(), minutes: total });
    if (row) {
      setTarget("");
      setCustom("");
    }
  }

  return (
    <form id="quick-log" onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <select
        value={channel}
        onChange={(e) => {
          const c = e.target.value as MoveChannel;
          setChannel(c);
          setMinutes(DEFAULT_MOVE_MINUTES[c]);
        }}
        aria-label="Channel"
        className={`${inputCls} w-auto`}
      >
        {(Object.keys(MOVE_CHANNELS) as MoveChannel[]).map((c) => (
          <option key={c} value={c}>
            {MOVE_CHANNELS[c].label}
          </option>
        ))}
      </select>
      <input
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder={isOutreach(channel) ? "Who (e.g. Priya (Acme))" : "What (e.g. Acme search demo)"}
        aria-label="Who or what"
        className={`${inputCls} min-w-40 flex-1`}
      />
      <div className="flex flex-wrap gap-1" role="group" aria-label="Time spent">
        {TIME_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMinutes(m);
              setCustom("");
            }}
            aria-pressed={customMinutes === null && minutes === m}
            className={`rounded-md border px-2 py-1 text-xs tabular-nums ${
              customMinutes === null && minutes === m
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            {presetLabel(m)}
          </button>
        ))}
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="other"
          aria-label="Other time (e.g. 45m, 2h)"
          className={`w-16 rounded-md border px-1.5 py-1 text-xs ${
            custom.trim() && customMinutes === null ? "border-red-400" : "border-neutral-300 dark:border-neutral-700"
          } bg-surface`}
        />
      </div>
      <button type="submit" disabled={!target.trim() || (custom.trim() !== "" && customMinutes === null)} className={primaryButtonCls}>
        Log
      </button>
    </form>
  );
}

function MoveRow({
  move,
  stage,
  expanded,
  onToggle,
  store,
  appOptions,
  linkedApp,
  onDraftFollowUp,
}: {
  move: Move;
  stage: MoveStage;
  expanded: boolean;
  onToggle: () => void;
  store: MovesStore;
  appOptions: ApplicationOption[];
  linkedApp: Application | undefined;
  onDraftFollowUp: (move: Move) => void;
}) {
  const outreach = isOutreach(move.channel);
  const [customTime, setCustomTime] = useState("");
  const parsedTime = customTime.trim() ? parseDuration(customTime) : null;
  const lifted = stage !== move.stage;

  return (
    <li id={`move-${move.id}`} className={`scroll-mt-24 py-2.5 ${move.closed ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 basis-56 items-baseline gap-2 text-left"
        >
          <span className="inline-block w-3 shrink-0 text-neutral-400">{expanded ? "▾" : "▸"}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{move.target}</span>
            <span className="block text-xs text-neutral-500">
              {channelLabel(move.channel)} · {formatDate(move.created_at)}
              {move.follow_ups > 0 && ` · ${move.follow_ups} follow-up${move.follow_ups === 1 ? "" : "s"}`}
              {linkedApp && ` · → ${linkedApp.company}`}
            </span>
          </span>
        </button>

        <select
          value={move.stage}
          onChange={(e) => store.updateMove(move.id, stagePatch(move, e.target.value as MoveStage))}
          aria-label="Stage"
          title={lifted ? `Its linked application reached ${MOVE_STAGE_META[stage].label.toLowerCase()}` : MOVE_STAGE_META[move.stage as MoveStage]?.hint}
          className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium ${MOVE_STAGE_META[stage].cls}`}
        >
          {MOVE_STAGES.map((s) => (
            <option key={s} value={s}>
              {moveStageLabel(s, move.channel)}
              {lifted && s === move.stage ? ` (app: ${MOVE_STAGE_META[stage].label})` : ""}
            </option>
          ))}
        </select>

        {outreach && !move.closed && (
          <button
            type="button"
            onClick={() => (move.waiting_on === "me" ? store.followUp(move) : store.updateMove(move.id, { waiting_on: "me" }))}
            title={move.waiting_on === "me" ? "Mark that you've replied" : "They wrote back: your turn"}
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              move.waiting_on === "me"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "bg-neutral-100 text-neutral-500 dark:bg-neutral-900"
            }`}
          >
            {move.waiting_on === "me" ? "Your turn" : "Waiting on them"}
          </button>
        )}

        <span className="w-14 text-right text-xs tabular-nums text-neutral-500">{formatHours(move.minutes * 60)}</span>

        <div className="flex gap-1">
          {outreach && !move.closed && move.waiting_on === "them" && (
            <button type="button" onClick={() => onDraftFollowUp(move)} className={`${buttonCls} px-2! py-1! text-xs!`}>
              Follow up
            </button>
          )}
          <button
            type="button"
            onClick={() => store.updateMove(move.id, { closed: !move.closed })}
            className={`${buttonCls} px-2! py-1! text-xs!`}
          >
            {move.closed ? "Reopen" : "Close"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 ml-5 space-y-3 rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-900/50">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-neutral-500">Add time:</span>
            {TIME_PRESETS.map((m) => (
              <button key={m} type="button" onClick={() => store.addMinutes(move.id, m)} className={`${buttonCls} px-2! py-0.5! text-xs!`}>
                +{presetLabel(m)}
              </button>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (parsedTime === null) return;
                store.addMinutes(move.id, Math.round(parsedTime / 60));
                setCustomTime("");
              }}
              className="flex gap-1"
            >
              <input
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                placeholder="45m"
                aria-label="Add other time"
                className="w-16 rounded-md border border-neutral-300 bg-surface px-1.5 py-0.5 text-xs dark:border-neutral-700"
              />
              <button type="submit" disabled={parsedTime === null} className={`${buttonCls} px-2! py-0.5! text-xs!`}>
                Add
              </button>
            </form>
            {move.minutes > 0 && (
              <button
                type="button"
                onClick={() => store.updateMove(move.id, { minutes: 0 })}
                className="text-xs text-neutral-500 underline"
              >
                reset
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-neutral-500">
              Who / what
              <input
                defaultValue={move.target}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== move.target) store.updateMove(move.id, { target: v });
                }}
                className={`${inputCls} mt-1 font-normal text-foreground`}
              />
            </label>
            <label className="block text-xs font-medium text-neutral-500">
              Link
              <span className="mt-1 flex gap-1">
                <input
                  defaultValue={move.link ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== move.link) store.updateMove(move.id, { link: v });
                  }}
                  placeholder="https://…"
                  className={`${inputCls} font-normal text-foreground`}
                />
                {move.link && /^https?:\/\//.test(move.link) && (
                  <a href={move.link} target="_blank" rel="noopener noreferrer" className={`${buttonCls} shrink-0`}>
                    Open
                  </a>
                )}
              </span>
            </label>
          </div>

          <div className="space-y-1">
            <span className="block text-xs font-medium text-neutral-500">Led to an application</span>
            <ApplicationPicker
              value={move.application_id ?? ""}
              options={appOptions}
              company={move.target}
              role=""
              emptyLabel="Link an application…"
              clearLabel="Unlink"
              optional
              onChange={(v) => store.updateMove(move.id, { application_id: v || null })}
            />
          </div>

          {move.message && (
            <div>
              <span className="block text-xs font-medium text-neutral-500">Message sent</span>
              <p className="mt-1 whitespace-pre-wrap rounded border border-neutral-200 bg-surface p-2 text-sm dark:border-neutral-800">
                {move.message}
              </p>
            </div>
          )}

          <label className="block text-xs font-medium text-neutral-500">
            Notes
            <textarea
              rows={3}
              defaultValue={move.notes ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== move.notes) store.updateMove(move.id, { notes: v });
              }}
              placeholder="What they said, what to bring up next time…"
              className={`${inputCls} mt-1 font-normal text-foreground`}
            />
          </label>

          <button
            type="button"
            onClick={() => {
              if (confirm(`Delete the move “${move.target}”?`)) store.deleteMove(move.id);
            }}
            className="text-xs text-red-600 underline dark:text-red-400"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

// Every move, with a quick-log form for ones that don't start in the
// workshop (a project, an event, a message sent elsewhere).
export default function MovesList({
  moves,
  applications,
  ctx,
  store,
  expandedId,
  onToggle,
  onDraftFollowUp,
  quickLogChannel,
}: Props) {
  const [filter, setFilter] = useState<Filter>("open");
  const appOptions = useMemo<ApplicationOption[]>(
    () => applications.map((a) => ({ value: a.id, company: a.company, role: a.role, isNew: false })),
    [applications]
  );

  const counts = {
    open: moves.filter((m) => !m.closed).length,
    mine: moves.filter((m) => !m.closed && m.waiting_on === "me").length,
    closed: moves.filter((m) => m.closed).length,
    all: moves.length,
  };
  const visible = moves.filter((m) =>
    filter === "open" ? !m.closed : filter === "mine" ? !m.closed && m.waiting_on === "me" : filter === "closed" ? m.closed : true
  );
  // A move the next steps point at is always shown, whatever the filter.
  if (expandedId && !visible.some((m) => m.id === expandedId)) {
    const m = moves.find((x) => x.id === expandedId);
    if (m) visible.unshift(m);
  }

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 bg-surface p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Moves</h2>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={filter === "open"} onClick={() => setFilter("open")} label="Open" count={counts.open} />
          <Chip active={filter === "mine"} onClick={() => setFilter("mine")} label="Your turn" count={counts.mine} />
          <Chip active={filter === "closed"} onClick={() => setFilter("closed")} label="Closed" count={counts.closed} />
          <Chip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={counts.all} />
        </div>
      </div>

      <QuickLog key={quickLogChannel} store={store} initialChannel={quickLogChannel} />

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">
          {moves.length === 0 ? "No moves yet. Write a message in the workshop above, or log one here." : "Nothing here."}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
          {visible.map((m) => (
            <MoveRow
              key={m.id}
              move={m}
              stage={effectiveStage(m, ctx)}
              expanded={expandedId === m.id}
              onToggle={() => onToggle(m.id)}
              store={store}
              appOptions={appOptions}
              linkedApp={m.application_id ? ctx.appsById.get(m.application_id) : undefined}
              onDraftFollowUp={onDraftFollowUp}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
