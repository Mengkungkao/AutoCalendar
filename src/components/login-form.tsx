"use client";

import { useState } from "react";
import { CalendarIcon } from "./icons";

export function LoginForm({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        window.location.replace("/");
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't sign in. Try again.");
    } catch {
      setError("No connection. Check your internet and try again.");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 pb-[max(env(safe-area-inset-bottom),24px)] pt-[max(env(safe-area-inset-top),24px)]">
      <div className="mb-8 flex flex-col items-center text-center">
        <CalendarIcon className="mb-4 size-16 text-accent" />
        <h1 className="text-[28px] font-bold tracking-tight">AutoCalendar</h1>
        <p className="mt-1 text-[15px] text-ink2">Roster screenshot to calendar, with travel and reminders.</p>
      </div>
      {configured ? (
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block px-4 text-[13px] uppercase tracking-wide text-ink3">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12 w-full rounded-xl bg-card px-4 text-ink outline-none ring-accent focus:ring-2"
            />
          </label>
          {error && (
            <p role="alert" className="px-4 text-[15px] text-danger">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || password.length === 0}
            className="h-[50px] w-full rounded-xl bg-accent text-[17px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </form>
      ) : (
        <div role="alert" className="rounded-xl bg-card p-4 text-[15px] leading-snug">
          <p className="font-semibold">This site isn&apos;t set up yet.</p>
          <p className="mt-1 text-ink2">
            Set <code className="rounded bg-fill px-1">APP_PASSWORD</code>, and <code className="rounded bg-fill px-1">ANTHROPIC_API_KEY</code> or{" "}
            <code className="rounded bg-fill px-1">OPENAI_API_KEY</code>, in the server&apos;s environment variables, then reload. The README
            explains how.
          </p>
        </div>
      )}
    </main>
  );
}
