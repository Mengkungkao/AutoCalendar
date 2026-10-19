"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  PROVIDER_CHOICES,
  PROVIDER_LABELS,
  TRAVEL_STYLES,
  settingsSchema,
  type Provider,
  type Settings,
} from "@/lib/settings";

type Props = {
  settings: Settings;
  providers: Record<Provider, boolean>;
  automaticProvider: Provider | null;
  onClose: () => void;
  onSaved: (settings: Settings) => void;
};

type Form = {
  name: string;
  shiftTitle: string;
  venueName: string;
  venueAddress: string;
  travelTitle: string;
  travelStyle: Settings["travelStyle"];
  travelMinutes: string;
  reminders: { enabled: boolean; minutes: string; message: string }[];
  timeZone: string;
  includeFunctionCodes: boolean;
  provider: Settings["provider"];
};

const REMINDER_SLOTS = 2;

function toForm(settings: Settings): Form {
  return {
    ...settings,
    travelMinutes: String(settings.travelMinutes),
    reminders: Array.from({ length: REMINDER_SLOTS }, (_, index) => {
      const reminder = settings.reminders[index] ?? DEFAULT_SETTINGS.reminders[index];
      return { enabled: index < settings.reminders.length, minutes: String(reminder.minutes), message: reminder.message };
    }),
  };
}

function fromForm(form: Form): unknown {
  return {
    ...form,
    travelMinutes: Number(form.travelMinutes),
    reminders: form.reminders
      .filter((reminder) => reminder.enabled)
      .map((reminder) => ({ minutes: Number(reminder.minutes), message: reminder.message })),
  };
}

function Group({ title, footer, children }: { title: string; footer?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 px-4 text-[13px] uppercase tracking-wide text-ink3">{title}</h3>
      <div className="divide-y divide-line overflow-hidden rounded-xl bg-card">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[13px] leading-snug text-ink3">{footer}</p>}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-h-11 items-center gap-3 px-4">
      <span className="w-[112px] shrink-0 text-[15px]">{label}</span>
      {children}
    </label>
  );
}

/** For longer text: the label sits above a full-width field so nothing is cut off. */
function StackedField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block px-4 pb-1 pt-2.5">
      <span className="block text-[13px] text-ink2">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "h-11 min-w-0 flex-1 bg-transparent text-right text-ink outline-none placeholder:text-ink3";

const TRAVEL_PRESETS = [15, 20, 30, 45, 60];
const TRAVEL_STYLE_LABELS: Record<Settings["travelStyle"], string> = {
  combined: "In the shift event",
  separate: "Separate event",
};

/** Travel minutes: − / + in steps of 5, presets, and typing for anything else. */
function TravelTime({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const minutes = Number(value);
  const step = (delta: number) =>
    onChange(String(Math.min(240, Math.max(5, (Number.isFinite(minutes) ? Math.round(minutes / 5) * 5 : 30) + delta))));
  const round = "flex size-11 shrink-0 items-center justify-center rounded-full bg-fill text-[22px] font-medium text-accent disabled:opacity-40";
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[15px]">Travel time</span>
        <button type="button" onClick={() => step(-5)} disabled={minutes <= 5} aria-label="5 minutes less" className={round}>
          −
        </button>
        <label className="flex items-baseline gap-1">
          <input
            className="h-11 w-12 bg-transparent text-center text-[20px] font-semibold text-ink outline-none"
            type="number"
            inputMode="numeric"
            min={5}
            max={240}
            step={5}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Travel time in minutes"
          />
          <span className="text-[15px] text-ink2">min</span>
        </label>
        <button type="button" onClick={() => step(5)} disabled={minutes >= 240} aria-label="5 minutes more" className={round}>
          +
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {TRAVEL_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(String(preset))}
            aria-pressed={minutes === preset}
            className={`h-9 rounded-full px-3.5 text-[15px] font-medium ${minutes === preset ? "bg-accent text-white" : "bg-fill text-ink"}`}
          >
            {preset} min
          </button>
        ))}
      </div>
    </div>
  );
}
const stackedInputClass = "h-10 w-full bg-transparent text-ink outline-none placeholder:text-ink3";

function providerFooter(providers: Record<Provider, boolean>, automatic: Provider | null): string {
  const auto = automatic ? `Automatic uses ${PROVIDER_LABELS[automatic]}. ` : "";
  if (providers.anthropic && providers.openai) return `${auto}Both are set up on this server, so you can compare them on the same roster.`;
  if (providers.anthropic) return `${auto}Only Claude is set up on this server; add OPENAI_API_KEY to use OpenAI.`;
  if (providers.openai) return `${auto}Only OpenAI is set up on this server; add ANTHROPIC_API_KEY to use Claude.`;
  return "No API key is set on this server yet: add ANTHROPIC_API_KEY or OPENAI_API_KEY (see the README).";
}

export function SettingsSheet({ settings, providers, automaticProvider, onClose, onSaved }: Props) {
  const [form, setForm] = useState(() => toForm(settings));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const zones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return all.includes(form.timeZone) ? all : [form.timeZone, ...all];
  }, [form.timeZone]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setReminder = (index: number, changes: Partial<Form["reminders"][number]>) =>
    setForm((current) => ({
      ...current,
      reminders: current.reminders.map((reminder, i) => (i === index ? { ...reminder, ...changes } : reminder)),
    }));

  async function save() {
    const parsed = settingsSchema.safeParse(fromForm(form));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the settings.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const body = (await response.json().catch(() => null)) as { settings?: Settings; error?: string } | null;
      if (!response.ok || !body?.settings) {
        setError(body?.error ?? "Settings couldn't be saved. Try again.");
        setSaving(false);
        return;
      }
      onSaved(body.settings);
    } catch {
      setError("No connection. Settings weren't saved.");
      setSaving(false);
    }
  }

  async function signOut() {
    try {
      sessionStorage.clear();
    } catch {
      // nothing stored
    }
    await fetch("/api/logout", { method: "POST" }).catch(() => null);
    window.location.replace("/login");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-bg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-line bg-bg px-2 py-1.5">
          <button type="button" onClick={onClose} className="h-11 px-3 text-[17px] text-accent">
            Cancel
          </button>
          <h2 id="settings-title" className="text-[17px] font-semibold">
            Settings
          </h2>
          <button type="button" onClick={save} disabled={saving} className="h-11 px-3 text-[17px] font-semibold text-accent disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),24px)] pt-5">
          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
              {error}
            </p>
          )}

          <Group title="Roster" footer="Your row is the one with this name, ignoring capitals and anything in brackets: Meng matches “Meng (PT)”. Include the bracket to match it exactly.">
            <Field label="Name to match">
              <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} autoCapitalize="words" autoComplete="off" />
            </Field>
          </Group>

          <Group title="Reading service" footer={providerFooter(providers, automaticProvider)}>
            <div role="radiogroup" aria-label="Reading service" className="grid grid-cols-3 gap-1 p-1.5">
              {PROVIDER_CHOICES.map((choice) => {
                const missing = choice !== "auto" && !providers[choice];
                const selected = form.provider === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={missing && !selected}
                    onClick={() => set("provider", choice)}
                    className={`min-h-11 rounded-lg px-2 py-1.5 text-[15px] font-medium disabled:opacity-40 ${
                      selected ? "bg-accent text-white" : "bg-fill text-ink"
                    }`}
                  >
                    {PROVIDER_LABELS[choice]}
                    {missing && <span className="block text-[11px] font-normal">no key</span>}
                  </button>
                );
              })}
            </div>
          </Group>

          <Group title="Events" footer="The address is optional; with it, Calendar can show the venue on a map.">
            <StackedField label="Shift title">
              <input className={stackedInputClass} value={form.shiftTitle} onChange={(e) => set("shiftTitle", e.target.value)} />
            </StackedField>
            <StackedField label="Venue">
              <input className={stackedInputClass} value={form.venueName} onChange={(e) => set("venueName", e.target.value)} />
            </StackedField>
            <StackedField label="Address">
              <input
                className={stackedInputClass}
                value={form.venueAddress}
                placeholder="Street, suburb (optional)"
                onChange={(e) => set("venueAddress", e.target.value)}
                autoComplete="street-address"
              />
            </StackedField>
          </Group>

          <Group
            title="Travel and reminders"
            footer={
              form.travelStyle === "combined"
                ? "Travel is the shift event's Travel Time in iPhone Calendar (shown above the shift). Reminders count back from when travel starts."
                : "Travel is its own event that ends when the shift starts, and carries the reminders. Reminders count back from when travel starts."
            }
          >
            <TravelTime value={form.travelMinutes} onChange={(value) => set("travelMinutes", value)} />
            <div>
              <p className="px-4 pt-2.5 text-[13px] text-ink2">Travel in the calendar</p>
              <div role="radiogroup" aria-label="Travel in the calendar" className="grid grid-cols-2 gap-1 p-1.5">
                {TRAVEL_STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    role="radio"
                    aria-checked={form.travelStyle === style}
                    onClick={() => set("travelStyle", style)}
                    className={`min-h-11 rounded-lg px-2 text-[15px] font-medium ${
                      form.travelStyle === style ? "bg-accent text-white" : "bg-fill text-ink"
                    }`}
                  >
                    {TRAVEL_STYLE_LABELS[style]}
                  </button>
                ))}
              </div>
            </div>
            {form.travelStyle === "separate" && (
              <StackedField label="Travel event title">
                <input className={stackedInputClass} value={form.travelTitle} onChange={(e) => set("travelTitle", e.target.value)} />
              </StackedField>
            )}
            {form.reminders.map((reminder, index) => (
              <div key={index} className="space-y-0 px-4 py-2">
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={reminder.enabled}
                    onChange={(e) => setReminder(index, { enabled: e.target.checked })}
                    className="size-5 accent-[var(--accent)]"
                  />
                  <span className="flex-1 text-[15px]">Reminder {index + 1}</span>
                  <input
                    className="h-11 w-16 bg-transparent text-right text-ink outline-none disabled:text-ink3"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1440}
                    disabled={!reminder.enabled}
                    value={reminder.minutes}
                    onChange={(e) => setReminder(index, { minutes: e.target.value })}
                    aria-label={`Reminder ${index + 1} minutes before travel`}
                  />
                  <span className="text-[15px] text-ink2">min before travel</span>
                </label>
                <input
                  className="h-11 w-full rounded-lg bg-fill px-3 text-ink outline-none disabled:text-ink3"
                  value={reminder.message}
                  disabled={!reminder.enabled}
                  onChange={(e) => setReminder(index, { message: e.target.value })}
                  aria-label={`Reminder ${index + 1} message`}
                />
              </div>
            ))}
          </Group>

          <Group title="Time zone" footer="Shift times on the roster are in this zone. Daylight saving is applied automatically.">
            <Field label="Zone">
              <select className={`${inputClass} appearance-none`} value={form.timeZone} onChange={(e) => set("timeZone", e.target.value)}>
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Field>
          </Group>

          <Group title="Function codes" footer="The event codes above the staff rows (e.g. “195P DDPCT”). They are never shifts.">
            <label className="flex min-h-11 items-center gap-3 px-4">
              <span className="flex-1 text-[15px]">Add to shift notes</span>
              <input
                type="checkbox"
                checked={form.includeFunctionCodes}
                onChange={(e) => set("includeFunctionCodes", e.target.checked)}
                className="size-5 accent-[var(--accent)]"
              />
            </label>
          </Group>

          <div className="space-y-2">
            <button type="button" onClick={() => setForm(toForm(DEFAULT_SETTINGS))} className="h-11 w-full rounded-xl bg-card text-[17px] text-accent">
              Restore defaults
            </button>
            <button type="button" onClick={signOut} className="h-11 w-full rounded-xl bg-card text-[17px] text-danger">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
