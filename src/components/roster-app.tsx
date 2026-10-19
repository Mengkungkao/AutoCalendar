"use client";

import { useEffect, useRef, useState } from "react";
import { dayEntries, toDraft, type DayEntry } from "@/lib/days";
import { downloadHref } from "@/lib/download";
import { weekFileName } from "@/lib/plan";
import { ImageError, prepareImage } from "@/lib/prepare-image";
import type { RosterResult } from "@/lib/roster";
import { PROVIDER_LABELS, type Provider, type ProviderChoice, type ReaderInfo, type Settings } from "@/lib/settings";
import { formatDayLabel, wallTimeToInstant } from "@/lib/time";
import { zoneAbbreviation } from "@/lib/vtimezone";
import { MAX_FILE_BYTES, formatMegabytes } from "@/lib/upload";
import { DayCard } from "./day-card";
import { AlertIcon, DownloadIcon, GearIcon, PhotoIcon, SpinnerIcon } from "./icons";
import { SettingsSheet } from "./settings-sheet";

type Roster = Extract<RosterResult, { ok: true }>;

/** The settings a read used, to notice when Settings change afterwards. */
type ReadWith = { name: string; choice: ProviderChoice };

type Phase =
  | { name: "idle" }
  | { name: "preparing" }
  | { name: "reading" }
  | {
      name: "error";
      message: string;
      hints: string[];
      staffNames: string[];
      /** "retry": a hiccup worth retrying; "roster": the roster didn't fit (name, dates); "image": the file itself. */
      kind: "retry" | "roster" | "image";
      tried: ReadWith;
      reader: ReaderInfo | null;
    }
  | { name: "done" };

type ExtractResponse = RosterResult & { reader?: ReaderInfo; error?: string };
type Saved = { roster: Roster; days: DayEntry[]; confirmed: string[]; readWith: ReadWith; reader: ReaderInfo | null };

// The preview (not the image) survives a reload in this tab only.
const SESSION_KEY = "autocalendar:preview:v2";

const readerLabel = (reader: ReaderInfo) => `${PROVIDER_LABELS[reader.provider]} (${reader.model})`;

type Props = {
  initialSettings: Settings;
  /** Which reading services the server has keys for. */
  providers: Record<Provider, boolean>;
  /** What "Automatic" resolves to on this server, or null when no key is set. */
  automaticProvider: Provider | null;
  /** The largest upload the server can take (smaller on Vercel). */
  uploadLimit: number;
};

export function RosterApp({ initialSettings, providers, automaticProvider, uploadLimit }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [roster, setRoster] = useState<Roster | null>(null);
  const [days, setDays] = useState<DayEntry[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [readWith, setReadWith] = useState<ReadWith | null>(null);
  const [reader, setReader] = useState<ReaderInfo | null>(null);
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as Saved | null;
      if (!saved?.roster?.ok) return;
      // Restoring browser-only state after hydration; there is no external store to subscribe to.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoster(saved.roster);
      setDays(saved.days);
      setConfirmed(saved.confirmed);
      setReadWith(saved.readWith);
      setReader(saved.reader);
      setPhase({ name: "done" });
    } catch {
      // Storage unavailable (private mode) or unreadable: start fresh.
    }
  }, []);

  useEffect(() => {
    try {
      if (roster && readWith) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roster, days, confirmed, readWith, reader } satisfies Saved));
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // Not saving is fine; the preview just won't survive a reload.
    }
  }, [roster, days, confirmed, readWith, reader]);

  const changedSince = (used: ReadWith | null) =>
    used !== null && (used.name !== settings.name || used.choice !== settings.provider);

  async function read(blob: Blob) {
    const tried: ReadWith = { name: settings.name, choice: settings.provider };
    setPhase({ name: "reading" });
    const form = new FormData();
    form.append("image", blob, blob.type === "image/png" ? "roster.png" : "roster.jpg");
    form.append("name", tried.name);
    form.append("provider", tried.choice);
    form.append("timeZone", settings.timeZone);
    const failed = (message: string, kind: "retry" | "roster", rest: Partial<Extract<Phase, { name: "error" }>> = {}) =>
      setPhase({ name: "error", message, hints: [], staffNames: [], kind, tried, reader: null, ...rest });
    try {
      const response = await fetch("/api/extract", { method: "POST", body: form });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const body = (await response.json().catch(() => null)) as ExtractResponse | null;
      if (!response.ok || !body || body.error) {
        failed(body?.error ?? "The roster couldn't be read. Try again.", "retry");
        return;
      }
      if (!body.ok) {
        failed(body.message, "roster", { hints: body.hints, staffNames: body.staffNames, reader: body.reader ?? null });
        return;
      }
      setRoster(body);
      setDays(dayEntries(body));
      setConfirmed([]);
      setReadWith(tried);
      setReader(body.reader ?? null);
      setPhase({ name: "done" });
    } catch {
      failed("No connection. Check your internet and try again.", "retry");
    }
  }

  async function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setRoster(null);
    setDays([]);
    setPhase({ name: "preparing" });
    try {
      const blob = await prepareImage(file, uploadLimit);
      if (image) URL.revokeObjectURL(image.url);
      setImage({ blob, url: URL.createObjectURL(blob) });
      await read(blob);
    } catch (error) {
      setImage(null);
      setPhase({
        name: "error",
        message: error instanceof ImageError ? error.message : "This file couldn't be opened. Use a PNG, JPG or HEIC image.",
        hints: [],
        staffNames: [],
        kind: "image",
        tried: { name: settings.name, choice: settings.provider },
        reader: null,
      });
    }
  }

  const chooseFile = () => fileInput.current?.click();
  const shifts = days.flatMap((day) => day.shifts);
  const toCheck = days.filter((day) => day.checks.length > 0 && !confirmed.includes(day.dateISO));
  const busy = phase.name === "preparing" || phase.name === "reading";

  return (
    <main className="mx-auto max-w-xl px-4 pb-[max(env(safe-area-inset-bottom),32px)] pt-[max(env(safe-area-inset-top),12px)]">
      <header className="flex items-end justify-between gap-3 pb-4 pt-4">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink3">Roster to Calendar</p>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">AutoCalendar</h1>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="mb-1 flex size-11 items-center justify-center rounded-full bg-card text-accent"
        >
          <GearIcon className="size-6" />
        </button>
      </header>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/heic,image/heif,.heic,.heif,.png,.jpg,.jpeg"
        onChange={onFileChosen}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />

      {phase.name === "idle" && (
        <>
          <button
            type="button"
            onClick={chooseFile}
            className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-3xl bg-accent text-white active:opacity-80"
          >
            <PhotoIcon className="size-12" />
            <span className="text-[22px] font-semibold">Upload roster</span>
            <span className="text-[15px] text-white/80">Photo or screenshot · PNG, JPG or HEIC · up to {formatMegabytes(MAX_FILE_BYTES)}</span>
          </button>
          <p className="mt-4 px-2 text-[15px] leading-snug text-ink2">
            Finds the row for <span className="font-semibold text-ink">{settings.name}</span>, shows each shift with a{" "}
            {settings.travelMinutes}-minute travel event and its reminders, then gives you calendar files to add.
          </p>
        </>
      )}

      {busy && (
        <div className="flex flex-col items-center rounded-3xl bg-card px-4 py-8 text-center" role="status" aria-live="polite">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a remote image
            <img src={image.url} alt="Your roster" className="mb-5 max-h-40 rounded-lg object-contain shadow-sm" />
          )}
          <SpinnerIcon className="size-8 text-accent" />
          <p className="mt-3 text-[17px] font-semibold">{phase.name === "preparing" ? "Preparing the image…" : "Reading your roster…"}</p>
          <p className="mt-1 text-[15px] text-ink2">This usually takes 20–40 seconds.</p>
        </div>
      )}

      {phase.name === "error" && (
        <div className="rounded-3xl bg-card p-4" role="alert">
          <div className="flex gap-3">
            <AlertIcon className="mt-0.5 size-6 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-[17px] font-semibold leading-snug">{phase.message}</p>
              {phase.hints.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-snug text-ink2">
                  {phase.hints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              )}
              {phase.staffNames.length > 0 && (
                <p className="mt-2 text-[14px] leading-snug text-ink3">Names read from the roster: {phase.staffNames.join(", ")}</p>
              )}
              {phase.reader && <p className="mt-1 text-[14px] text-ink3">Read by {readerLabel(phase.reader)}</p>}
            </div>
          </div>
          <ErrorActions
            kind={phase.kind}
            canReread={image !== null}
            settingsChanged={changedSince(phase.tried)}
            onReread={() => image && read(image.blob)}
            onSettings={() => setSettingsOpen(true)}
            onChooseFile={chooseFile}
          />
        </div>
      )}

      {phase.name === "done" && roster && (
        <div className="space-y-4">
          <section className="rounded-3xl bg-card p-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-ink3">
              Week of {formatDayLabel(roster.weekStart)} · times in{" "}
              {zoneAbbreviation(wallTimeToInstant(roster.weekStart, 12 * 60, settings.timeZone), settings.timeZone)}
            </p>
            <p className="mt-0.5 text-[17px] font-semibold leading-snug">{roster.title ?? "Weekly roster"}</p>
            <p className="mt-0.5 text-[15px] text-ink2">
              Row: {roster.matchedName} · {shifts.length} {shifts.length === 1 ? "shift" : "shifts"}
            </p>
            {reader && <p className="text-[13px] text-ink3">Read by {readerLabel(reader)}</p>}
            <a
              href={shifts.length > 0 ? downloadHref(weekFileName(roster.weekStart), settings, shifts.map(toDraft)) : undefined}
              aria-disabled={shifts.length === 0}
              className={`mt-4 flex h-[54px] items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-semibold text-white ${shifts.length === 0 ? "pointer-events-none opacity-40" : ""}`}
            >
              <DownloadIcon className="size-5" />
              Add all {shifts.length} {shifts.length === 1 ? "shift" : "shifts"} (one file)
            </a>
            {toCheck.length > 0 && (
              <p className="mt-2 text-center text-[14px] text-warn">
                Check the {toCheck.length === 1 ? "day" : `${toCheck.length} days`} marked in orange first.
              </p>
            )}
            <button type="button" onClick={chooseFile} className="mt-2 h-11 w-full rounded-xl text-[15px] font-medium text-accent">
              Upload a different roster
            </button>
          </section>

          {changedSince(readWith) && readWith && (
            <div className="rounded-2xl bg-accent-soft p-4 text-[15px] leading-snug">
              Settings changed since this roster was read
              {readWith.name !== settings.name ? ` (it was read for “${readWith.name}”)` : ""}.
              {image ? (
                <button type="button" onClick={() => read(image.blob)} className="mt-2 block h-11 font-semibold text-accent">
                  Read again with the new settings
                </button>
              ) : (
                <span> Upload the roster again to use them.</span>
              )}
            </div>
          )}

          {roster.warnings.length > 0 && (
            <div className="rounded-2xl bg-warn-soft p-4">
              <div className="flex gap-2 text-[15px] leading-snug text-warn">
                <AlertIcon className="mt-0.5 size-5 shrink-0" />
                <ul className="space-y-1">
                  {roster.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <h2 className="px-1 pt-2 text-[20px] font-bold">This week</h2>
          <div className="space-y-3">
            {days.map((day) => (
              <DayCard
                key={day.dateISO}
                day={day}
                settings={settings}
                needsCheck={!confirmed.includes(day.dateISO)}
                onChange={(next) => {
                  setDays((current) => current.map((item) => (item.dateISO === next.dateISO ? next : item)));
                  setConfirmed((current) => (current.includes(next.dateISO) ? current : [...current, next.dateISO]));
                }}
                onConfirm={() => setConfirmed((current) => [...current, day.dateISO])}
              />
            ))}
          </div>

          <section className="rounded-2xl bg-card p-4 text-[15px] leading-snug">
            <h2 className="text-[17px] font-semibold">Adding to iPhone Calendar</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-ink2">
              <li>Tap <span className="font-medium text-ink">Add all</span>, or <span className="font-medium text-ink">Download</span> on one shift.</li>
              <li>Safari shows the events: tap <span className="font-medium text-ink">Add All</span> and pick a calendar.</li>
              <li>If the file downloads instead, tap it in Downloads (or the Files app), choose Calendar, then Add All.</li>
            </ol>
            <p className="mt-2 text-ink3">
              {settings.travelStyle === "combined"
                ? `Each shift is one event with ${settings.travelMinutes} minutes of travel time and its reminders. Times are in ${settings.timeZone.replace(/_/g, " ")} time.`
                : `Each shift file has two events: the shift, and the travel event with its reminders. Times are in ${settings.timeZone.replace(/_/g, " ")} time.`}
            </p>
          </section>
        </div>
      )}

      <p className="mt-8 px-2 text-center text-[13px] leading-snug text-ink3">
        Roster images are read once and not stored. To read the table they are sent to Anthropic (Claude) or OpenAI, whichever
        Settings choose.
      </p>

      {settingsOpen && (
        <SettingsSheet
          settings={settings}
          providers={providers}
          automaticProvider={automaticProvider}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => {
            setSettings(next);
            setSettingsOpen(false);
          }}
        />
      )}
    </main>
  );
}

type ErrorActionsProps = {
  kind: "retry" | "roster" | "image";
  canReread: boolean;
  settingsChanged: boolean;
  onReread: () => void;
  onSettings: () => void;
  onChooseFile: () => void;
};

/** The big blue button is the most useful next step: retry a hiccup, fix the name, or pick another file. */
function ErrorActions({ kind, canReread, settingsChanged, onReread, onSettings, onChooseFile }: ErrorActionsProps) {
  const primary = "h-[50px] rounded-xl bg-accent text-[17px] font-semibold text-white";
  const secondary = "h-[50px] rounded-xl bg-fill text-[17px] font-medium text-accent";
  const rereadFirst = canReread && (kind === "retry" || settingsChanged);
  const settingsFirst = !rereadFirst && kind === "roster";
  return (
    <div className="mt-4 grid gap-2">
      {rereadFirst && (
        <button type="button" onClick={onReread} className={primary}>
          Read again{settingsChanged ? " with the new settings" : ""}
        </button>
      )}
      {kind !== "image" && (
        <button type="button" onClick={onSettings} className={settingsFirst ? primary : secondary}>
          {kind === "roster" ? "Change name in Settings" : "Settings"}
        </button>
      )}
      <button type="button" onClick={onChooseFile} className={rereadFirst || settingsFirst ? secondary : primary}>
        Choose another image
      </button>
      {canReread && !rereadFirst && (
        <button type="button" onClick={onReread} className={secondary}>
          Read again
        </button>
      )}
    </div>
  );
}
