"use client";

import { PRESETS } from "@/lib/prompts";
import { MODELS, type PresetKey, type Settings } from "@/lib/types";

interface Props {
  settings: Settings;
  onChange: (next: Settings) => void;
  disabled: boolean;
}

function Slider({
  label,
  low,
  high,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  low: string;
  high: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs font-medium mb-1">
        <span>{label}</span>
        {hint && <span className="text-amber-600">{hint}</span>}
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-600"
      />
      <div className="flex justify-between text-[11px] text-neutral-500">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

export default function ConfigPanel({ settings, onChange, disabled }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  const inputCls =
    "w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm";

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium mb-1">
          Anthropic API key
        </label>
        <input
          type="password"
          className={inputCls}
          placeholder="sk-ant-..."
          value={settings.apiKey}
          disabled={disabled}
          onChange={(e) => set("apiKey", e.target.value)}
        />
        <p className="text-[11px] text-neutral-500 mt-1">
          Stored in your browser only; sent only to the Anthropic API.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Model</label>
          <select
            className={inputCls}
            value={settings.model}
            disabled={disabled}
            onChange={(e) => set("model", e.target.value)}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">
            Industry preset
          </label>
          <select
            className={inputCls}
            value={settings.preset}
            disabled={disabled}
            onChange={(e) => set("preset", e.target.value as PresetKey)}
          >
            {Object.entries(PRESETS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">
          Vibe / tone prompt{" "}
          <span className="font-normal text-neutral-500">
            (default: “{PRESETS[settings.preset].vibeSeed}”)
          </span>
        </label>
        <textarea
          className={inputCls}
          rows={2}
          placeholder="e.g. Confident but understated, no buzzwords"
          value={settings.vibePrompt}
          disabled={disabled}
          onChange={(e) => set("vibePrompt", e.target.value)}
        />
      </div>

      <div className="space-y-4 border-t border-neutral-200 dark:border-neutral-800 pt-4">
        <Slider
          label="Detail"
          low="More descriptive"
          high="More focused"
          value={settings.descriptiveFocused}
          disabled={disabled}
          onChange={(v) => set("descriptiveFocused", v)}
        />
        <Slider
          label="Honesty"
          low="True to life"
          high="Fabricated"
          value={settings.honesty}
          disabled={disabled}
          onChange={(v) => set("honesty", v)}
          hint={
            settings.honesty >= 0.67
              ? "⚠ fabrication unlocked"
              : settings.honesty >= 0.34
                ? "stretching allowed"
                : undefined
          }
        />
        <Slider
          label="Voice"
          low="Formal"
          high="Conversational"
          value={settings.formalConversational}
          disabled={disabled}
          onChange={(v) => set("formalConversational", v)}
        />
        <Slider
          label="Risk"
          low="Safe"
          high="Bold"
          value={settings.safeBold}
          disabled={disabled}
          onChange={(v) => set("safeBold", v)}
        />
      </div>

      <div className="space-y-2 border-t border-neutral-200 dark:border-neutral-800 pt-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.noEmDashes}
            disabled={disabled}
            onChange={(e) => set("noEmDashes", e.target.checked)}
          />
          No em-dashes
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.noSemicolons}
            disabled={disabled}
            onChange={(e) => set("noSemicolons", e.target.checked)}
          />
          No semicolons
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.maxBulletLength !== null}
            disabled={disabled}
            onChange={(e) =>
              set("maxBulletLength", e.target.checked ? 160 : null)
            }
          />
          Max bullet length
          {settings.maxBulletLength !== null && (
            <input
              type="number"
              min={40}
              max={500}
              className="w-20 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-1 py-0.5 text-xs"
              value={settings.maxBulletLength}
              disabled={disabled}
              onChange={(e) =>
                set("maxBulletLength", parseInt(e.target.value) || 160)
              }
            />
          )}
        </label>
        <div>
          <label className="block text-xs font-medium mb-1 mt-2">
            Custom style rule
          </label>
          <textarea
            className={inputCls}
            rows={2}
            placeholder="e.g. Never start two consecutive bullets with the same verb"
            value={settings.customRule}
            disabled={disabled}
            onChange={(e) => set("customRule", e.target.value)}
          />
        </div>
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
        <label className="block text-xs font-medium mb-1">
          Max iterations: {settings.maxIterations}
        </label>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={settings.maxIterations}
          disabled={disabled}
          onChange={(e) => set("maxIterations", parseInt(e.target.value))}
          className="w-full accent-indigo-600"
        />
      </div>

      <details className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
        <summary className="text-xs font-medium cursor-pointer">
          Custom system prompt (advanced)
        </summary>
        <textarea
          className={`${inputCls} mt-2`}
          rows={6}
          placeholder="Replaces the default Reviser + Sentiment Checker instructions. Recruiter gating, sliders, and style rules still apply on top."
          value={settings.userSystemPrompt}
          disabled={disabled}
          onChange={(e) => set("userSystemPrompt", e.target.value)}
        />
      </details>
    </div>
  );
}
