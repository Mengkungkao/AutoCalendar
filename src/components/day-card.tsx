"use client";

import { useState } from "react";
import { newShift, rosterStyle, toDraft, type DayEntry, type EditableShift } from "@/lib/days";
import { downloadHref } from "@/lib/download";
import { planShift } from "@/lib/plan";
import type { Settings } from "@/lib/settings";
import { inputValueToMinutes, minutesToInputValue } from "@/lib/time";
import { AlertIcon, BellIcon, BriefcaseIcon, CarIcon, DownloadIcon, PlusIcon } from "./icons";

type Props = {
  day: DayEntry;
  settings: Settings;
  needsCheck: boolean;
  onChange: (day: DayEntry) => void;
  onConfirm: () => void;
};

/** End times wrap to the next day when they are not after the start (1600 → 0300 is 2700). */
function endAfter(start: number, end: number): number {
  const wall = end % 1440;
  return wall <= start ? wall + 1440 : wall;
}

export function DayCard({ day, settings, needsCheck, onChange, onConfirm }: Props) {
  const update = (shifts: EditableShift[]) => onChange({ ...day, shifts });

  return (
    <section aria-label={day.label} className="overflow-hidden rounded-2xl bg-card">
      {day.shifts.length === 0 ? (
        <div className="flex min-h-[60px] items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">{day.label}</p>
            <p className="text-[15px] text-ink2">{day.noShift} · no calendar file</p>
          </div>
          <button
            type="button"
            onClick={() => update([newShift(day)])}
            className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-fill px-4 text-[15px] font-medium text-accent"
          >
            <PlusIcon className="size-4" />
            Add shift
          </button>
        </div>
      ) : (
        day.shifts.map((shift, index) => (
          <ShiftBlock
            key={shift.id}
            day={day}
            shift={shift}
            settings={settings}
            showDivider={index > 0}
            onChange={(next) => update(day.shifts.map((item) => (item.id === shift.id ? next : item)))}
            onRemove={() => update(day.shifts.filter((item) => item.id !== shift.id))}
          />
        ))
      )}

      {needsCheck && day.checks.length > 0 && (
        <div className="border-t border-line bg-warn-soft px-4 py-3">
          <div className="flex gap-2 text-[14px] leading-snug text-warn">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <ul className="space-y-1">
              {day.checks.map((check) => (
                <li key={check}>{check}</li>
              ))}
              {day.cellText !== null && <li className="text-ink2">Roster cell: “{day.cellText.trim() || "empty"}”</li>}
            </ul>
          </div>
          <button type="button" onClick={onConfirm} className="mt-2 h-11 rounded-full bg-card px-4 text-[15px] font-medium text-accent">
            Looks right
          </button>
        </div>
      )}
    </section>
  );
}

type ShiftProps = {
  day: DayEntry;
  shift: EditableShift;
  settings: Settings;
  showDivider: boolean;
  onChange: (shift: EditableShift) => void;
  onRemove: () => void;
};

function ShiftBlock({ day, shift, settings, showDivider, onChange, onRemove }: ShiftProps) {
  const [editing, setEditing] = useState(shift.rosterText === null);
  const plan = planShift(toDraft(shift), settings);
  const edit = (changes: Partial<EditableShift>) => onChange({ ...shift, ...changes, edited: true });

  const source = shift.rosterText
    ? shift.edited
      ? `Edited · roster said ${shift.rosterText}`
      : `Roster: ${shift.rosterText}`
    : "Added by you";

  return (
    <div className={showDivider ? "border-t border-line" : undefined}>
      <div className="px-4 pb-3 pt-3.5">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink3">
          {plan.dayLabel}
          {day.shifts.length > 1 && ` · shift ${shift.slot + 1}`}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[22px] font-semibold tracking-tight">
          <BriefcaseIcon className="size-5 shrink-0 text-accent" />
          {plan.display.shift}
        </p>
        <p className="mt-0.5 text-[14px] text-ink2">
          {source}
          {shift.note && ` · ${shift.note}`}
        </p>
        {settings.includeFunctionCodes && shift.functions && (
          <p className="mt-0.5 text-[14px] text-ink2">Functions: {shift.functions}</p>
        )}
      </div>

      <dl className="mx-4 divide-y divide-line border-t border-line text-[15px]">
        <div className="flex items-center gap-3 py-2.5">
          <CarIcon className="size-5 shrink-0 text-ink3" />
          <dt className="w-[76px] shrink-0 text-ink2">Travel</dt>
          <dd className="font-medium">{plan.display.travel}</dd>
        </div>
        {plan.display.reminders.map((reminder, index) => (
          <div key={index} className="flex items-center gap-3 py-2.5">
            <BellIcon className="size-5 shrink-0 text-ink3" />
            <dt className="w-[76px] shrink-0 font-medium">{reminder.time}</dt>
            <dd className="min-w-0 text-ink2">{reminder.message}</dd>
          </div>
        ))}
      </dl>

      {editing && (
        <div className="mx-4 space-y-3 border-t border-line py-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[13px] text-ink2">Starts</span>
              <input
                type="time"
                value={minutesToInputValue(shift.start)}
                onChange={(event) => {
                  const start = inputValueToMinutes(event.target.value);
                  if (start !== null) edit({ start, end: endAfter(start, shift.end) });
                }}
                className="w-full rounded-xl bg-fill px-3 text-ink"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] text-ink2">Ends{shift.end > 1440 ? " (next day)" : ""}</span>
              <input
                type="time"
                value={minutesToInputValue(shift.end)}
                onChange={(event) => {
                  const end = inputValueToMinutes(event.target.value);
                  if (end !== null) edit({ end: endAfter(shift.start, end) });
                }}
                className="w-full rounded-xl bg-fill px-3 text-ink"
              />
            </label>
          </div>
          <p className="text-[13px] text-ink3">
            Roster style {rosterStyle(shift)}. An end time before the start means the next day.
          </p>
          <label className="block">
            <span className="mb-1 block text-[13px] text-ink2">Note</span>
            <input
              type="text"
              value={shift.note ?? ""}
              maxLength={200}
              placeholder="e.g. Purchasing"
              onChange={(event) => edit({ note: event.target.value })}
              className="h-11 w-full rounded-xl bg-fill px-3 text-ink placeholder:text-ink3"
            />
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={onRemove} className="h-11 flex-1 rounded-full bg-danger-soft text-[15px] font-medium text-danger">
              Remove shift
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-11 flex-1 rounded-full bg-fill text-[15px] font-semibold text-accent">
              Done
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3 px-4 pb-4 pt-1">
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="h-11 flex-1 rounded-full bg-fill text-[15px] font-medium text-accent">
            Edit
          </button>
        )}
        <a
          href={downloadHref(plan.fileName, settings, [toDraft(shift)])}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-accent-soft text-[15px] font-semibold text-accent"
          aria-label={`Download ${plan.fileName}`}
        >
          <DownloadIcon className="size-4" />
          Download
        </a>
      </div>
    </div>
  );
}
